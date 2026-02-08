/**
 * ProductService using DynamoDB repositories
 * Provides full API compatibility with the original TypeORM-based service
 */

import { config } from '../../config';
import { 
  ProductRepository, 
  ProductImageRepository, 
  ProductVariantRepository,
  CategoryRepository,
  Product,
  ProductImage,
  ProductVariant,
  Category,
  ProductFilters
} from '../../repositories';

export { ProductFilters };

// Re-export types for compatibility
export { Product, ProductImage, ProductVariant, Category };

export enum ProductStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

export class ProductServiceDynamo {
  
  /**
   * List products with filters and pagination
   */
  async listProducts(filters: ProductFilters = {}, page: number = 1, perPage: number = 20): Promise<{ products: Product[]; total: number }> {
    const result = await ProductRepository.findAll(filters, page, perPage);
    
    // Populate images and variants for each product
    const productsWithRelations = await Promise.all(
      result.products.map(async (product) => {
        const [images, variants] = await Promise.all([
          ProductImageRepository.findByProductId(product.id),
          ProductVariantRepository.findByProductId(product.id),
        ]);
        return { ...product, images, variants };
      })
    );

    // Filter by category if specified
    if (filters.category) {
      const category = await CategoryRepository.findBySlug(filters.category);
      if (category) {
        const productIdsInCategory = await CategoryRepository.getProducts(category.id);
        const filteredProducts = productsWithRelations.filter(p => 
          productIdsInCategory.includes(p.id)
        );
        return { products: filteredProducts, total: filteredProducts.length };
      }
    }

    return { products: productsWithRelations, total: result.total };
  }

  /**
   * Get product by ID with all relations
   */
  async getProductById(id: number): Promise<Product | null> {
    return ProductRepository.findByIdWithRelations(id);
  }

  /**
   * Get product by slug with all relations
   */
  async getProductBySlug(slug: string): Promise<Product | null> {
    const product = await ProductRepository.findBySlug(slug);
    if (!product) return null;
    return ProductRepository.findByIdWithRelations(product.id);
  }

  /**
   * Create a new product
   */
  async createProduct(data: Partial<Product>): Promise<Product> {
    const productData = {
      slug: data.slug!,
      title: data.title!,
      short_description: data.short_description,
      long_description: data.long_description,
      base_price: data.base_price || 0,
      currency: data.currency || 'EUR',
      sku: data.sku,
      gtin: data.gtin,
      status: data.status || ProductStatus.DRAFT,
      character_id: data.character_id,
      character_value: data.character_value,
      etsy_link: data.etsy_link,
    };

    const product = await ProductRepository.create(productData);
    return product;
  }

  /**
   * Update a product
   */
  async updateProduct(id: number, data: Partial<Product>): Promise<Product> {
    await ProductRepository.update(id, data);
    const product = await this.getProductById(id);
    if (!product) {
      throw new Error(`Product with id ${id} not found`);
    }
    return product;
  }

  /**
   * Delete a product (soft delete)
   */
  async deleteProduct(id: number): Promise<void> {
    await ProductRepository.softDelete(id);
  }

  // ==================== Product Variants ====================

  /**
   * Add a variant to a product
   */
  async addVariant(productId: number, data: Partial<ProductVariant>): Promise<ProductVariant> {
    const product = await ProductRepository.findById(productId);
    if (!product) {
      throw new Error(`Product with id ${productId} not found`);
    }

    return ProductVariantRepository.create({
      product_id: productId,
      sku: data.sku,
      name: data.name || 'Default',
      attributes: data.attributes,
      price_adjustment: data.price_adjustment || 0,
      stock: data.stock || 0,
    });
  }

  /**
   * Update a variant
   */
  async updateVariant(id: number, data: Partial<ProductVariant>): Promise<ProductVariant> {
    // First find the variant to get product_id
    const variant = await ProductVariantRepository.findById(id);
    if (!variant) {
      throw new Error(`Variant with id ${id} not found`);
    }
    return ProductVariantRepository.update(variant.product_id, id, data);
  }

  /**
   * Update inventory for multiple variants
   */
  async updateInventory(adjustments: Array<{ variantId: number; quantity: number }>): Promise<void> {
    if (adjustments.length === 0) return;

    // Group adjustments by variant
    const adjustmentMap = new Map<number, number>();
    adjustments.forEach(adj => {
      const current = adjustmentMap.get(adj.variantId) || 0;
      adjustmentMap.set(adj.variantId, current + adj.quantity);
    });

    // Apply each adjustment
    for (const [variantId, quantity] of adjustmentMap) {
      const variant = await ProductVariantRepository.findById(variantId);
      if (variant) {
        await ProductVariantRepository.updateStock(variant.product_id, variantId, quantity);
      }
    }
  }

  /**
   * Get variants for a product
   */
  async getVariants(productId: number): Promise<ProductVariant[]> {
    return ProductVariantRepository.findByProductId(productId);
  }

  // ==================== Product Images ====================

  /**
   * List images for a product
   */
  async listImages(productId: number): Promise<ProductImage[]> {
    return ProductImageRepository.findByProductId(productId);
  }

  /**
   * Add an image to a product
   */
  async addImage(productId: number, url: string, altText?: string, position?: number): Promise<ProductImage> {
    const product = await ProductRepository.findById(productId);
    if (!product) {
      throw new Error(`Product with id ${productId} not found`);
    }

    // Get current images to determine position
    let finalPosition = position;
    if (finalPosition === undefined) {
      const images = await ProductImageRepository.findByProductId(productId);
      finalPosition = images.length;
    }

    return ProductImageRepository.create({
      product_id: productId,
      url,
      alt_text: altText,
      position: finalPosition,
    });
  }

  /**
   * Update an image
   */
  async updateImage(productId: number, imageId: number, data: { position?: number; alt_text?: string }): Promise<ProductImage> {
    return ProductImageRepository.update(productId, imageId, data);
  }

  /**
   * Delete an image
   */
  async deleteImage(productId: number, imageId: number): Promise<void> {
    await ProductImageRepository.delete(productId, imageId);
  }

  // ==================== Categories ====================

  /**
   * Add category to product
   */
  async addCategoryToProduct(productId: number, categoryId: number): Promise<void> {
    await CategoryRepository.addProduct(categoryId, productId);
  }

  /**
   * Remove category from product
   */
  async removeCategoryFromProduct(productId: number, categoryId: number): Promise<void> {
    await CategoryRepository.removeProduct(categoryId, productId);
  }

  /**
   * Get categories for a product
   */
  async getProductCategories(productId: number): Promise<Category[]> {
    const product = await ProductRepository.findByIdWithRelations(productId);
    return product?.categories || [];
  }
}

// Export singleton instance for backward compatibility
export const productServiceDynamo = new ProductServiceDynamo();
