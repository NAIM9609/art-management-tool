import { DynamoDBOptimized } from './dynamodb/DynamoDBOptimized';
import { ProductRepository } from './dynamodb/repositories/ProductRepository';
import { ProductVariantRepository } from './dynamodb/repositories/ProductVariantRepository';
import { ProductImageRepository } from './dynamodb/repositories/ProductImageRepository';
import { CategoryRepository } from './dynamodb/repositories/CategoryRepository';
import {
  Product,
  ProductStatus,
  ProductVariant,
  ProductImage,
  Category,
  CreateProductData,
  UpdateProductData,
  CreateProductVariantData,
  UpdateProductVariantData,
  CreateProductImageData,
  UpdateProductImageData,
} from './dynamodb/repositories/types';

// Export ProductStatus for backward compatibility
export { ProductStatus };

export interface ProductFilters {
  category?: string;
  status?: ProductStatus;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
}

// Response type that matches TypeORM entity structure
export interface EnhancedProduct extends Product {
  categories?: Category[];
  images?: ProductImage[];
  variants?: ProductVariant[];
}

export class ProductService {
  private productRepo: ProductRepository;
  private variantRepo: ProductVariantRepository;
  private imageRepo: ProductImageRepository;
  private categoryRepo: CategoryRepository;

  constructor() {
    // Initialize DynamoDB client
    const dynamoDB = new DynamoDBOptimized({
      tableName: process.env.DYNAMODB_TABLE_NAME || 'products',
      region: process.env.AWS_REGION || 'us-east-1',
      maxRetries: 3,
      retryDelay: 100,
    });

    // Initialize repositories
    this.productRepo = new ProductRepository(dynamoDB);
    this.variantRepo = new ProductVariantRepository(dynamoDB);
    this.imageRepo = new ProductImageRepository(dynamoDB);
    this.categoryRepo = new CategoryRepository(dynamoDB);
  }

  async listProducts(filters: ProductFilters = {}, page: number = 1, perPage: number = 20): Promise<{ products: EnhancedProduct[]; total: number }> {
    try {
      // Category filtering: use category-first approach for correct pagination
      if (filters.category) {
        const category = await this.categoryRepo.findBySlug(filters.category);
        if (!category) {
          return { products: [], total: 0 };
        }

        // Get product IDs from category
        const categoryProductIds = await this.categoryRepo.getProducts(category.id);

        // Fetch products by ID
        const products = await Promise.all(
          categoryProductIds.slice(0, perPage).map(id => this.productRepo.findById(id))
        );

        // Filter out nulls and apply status filter if needed
        let filteredProducts = products.filter((p): p is Product => p !== null);
        if (filters.status) {
          filteredProducts = filteredProducts.filter(p => p.status === filters.status);
        }

        // Apply price filters
        if (filters.minPrice !== undefined) {
          filteredProducts = filteredProducts.filter(p => p.base_price >= filters.minPrice!);
        }
        if (filters.maxPrice !== undefined) {
          filteredProducts = filteredProducts.filter(p => p.base_price <= filters.maxPrice!);
        }

        // Enhance products with relations
        const enhancedProducts = await Promise.all(
          filteredProducts.map(async (product) => {
            const [images, variants, categories] = await Promise.all([
              this.imageRepo.findByProductId(product.id),
              this.variantRepo.findByProductId(product.id),
              this.getProductCategories(product.id),
            ]);

            return {
              ...product,
              images,
              variants,
              categories,
            };
          })
        );

        return {
          products: enhancedProducts,
          total: categoryProductIds.length,
        };
      }

      // Calculate limit: fetch enough for pagination
      // For page-based pagination, we need to skip (page - 1) * perPage items
      const limit = page * perPage;

      let result;
      let products: Product[];

      // Handle search with status filter
      if (filters.search && filters.status && filters.status !== ProductStatus.PUBLISHED) {
        // Search only queries PUBLISHED items, so use findByStatus + in-memory filter
        result = await this.productRepo.findByStatus(filters.status, { limit });
        products = result.items.filter(p =>
          p.title.toLowerCase().includes(filters.search!.toLowerCase()) ||
          (p.short_description && p.short_description.toLowerCase().includes(filters.search!.toLowerCase()))
        );
      } else if (filters.search) {
        // Use search for published products
        result = await this.productRepo.search(filters.search, { limit });
        products = result.items;
      } else if (filters.status) {
        // Query by specific status
        result = await this.productRepo.findByStatus(filters.status, { limit });
        products = result.items;
      } else {
        // No status filter: return all statuses (admin case)
        // Fetch all statuses in parallel
        const [publishedResult, draftResult, archivedResult] = await Promise.all([
          this.productRepo.findByStatus(ProductStatus.PUBLISHED, { limit }),
          this.productRepo.findByStatus(ProductStatus.DRAFT, { limit }),
          this.productRepo.findByStatus(ProductStatus.ARCHIVED, { limit }),
        ]);

        // Merge results
        products = [
          ...publishedResult.items,
          ...draftResult.items,
          ...archivedResult.items,
        ];

        // Apply limit after merging to avoid 3x page size
        products = products.slice(0, limit);

        result = {
          items: products,
          count: publishedResult.count + draftResult.count + archivedResult.count,
        };
      }

      // Filter by price range if needed
      if (filters.minPrice !== undefined) {
        products = products.filter(p => p.base_price >= filters.minPrice!);
      }
      if (filters.maxPrice !== undefined) {
        products = products.filter(p => p.base_price <= filters.maxPrice!);
      }

      // Apply pagination offset
      const startIndex = (page - 1) * perPage;
      const paginatedProducts = products.slice(startIndex, startIndex + perPage);

      // Batch fetch related data for all products in parallel
      const enhancedProducts = await Promise.all(
        paginatedProducts.map(async (product) => {
          const [images, variants, categories] = await Promise.all([
            this.imageRepo.findByProductId(product.id),
            this.variantRepo.findByProductId(product.id),
            this.getProductCategories(product.id),
          ]);

          return {
            ...product,
            images,
            variants,
            categories,
          };
        })
      );

      return {
        products: enhancedProducts,
        total: (result as any).count ?? products.length,
      };
    } catch (error: any) {
      throw this.mapError(error);
    }
  }

