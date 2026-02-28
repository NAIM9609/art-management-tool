import { Repository, FindOptionsWhere, ILike, In } from 'typeorm';
import { AppDataSource } from '../database/connection';
import { EnhancedProduct, ProductStatus } from '../entities/EnhancedProduct';
import { ProductVariant } from '../entities/ProductVariant';
import { ProductImage } from '../entities/ProductImage';
import { Category } from '../entities/Category';
import { AuditService } from './AuditService';

export interface ProductFilters {
  category?: string;
  status?: ProductStatus;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
}

export class ProductService {
  private productRepo: Repository<EnhancedProduct>;
  private variantRepo: Repository<ProductVariant>;
  private imageRepo: Repository<ProductImage>;
  private categoryRepo: Repository<Category>;
  private auditService: AuditService;

  constructor(auditService?: AuditService) {
    this.productRepo = AppDataSource.getRepository(EnhancedProduct);
    this.variantRepo = AppDataSource.getRepository(ProductVariant);
    this.imageRepo = AppDataSource.getRepository(ProductImage);
    this.categoryRepo = AppDataSource.getRepository(Category);
    this.auditService = auditService || new AuditService();
  }

  async listProducts(filters: ProductFilters = {}, page: number = 1, perPage: number = 20): Promise<{ products: EnhancedProduct[]; total: number }> {
    const queryBuilder = this.productRepo.createQueryBuilder('product')
      .leftJoinAndSelect('product.categories', 'category')
      .leftJoinAndSelect('product.images', 'image')
      .leftJoinAndSelect('product.variants', 'variant');

    if (filters.status) {
      queryBuilder.andWhere('product.status = :status', { status: filters.status });
    }

    if (filters.search) {
      queryBuilder.andWhere('product.title ILIKE :search', { search: `%${filters.search}%` });
    }

    if (filters.minPrice !== undefined) {
      queryBuilder.andWhere('product.base_price >= :minPrice', { minPrice: filters.minPrice });
    }

    if (filters.maxPrice !== undefined) {
      queryBuilder.andWhere('product.base_price <= :maxPrice', { maxPrice: filters.maxPrice });
    }

    if (filters.category) {
      queryBuilder.andWhere('category.slug = :category', { category: filters.category });
    }

    const [products, total] = await queryBuilder
      .skip((page - 1) * perPage)
      .take(perPage)
      .getManyAndCount();

    return { products, total };
  }

  async getProductById(id: number): Promise<EnhancedProduct | null> {
    return this.productRepo.findOne({
      where: { id },
      relations: ['categories', 'images', 'variants'],
    });
  }

  async getProductBySlug(slug: string): Promise<EnhancedProduct | null> {
    return this.productRepo.findOne({
      where: { slug },
      relations: ['categories', 'images', 'variants'],
    });
  }

  async createProduct(data: Partial<EnhancedProduct>, userId?: string): Promise<EnhancedProduct> {
    const product = this.productRepo.create(data);
    const savedProduct = await this.productRepo.save(product);

    // Log audit trail
    if (userId) {
      await this.auditService.logAction(
        userId,
        'CREATE',
        'Product',
        savedProduct.id.toString(),
        { title: savedProduct.title, slug: savedProduct.slug, status: savedProduct.status }
      ).catch(err => console.error('Failed to log audit action:', err));
    }

    return savedProduct;
  }

  async updateProduct(id: number, data: Partial<EnhancedProduct>, userId?: string): Promise<EnhancedProduct> {
    const oldProduct = await this.getProductById(id);

    await this.productRepo.update(id, data);
    const product = await this.getProductById(id);
    if (!product) {
      throw new Error(`Product with id ${id} not found`);
    }

    // Log audit trail with changes
    if (userId && oldProduct) {
      const changes: Record<string, any> = {};
      if (data.title && data.title !== oldProduct.title) changes.title = { old: oldProduct.title, new: data.title };
      if (data.status && data.status !== oldProduct.status) changes.status = { old: oldProduct.status, new: data.status };
      if (data.base_price && data.base_price !== oldProduct.base_price) changes.base_price = { old: oldProduct.base_price, new: data.base_price };

      if (Object.keys(changes).length > 0) {
        await this.auditService.logAction(
          userId,
          'UPDATE',
          'Product',
          id.toString(),
          changes
        ).catch(err => console.error('Failed to log audit action:', err));
      }
    }

    return product;
  }

