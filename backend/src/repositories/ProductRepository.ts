import { DynamoDBHelper, EntityPrefix, GSI } from '../database/dynamodb-client';

export interface Product {
  id: number;
  slug: string;
  title: string;
  short_description?: string;
  long_description?: string;
  base_price: number;
  currency: string;
  sku?: string;
  gtin?: string;
  status: string;
  character_id?: number;
  character_value?: string;
  etsy_link?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
  // Populated relations
  images?: ProductImage[];
  variants?: ProductVariant[];
  categories?: Category[];
}

export interface ProductImage {
  id: number;
  product_id: number;
  url: string;
  alt_text?: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface ProductVariant {
  id: number;
  product_id: number;
  sku?: string;
  name: string;
  attributes?: Record<string, any>;
  price_adjustment: number;
  stock: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  description?: string;
  parent_id?: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export interface ProductFilters {
  status?: string;
  category?: string;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
}

export class ProductRepository {
  
  /**
   * Create a new product
   */
  static async create(data: Omit<Product, 'id' | 'created_at' | 'updated_at'>): Promise<Product> {
    const id = await DynamoDBHelper.getNextId(EntityPrefix.PRODUCT);
    const now = new Date().toISOString();
    
    const product: Product = {
      ...data,
      id,
      created_at: now,
      updated_at: now,
    };

    await DynamoDBHelper.put({
      PK: `${EntityPrefix.PRODUCT}#${id}`,
      SK: 'METADATA',
      GSI1PK: `PRODUCT_SLUG#${data.slug}`,
      GSI1SK: `${EntityPrefix.PRODUCT}#${id}`,
      GSI2PK: `PRODUCT_STATUS#${data.status}`,
      GSI2SK: now,
      entity_type: 'Product',
      ...product,
    });

    return product;
  }

  /**
   * Find product by ID
   */
  static async findById(id: number, includeDeleted: boolean = false): Promise<Product | null> {
    const item = await DynamoDBHelper.get(`${EntityPrefix.PRODUCT}#${id}`, 'METADATA');
    if (!item) return null;
    if (!includeDeleted && item.deleted_at) return null;
    return this.mapToProduct(item);
  }

  /**
   * Find product by slug
   */
  static async findBySlug(slug: string): Promise<Product | null> {
    const items = await DynamoDBHelper.query({
      indexName: GSI.GSI1,
      keyConditionExpression: 'GSI1PK = :gsi1pk',
      expressionAttributeValues: {
        ':gsi1pk': `PRODUCT_SLUG#${slug}`,
      },
      limit: 1,
    });

    if (items.length === 0 || items[0].deleted_at) return null;
    return this.mapToProduct(items[0]);
  }

  /**
   * Find all products with filters and pagination
   */
  static async findAll(filters: ProductFilters = {}, page: number = 1, perPage: number = 20): Promise<{ products: Product[]; total: number }> {
    // Query by status (using GSI2)
    const status = filters.status || 'published';
    
    const items = await DynamoDBHelper.query({
      indexName: GSI.GSI2,
      keyConditionExpression: 'GSI2PK = :status',
      expressionAttributeValues: {
        ':status': `PRODUCT_STATUS#${status}`,
      },
      scanIndexForward: false, // Most recent first
    });

    // Apply additional filters in memory
    let filteredProducts = items
      .filter(item => !item.deleted_at)
      .map(this.mapToProduct);

    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filteredProducts = filteredProducts.filter(p => 
        p.title.toLowerCase().includes(searchLower) ||
        p.short_description?.toLowerCase().includes(searchLower)
      );
    }

    if (filters.minPrice !== undefined) {
      filteredProducts = filteredProducts.filter(p => p.base_price >= filters.minPrice!);
    }

    if (filters.maxPrice !== undefined) {
      filteredProducts = filteredProducts.filter(p => p.base_price <= filters.maxPrice!);
    }

    const total = filteredProducts.length;
    const startIndex = (page - 1) * perPage;
    const paginatedProducts = filteredProducts.slice(startIndex, startIndex + perPage);

    return { products: paginatedProducts, total };
  }

  /**
   * Update a product
   */
  static async update(id: number, data: Partial<Product>): Promise<Product> {
    // Remove id from update data
    const { id: _, created_at: __, ...updateData } = data as any;
    
    const { updateExpression, expressionAttributeValues, expressionAttributeNames } = 
      DynamoDBHelper.buildUpdateExpression(updateData);

    const result = await DynamoDBHelper.update(
      `${EntityPrefix.PRODUCT}#${id}`,
      'METADATA',
      updateExpression,
      expressionAttributeValues,
      expressionAttributeNames
    );

    // If slug or status changed, we need to update the GSI values
    if (data.slug || data.status) {
      const product = await this.findById(id);
      if (product) {
        await DynamoDBHelper.put({
          PK: `${EntityPrefix.PRODUCT}#${id}`,
          SK: 'METADATA',
          GSI1PK: `PRODUCT_SLUG#${product.slug}`,
          GSI1SK: `${EntityPrefix.PRODUCT}#${id}`,
          GSI2PK: `PRODUCT_STATUS#${product.status}`,
          GSI2SK: product.created_at,
          entity_type: 'Product',
          ...product,
        });
      }
    }

    return this.mapToProduct(result);
  }

  /**
   * Soft delete a product
   */
  static async softDelete(id: number): Promise<void> {
    await DynamoDBHelper.softDelete(`${EntityPrefix.PRODUCT}#${id}`, 'METADATA');
  }

  /**
   * Restore a soft-deleted product
   */
  static async restore(id: number): Promise<void> {
    await DynamoDBHelper.restore(`${EntityPrefix.PRODUCT}#${id}`, 'METADATA');
  }

  /**
   * Hard delete a product (use with caution)
   */
  static async hardDelete(id: number): Promise<void> {
    await DynamoDBHelper.delete(`${EntityPrefix.PRODUCT}#${id}`, 'METADATA');
  }

  /**
   * Get product with all relations (images, variants, categories)
   */
  static async findByIdWithRelations(id: number): Promise<Product | null> {
    const product = await this.findById(id);
    if (!product) return null;

    // Fetch all related items for this product
    const relatedItems = await DynamoDBHelper.query({
      keyConditionExpression: 'PK = :pk',
      expressionAttributeValues: {
        ':pk': `${EntityPrefix.PRODUCT}#${id}`,
      },
    });

    const images: ProductImage[] = [];
    const variants: ProductVariant[] = [];
    const categoryIds: number[] = [];

    for (const item of relatedItems) {
      if (item.SK.startsWith('IMAGE#')) {
        images.push(this.mapToProductImage(item));
      } else if (item.SK.startsWith('VARIANT#')) {
        if (!item.deleted_at) {
          variants.push(this.mapToProductVariant(item));
        }
      } else if (item.SK.startsWith('CATEGORY#')) {
        categoryIds.push(parseInt(item.SK.replace('CATEGORY#', '')));
      }
    }

    // Fetch category data
    const categories: Category[] = [];
    for (const catId of categoryIds) {
      const cat = await DynamoDBHelper.get(`${EntityPrefix.CATEGORY}#${catId}`, 'METADATA');
      if (cat && !cat.deleted_at) {
        categories.push(this.mapToCategory(cat));
      }
    }

    // Sort images by position
    images.sort((a, b) => a.position - b.position);

    return {
      ...product,
      images,
      variants,
      categories,
    };
  }

  /**
   * Get products by category ID
   */
  static async findByCategoryId(categoryId: number): Promise<Product[]> {
    // Query the category to get all product relationships
    const items = await DynamoDBHelper.query({
      keyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      expressionAttributeValues: {
        ':pk': `${EntityPrefix.CATEGORY}#${categoryId}`,
        ':sk': `${EntityPrefix.PRODUCT}#`,
      },
    });

    const productIds = items.map(item => parseInt(item.SK.replace(`${EntityPrefix.PRODUCT}#`, '')));
    
    const products: Product[] = [];
    for (const id of productIds) {
      const product = await this.findById(id);
      if (product) {
        products.push(product);
      }
    }

    return products;
  }

  // ==================== Mapper Functions ====================

  private static mapToProduct(item: any): Product {
    const { PK, SK, GSI1PK, GSI1SK, GSI2PK, GSI2SK, GSI3PK, GSI3SK, entity_type, ...product } = item;
    return product as Product;
  }

  private static mapToProductImage(item: any): ProductImage {
    const { PK, SK, GSI1PK, GSI1SK, entity_type, ...image } = item;
    return image as ProductImage;
  }

  private static mapToProductVariant(item: any): ProductVariant {
    const { PK, SK, GSI1PK, GSI1SK, entity_type, ...variant } = item;
    return variant as ProductVariant;
  }

  private static mapToCategory(item: any): Category {
    const { PK, SK, GSI1PK, GSI1SK, GSI2PK, GSI2SK, entity_type, ...category } = item;
    return category as Category;
  }
}