  async getProductById(id: number): Promise<EnhancedProduct | null> {
    try {
      // Batch get product + images + variants + categories in parallel
      const [product, images, variants, categories] = await Promise.all([
        this.productRepo.findById(id),
        this.imageRepo.findByProductId(id),
        this.variantRepo.findByProductId(id),
        this.getProductCategories(id),
      ]);

      if (!product) {
        return null;
      }

      return {
        ...product,
        images,
        variants,
        categories,
      };
    } catch (error: any) {
      throw this.mapError(error);
    }
  }

  async getProductBySlug(slug: string): Promise<EnhancedProduct | null> {
    try {
      // Use ProductRepository.findBySlug()
      const product = await this.productRepo.findBySlug(slug);

      if (!product) {
        return null;
      }

      // Batch get images + variants + categories in parallel
      const [images, variants, categories] = await Promise.all([
        this.imageRepo.findByProductId(product.id),
        this.variantRepo.findByProductId(product.id),
        this.getProductCategories(product.id),
      ]);

      return {
        ...product,
        images,
        variants,
        categories,
      };
    } catch (error: any) {
      throw this.mapError(error);
    }
  }

  async createProduct(data: Partial<EnhancedProduct>): Promise<EnhancedProduct> {
    try {
      // Extract images and variants from data
      const { images: imageData, variants: variantData, categories: categoryData, ...productData } = data as any;

      // Create product
      const createData: CreateProductData = {
        slug: productData.slug,
        title: productData.title,
        short_description: productData.short_description,
        long_description: productData.long_description,
        base_price: productData.base_price,
        currency: productData.currency,
        sku: productData.sku,
        gtin: productData.gtin,
        status: productData.status,
        character_id: productData.character_id,
        character_value: productData.character_value,
        etsy_link: productData.etsy_link,
      };

      const product = await this.productRepo.create(createData);

      // Batch create images if provided
      let images: ProductImage[] = [];
      if (imageData && Array.isArray(imageData) && imageData.length > 0) {
        const imageCreateData: CreateProductImageData[] = imageData.map((img: any, index: number) => ({
          product_id: product.id,
          url: img.url,
          alt_text: img.alt_text,
          position: img.position ?? index,
        }));
        images = await this.imageRepo.batchCreate(imageCreateData);
      }

      // Batch create variants if provided
      let variants: ProductVariant[] = [];
      if (variantData && Array.isArray(variantData) && variantData.length > 0) {
        const variantCreateData: CreateProductVariantData[] = variantData.map((v: any) => ({
          product_id: product.id,
          sku: v.sku,
          name: v.name,
          attributes: v.attributes,
          price_adjustment: v.price_adjustment ?? 0,
          stock: v.stock ?? 0,
        }));
        variants = await this.variantRepo.batchCreate(variantCreateData);
      }

      // Add categories if provided
      let categories: Category[] = [];
      if (categoryData && Array.isArray(categoryData) && categoryData.length > 0) {
        await Promise.all(
          categoryData.map((cat: any) =>
            this.productRepo.addCategory(product.id, cat.id)
          )
        );
        categories = await this.getProductCategories(product.id);
      }

      return {
        ...product,
        images,
        variants,
        categories,
      };
    } catch (error: any) {
      throw this.mapError(error);
    }
  }