  async deleteProduct(id: number, userId?: string): Promise<void> {
    const product = await this.getProductById(id);

    await this.productRepo.softDelete(id);

    // Log audit trail
    if (userId && product) {
      await this.auditService.logAction(
        userId,
        'DELETE',
        'Product',
        id.toString(),
        { title: product.title, slug: product.slug }
      ).catch(err => console.error('Failed to log audit action:', err));
    }
  }

  async addVariant(productId: number, data: Partial<ProductVariant>): Promise<ProductVariant> {
    const variant = this.variantRepo.create({
      ...data,
      product_id: productId,
    });
    return this.variantRepo.save(variant);
  }

  async updateVariant(id: number, data: Partial<ProductVariant>): Promise<ProductVariant> {
    await this.variantRepo.update(id, data);
    return this.variantRepo.findOneOrFail({ where: { id } });
  }

  async updateInventory(adjustments: Array<{ variantId: number; quantity: number }>): Promise<void> {
    if (adjustments.length === 0) {
      return;
    }

    // Extract unique variant IDs and sum adjustments for duplicates
    const adjustmentMap = new Map<number, number>();
    adjustments.forEach(adj => {
      const current = adjustmentMap.get(adj.variantId) || 0;
      adjustmentMap.set(adj.variantId, current + adj.quantity);
    });

    // Fetch all variants in a single query
    const variantIds = Array.from(adjustmentMap.keys());
    const variants = await this.variantRepo.findBy({ id: In(variantIds) });

    // Apply adjustments to each variant
    variants.forEach(variant => {
      const adjustment = adjustmentMap.get(variant.id);
      if (adjustment !== undefined) {
        variant.stock += adjustment;
      }
    });

    // Save all variants in a single transaction
    await AppDataSource.transaction(async (transactionalEntityManager) => {
      await transactionalEntityManager.save(ProductVariant, variants);
    });
  }

  // ==================== Product Images ====================

  async listImages(productId: number): Promise<ProductImage[]> {
    return this.imageRepo.find({
      where: { product_id: productId },
      order: { position: 'ASC' },
    });
  }

  async addImage(productId: number, url: string, altText?: string, position?: number): Promise<ProductImage> {
    const product = await this.getProductById(productId);
    if (!product) {
      throw new Error(`Product with id ${productId} not found`);
    }

    const finalPosition = position ?? (await this.imageRepo.count({ where: { product_id: productId } }));
    const image = this.imageRepo.create({
      product_id: productId,
      url,
      alt_text: altText,
      position: finalPosition,
    });
    return this.imageRepo.save(image);
  }

  async updateImage(productId: number, imageId: number, data: { position?: number; alt_text?: string }): Promise<ProductImage> {
    const image = await this.imageRepo.findOne({ where: { id: imageId, product_id: productId } });
    if (!image) {
      throw new Error(`Image with id ${imageId} not found for product ${productId}`);
    }
    if (data.position !== undefined) image.position = data.position;
    if (data.alt_text !== undefined) image.alt_text = data.alt_text;
    return this.imageRepo.save(image);
  }

  async deleteImage(productId: number, imageId: number): Promise<void> {
    const image = await this.imageRepo.findOne({ where: { id: imageId, product_id: productId } });
    if (!image) {
      throw new Error(`Image with id ${imageId} not found for product ${productId}`);
    }
    await this.imageRepo.remove(image);
  }
}