  async updateProduct(id: number, data: Partial<EnhancedProduct>): Promise<EnhancedProduct> {
    try {
      // Extract images and variants from data (handle them separately)
      const { images: imageData, variants: variantData, categories: categoryData, ...productData } = data as any;

      // Update product
      const updateData: UpdateProductData = {};
      if (productData.slug !== undefined) updateData.slug = productData.slug;
      if (productData.title !== undefined) updateData.title = productData.title;
      if (productData.short_description !== undefined) updateData.short_description = productData.short_description;
      if (productData.long_description !== undefined) updateData.long_description = productData.long_description;
      if (productData.base_price !== undefined) updateData.base_price = productData.base_price;
      if (productData.currency !== undefined) updateData.currency = productData.currency;
      if (productData.sku !== undefined) updateData.sku = productData.sku;
      if (productData.gtin !== undefined) updateData.gtin = productData.gtin;
      if (productData.status !== undefined) updateData.status = productData.status;
      if (productData.character_id !== undefined) updateData.character_id = productData.character_id;
      if (productData.character_value !== undefined) updateData.character_value = productData.character_value;
      if (productData.etsy_link !== undefined) updateData.etsy_link = productData.etsy_link;

      const product = await this.productRepo.update(id, updateData);
      if (!product) {
        throw new Error(`Product with id ${id} not found`);
      }

      // Note: Images and variants are updated separately via their own endpoints
      // This matches the TypeORM behavior where these are managed independently

      // Get current state
      const [images, variants, categories] = await Promise.all([
        this.imageRepo.findByProductId(id),
        this.variantRepo.findByProductId(id),
        this.getProductCategories(id),
      ]);

      return {
        ...product,
        images,
        variants,
        categories,
      };
    } catch (error: any) {
      throw this.mapError(error);
    }
  }

  async deleteProduct(id: number): Promise<void> {
    try {
      // Soft delete product
      await this.productRepo.softDelete(id);

      // Soft delete all variants
      const variants = await this.variantRepo.findByProductId(id);
      await Promise.all(
        variants.map(variant => this.variantRepo.softDelete(variant.id, id))
      );
    } catch (error: any) {
      throw this.mapError(error);
    }
  }

  async addVariant(productId: number, data: Partial<ProductVariant>): Promise<ProductVariant> {
    try {
      const createData: CreateProductVariantData = {
        product_id: productId,
        sku: data.sku!,
        name: data.name!,
        attributes: data.attributes,
        price_adjustment: data.price_adjustment ?? 0,
        stock: data.stock ?? 0,
      };

      return await this.variantRepo.create(createData);
    } catch (error: any) {
      throw this.mapError(error);
    }
  }

  async updateVariant(id: string, data: Partial<ProductVariant>): Promise<ProductVariant> {
    try {
      // For DynamoDB, we need product_id to update a variant
      // First, find the variant to get its product_id
      const variant = await this.variantRepo.findById(id);
      if (!variant) {
        throw new Error(`Variant with id ${id} not found`);
      }

      const updateData: UpdateProductVariantData = {};
      if (data.sku !== undefined) updateData.sku = data.sku;
      if (data.name !== undefined) updateData.name = data.name;
      if (data.attributes !== undefined) updateData.attributes = data.attributes;
      if (data.price_adjustment !== undefined) updateData.price_adjustment = data.price_adjustment;
      if (data.stock !== undefined) updateData.stock = data.stock;

      const updated = await this.variantRepo.update(id, variant.product_id, updateData);
      if (!updated) {
        throw new Error(`Variant with id ${id} not found`);
      }

      return updated;
    } catch (error: any) {
      throw this.mapError(error);
    }
  }

  async updateInventory(adjustments: Array<{ variantId: string; quantity: number }>): Promise<void> {
    try {
      if (adjustments.length === 0) {
        return;
      }

      // Group adjustments by variant
      const adjustmentMap = new Map<string, { productId: number; totalQuantity: number }>();

      // First, fetch all variants to get their product_ids
      const variantIds = Array.from(new Set(adjustments.map(adj => adj.variantId)));
      const variants = await Promise.all(
        variantIds.map(id => this.variantRepo.findById(id))
      );

      // Build a Map for O(1) lookups instead of O(n*m) with repeated array.find
      const variantMap = new Map<string, ProductVariant>();
      variants.forEach(v => {
        if (v) variantMap.set(v.id, v);
      });

      // Build map of variant updates
      for (const adjustment of adjustments) {
        const variant = variantMap.get(adjustment.variantId);

        if (!variant) {
          throw new Error(`Variant with id ${adjustment.variantId} not found`);
        }

        const existing = adjustmentMap.get(adjustment.variantId);
        if (existing) {
          existing.totalQuantity += adjustment.quantity;
        } else {
          adjustmentMap.set(adjustment.variantId, {
            productId: variant.product_id,
            totalQuantity: adjustment.quantity,
          });
        }
      }

      // Apply all adjustments in parallel
      await Promise.all(
        Array.from(adjustmentMap.entries()).map(([variantId, { productId, totalQuantity }]) => {
          if (totalQuantity >= 0) {
            return this.variantRepo.incrementStock(variantId, productId, totalQuantity);
          } else {
            return this.variantRepo.decrementStock(variantId, productId, Math.abs(totalQuantity));
          }
        })
      );
    } catch (error: any) {
      throw this.mapError(error);
    }
  }

  // ==================== Product Images ====================

  async listImages(productId: number): Promise<ProductImage[]> {
    try {
      return await this.imageRepo.findByProductId(productId);
    } catch (error: any) {
      throw this.mapError(error);
    }
  }

  async addImage(productId: number, url: string, altText?: string, position?: number): Promise<ProductImage> {
    try {
      // Verify product exists
      const product = await this.productRepo.findById(productId);
      if (!product) {
        throw new Error(`Product with id ${productId} not found`);
      }

      const createData: CreateProductImageData = {
        product_id: productId,
        url,
        alt_text: altText,
        position, // If not provided, repository will auto-assign
      };

      return await this.imageRepo.create(createData);
    } catch (error: any) {
      throw this.mapError(error);
    }
  }

  async updateImage(productId: number, imageId: string, data: { position?: number; alt_text?: string }): Promise<ProductImage> {
    try {
      const updateData: UpdateProductImageData = {};
      if (data.position !== undefined) updateData.position = data.position;
      if (data.alt_text !== undefined) updateData.alt_text = data.alt_text;

      const updated = await this.imageRepo.update(imageId, productId, updateData);
      if (!updated) {
        throw new Error(`Image with id ${imageId} not found for product ${productId}`);
      }

      return updated;
    } catch (error: any) {
      throw this.mapError(error);
    }
  }

  async deleteImage(productId: number, imageId: string): Promise<void> {
    try {
      // Check if image exists before deletion
      const image = await this.imageRepo.findByIdAndProductId(imageId, productId);
      if (!image) {
        throw new Error(`Image with id ${imageId} not found for product ${productId}`);
      }

      await this.imageRepo.delete(imageId, productId);
    } catch (error: any) {
      throw this.mapError(error);
    }
  }

  // ==================== Helper Methods ====================

  /**
   * Get categories for a product
   */
  private async getProductCategories(productId: number): Promise<Category[]> {
    const productCategories = await this.productRepo.getCategories(productId);

    if (productCategories.length === 0) {
      return [];
    }

    // Fetch all category details in parallel
    const categories = await Promise.all(
      productCategories.map(pc => this.categoryRepo.findById(pc.category_id))
    );

    // Filter out nulls
    return categories.filter((c): c is Category => c !== null);
  }

  /**
   * Map DynamoDB errors to HTTP errors
   */
  private mapError(error: any): Error {
    // Handle common DynamoDB errors
    if (error.name === 'ResourceNotFoundException' || error.code === 'ResourceNotFoundException') {
      return new Error('Resource not found');
    }

    if (error.name === 'ValidationException' || error.code === 'ValidationException') {
      return new Error(`Validation error: ${error.message}`);
    }

    if (error.name === 'ConditionalCheckFailedException' || error.code === 'ConditionalCheckFailedException') {
      return new Error('Item does not exist or condition check failed');
    }

    if (error.name === 'ProvisionedThroughputExceededException' || error.code === 'ProvisionedThroughputExceededException') {
      return new Error('Request rate exceeded. Please try again later.');
    }

    // Return original error if not a known DynamoDB error
    return error;
  }
}
