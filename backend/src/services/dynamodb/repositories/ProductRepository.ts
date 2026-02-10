/**
 * ProductRepository - DynamoDB implementation for Product CRUD operations
 * 
 * DynamoDB Structure:
 * PK: "PRODUCT#${id}"
 * SK: "METADATA"
 * GSI1PK: "PRODUCT_SLUG#${slug}"
 * GSI1SK: "${created_at}"
 * GSI2PK: "PRODUCT_STATUS#${status}"
 * GSI2SK: "${title}#${id}"
 * GSI3PK: "CHARACTER#${character_id}" (sparse index)
 * GSI3SK: "${created_at}"
 */

import { DynamoDBOptimized } from '../DynamoDBOptimized';
import {
  Product,
  ProductCategory,
  ProductStatus,
  CreateProductData,
  UpdateProductData,
  PaginationParams,
  PaginatedResponse,
} from './types';

export class ProductRepository {
  private dynamoDB: DynamoDBOptimized;
  private readonly COUNTER_PK = 'COUNTER';
  private readonly COUNTER_SK = 'PRODUCT_ID';
  
  constructor(dynamoDB: DynamoDBOptimized) {
    this.dynamoDB = dynamoDB;
  }

  /**
   * Get next auto-increment ID using atomic counter
   */
  async getNextId(): Promise<number> {
    // First try to get current counter value
    const current = await this.dynamoDB.get({
      key: {
        PK: this.COUNTER_PK,
        SK: this.COUNTER_SK,
      },
      consistentRead: true,
    });

    const currentValue = current.data?.value || 0;
    const nextValue = currentValue + 1;

    // Update counter with new value
    const result = await this.dynamoDB.update<{ value: number }>({
      key: {
        PK: this.COUNTER_PK,
        SK: this.COUNTER_SK,
      },
      updates: {
        value: nextValue,
      },
      returnValues: 'ALL_NEW',
    });

    return result.data?.value || 1;
  }

  /**
   * Map DynamoDB item to Product interface
   */
  mapToProduct(item: Record<string, any>): Product {
    return {
      id: item.id,
      slug: item.slug,
      title: item.title,
      short_description: item.short_description,
      long_description: item.long_description,
      base_price: item.base_price,
      currency: item.currency || 'EUR',
      sku: item.sku,
      gtin: item.gtin,
      status: item.status as ProductStatus,
      character_id: item.character_id,
      character_value: item.character_value,
      etsy_link: item.etsy_link,
      created_at: item.created_at,
      updated_at: item.updated_at,
      deleted_at: item.deleted_at,
    };
  }

  /**
   * Build DynamoDB item from Product
   */
  buildProductItem(product: Product): Record<string, any> {
    const item: Record<string, any> = {
      PK: `PRODUCT#${product.id}`,
      SK: 'METADATA',
      id: product.id,
      slug: product.slug,
      title: product.title,
      base_price: product.base_price,
      currency: product.currency,
      status: product.status,
      created_at: product.created_at,
      updated_at: product.updated_at,
      // GSI1 - Product by slug
      GSI1PK: `PRODUCT_SLUG#${product.slug}`,
      GSI1SK: product.created_at,
      // GSI2 - Products by status
      GSI2PK: `PRODUCT_STATUS#${product.status}`,
      GSI2SK: `${product.title}#${product.id}`,
    };

    // Add optional fields
    if (product.short_description) item.short_description = product.short_description;
    if (product.long_description) item.long_description = product.long_description;
    if (product.sku) item.sku = product.sku;
    if (product.gtin) item.gtin = product.gtin;
    if (product.character_value) item.character_value = product.character_value;
    if (product.etsy_link) item.etsy_link = product.etsy_link;
    if (product.deleted_at) item.deleted_at = product.deleted_at;

    // GSI3 - Sparse index for character_id (only if character_id exists)
    if (product.character_id) {
      item.character_id = product.character_id;
      item.GSI3PK = `CHARACTER#${product.character_id}`;
      item.GSI3SK = product.created_at;
    }

    return item;
  }

  /**
   * Create a new product with auto-increment ID
   */
  async create(data: CreateProductData): Promise<Product> {
    const now = new Date().toISOString();
    const id = await this.getNextId();

    const product: Product = {
      id,
      slug: data.slug,
      title: data.title,
      short_description: data.short_description,
      long_description: data.long_description,
      base_price: data.base_price,
      currency: data.currency || 'EUR',
      sku: data.sku,
      gtin: data.gtin,
      status: data.status || ProductStatus.DRAFT,
      character_id: data.character_id,
      character_value: data.character_value,
      etsy_link: data.etsy_link,
      created_at: now,
      updated_at: now,
    };

    const item = this.buildProductItem(product);

    await this.dynamoDB.put({
      item,
      conditionExpression: 'attribute_not_exists(PK)',
    });

    return product;
  }

  /**
   * Find product by ID (strongly consistent read)
   */
  async findById(id: number): Promise<Product | null> {
    const result = await this.dynamoDB.get({
      key: {
        PK: `PRODUCT#${id}`,
        SK: 'METADATA',
      },
      consistentRead: true, // Strongly consistent for findById
    });

    if (!result.data) {
      return null;
    }

    return this.mapToProduct(result.data);
  }

  /**
   * Find product by slug using GSI1 (eventually consistent)
   */
  async findBySlug(slug: string): Promise<Product | null> {
    const result = await this.dynamoDB.queryEventuallyConsistent({
      indexName: 'GSI1',
      keyConditionExpression: 'GSI1PK = :gsi1pk',
      expressionAttributeValues: {
        ':gsi1pk': `PRODUCT_SLUG#${slug}`,
      },
      limit: 1,
    });

    if (result.data.length === 0) {
      return null;
    }

    return this.mapToProduct(result.data[0]);
  }

  /**
   * Find all products with pagination (eventually consistent)
   */
  async findAll(params: PaginationParams = {}): Promise<PaginatedResponse<Product>> {
    const result = await this.dynamoDB.queryEventuallyConsistent({
      indexName: 'GSI2',
      keyConditionExpression: 'GSI2PK = :gsi2pk',
      expressionAttributeValues: {
        ':gsi2pk': `PRODUCT_STATUS#${ProductStatus.PUBLISHED}`,
      },
      limit: params.limit || 30,
      exclusiveStartKey: params.lastEvaluatedKey,
      // Use projection expression to minimize data transfer
      projectionExpression: 'id, slug, title, short_description, base_price, currency, #status, created_at, updated_at',
      expressionAttributeNames: {
        '#status': 'status',
      },
    });

    return {
      items: result.data.map(item => this.mapToProduct(item)),
      lastEvaluatedKey: result.lastEvaluatedKey,
      count: result.count,
    };
  }

  /**
   * Update product by ID
   */
  async update(id: number, data: UpdateProductData): Promise<Product | null> {
    const now = new Date().toISOString();
    const updates: Record<string, any> = {
      updated_at: now,
    };

    // Build updates object with only provided fields
    if (data.slug !== undefined) updates.slug = data.slug;
    if (data.title !== undefined) updates.title = data.title;
    if (data.short_description !== undefined) updates.short_description = data.short_description;
    if (data.long_description !== undefined) updates.long_description = data.long_description;
    if (data.base_price !== undefined) updates.base_price = data.base_price;
    if (data.currency !== undefined) updates.currency = data.currency;
    if (data.sku !== undefined) updates.sku = data.sku;
    if (data.gtin !== undefined) updates.gtin = data.gtin;
    if (data.status !== undefined) updates.status = data.status;
    if (data.character_id !== undefined) updates.character_id = data.character_id;
    if (data.character_value !== undefined) updates.character_value = data.character_value;
    if (data.etsy_link !== undefined) updates.etsy_link = data.etsy_link;

    // Update GSI attributes if relevant fields are changed
    if (data.slug !== undefined) {
      updates.GSI1PK = `PRODUCT_SLUG#${data.slug}`;
    }
    
    // For GSI2, we need current title/status if only one is being updated
    // Use projection to minimize read cost
    if (data.status !== undefined || data.title !== undefined) {
      const current = await this.dynamoDB.get({
        key: {
          PK: `PRODUCT#${id}`,
          SK: 'METADATA',
        },
        projectionExpression: '#title, #status',
        expressionAttributeNames: {
          '#title': 'title',
          '#status': 'status',
        },
        consistentRead: true,
      });
      
      if (!current.data) return null;
      
      const newStatus = data.status || current.data.status;
      const newTitle = data.title || current.data.title;
      updates.GSI2PK = `PRODUCT_STATUS#${newStatus}`;
      updates.GSI2SK = `${newTitle}#${id}`;
    }
    
    if (data.character_id !== undefined) {
      updates.GSI3PK = `CHARACTER#${data.character_id}`;
    }

    const result = await this.dynamoDB.update({
      key: {
        PK: `PRODUCT#${id}`,
        SK: 'METADATA',
      },
      updates,
      conditionExpression: 'attribute_exists(PK)',
      returnValues: 'ALL_NEW',
    });

    if (!result.data) {
      return null;
    }

    return this.mapToProduct(result.data);
  }

  /**
   * Soft delete product (set deleted_at)
   */
  async softDelete(id: number): Promise<Product | null> {
    try {
      const result = await this.dynamoDB.softDelete({
        key: {
          PK: `PRODUCT#${id}`,
          SK: 'METADATA',
        },
        deletedAtField: 'deleted_at',
      });

      if (!result.data) {
        return null;
      }

      return this.mapToProduct(result.data);
    } catch (error: any) {
      // If item doesn't exist, return null
      if (error.name === 'ConditionalCheckFailedException' || error.code === 'ConditionalCheckFailedException') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Restore soft-deleted product
   */
  async restore(id: number): Promise<Product | null> {
    // Get the current product first
    const current = await this.findById(id);
    if (!current || !current.deleted_at) {
      return null;
    }

    // Update the product and manually remove deleted_at
    // We'll need to update the item without the deleted_at field
    const updatedProduct: Product = {
      ...current,
      deleted_at: undefined,
      updated_at: new Date().toISOString(),
    };

    const item = this.buildProductItem(updatedProduct);

    await this.dynamoDB.put({
      item,
    });

    return updatedProduct;
  }

  /**
   * Get product categories using batch get
   */
  async getCategories(productId: number): Promise<ProductCategory[]> {
    // First, query for product-category links
    const result = await this.dynamoDB.queryEventuallyConsistent({
      keyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      expressionAttributeValues: {
        ':pk': `PRODUCT#${productId}`,
        ':sk': 'CATEGORY#',
      },
    });

    return result.data.map(item => ({
      product_id: productId,
      category_id: parseInt(item.SK.replace('CATEGORY#', ''), 10),
      created_at: item.created_at,
    }));
  }

  /**
   * Add product-category link
   */
  async addCategory(productId: number, categoryId: number): Promise<ProductCategory> {
    const now = new Date().toISOString();
    const item = {
      PK: `PRODUCT#${productId}`,
      SK: `CATEGORY#${categoryId}`,
      product_id: productId,
      category_id: categoryId,
      created_at: now,
    };

    await this.dynamoDB.put({
      item,
      conditionExpression: 'attribute_not_exists(PK)',
    });

    return {
      product_id: productId,
      category_id: categoryId,
      created_at: now,
    };
  }

  /**
   * Remove product-category link
   */
  async removeCategory(productId: number, categoryId: number): Promise<void> {
    await this.dynamoDB.delete({
      key: {
        PK: `PRODUCT#${productId}`,
        SK: `CATEGORY#${categoryId}`,
      },
    });
  }

  /**
   * Find products by status using GSI2 (eventually consistent)
   */
  async findByStatus(
    status: ProductStatus,
    params: PaginationParams = {}
  ): Promise<PaginatedResponse<Product>> {
    const result = await this.dynamoDB.queryEventuallyConsistent({
      indexName: 'GSI2',
      keyConditionExpression: 'GSI2PK = :gsi2pk',
      expressionAttributeValues: {
        ':gsi2pk': `PRODUCT_STATUS#${status}`,
      },
      limit: params.limit || 30,
      exclusiveStartKey: params.lastEvaluatedKey,
      // Use projection expression to minimize data transfer
      projectionExpression: 'id, slug, title, short_description, base_price, currency, #status, created_at, updated_at',
      expressionAttributeNames: {
        '#status': 'status',
      },
    });

    return {
      items: result.data.map(item => this.mapToProduct(item)),
      lastEvaluatedKey: result.lastEvaluatedKey,
      count: result.count,
    };
  }

  /**
   * Find products by character using GSI3 (sparse index, eventually consistent)
   */
  async findByCharacter(
    characterId: number,
    params: PaginationParams = {}
  ): Promise<PaginatedResponse<Product>> {
    const result = await this.dynamoDB.queryEventuallyConsistent({
      indexName: 'GSI3',
      keyConditionExpression: 'GSI3PK = :gsi3pk',
      expressionAttributeValues: {
        ':gsi3pk': `CHARACTER#${characterId}`,
      },
      limit: params.limit || 30,
      exclusiveStartKey: params.lastEvaluatedKey,
      // Use projection expression to minimize data transfer
      projectionExpression: 'id, slug, title, short_description, base_price, currency, #status, character_id, created_at, updated_at',
      expressionAttributeNames: {
        '#status': 'status',
      },
    });

    return {
      items: result.data.map(item => this.mapToProduct(item)),
      lastEvaluatedKey: result.lastEvaluatedKey,
      count: result.count,
    };
  }

  /**
   * Search products by term (simulated full-text search)
   * Uses filter expression on title and description
   * Note: DynamoDB contains() is case-sensitive, so searches are case-sensitive
   */
  async search(
    term: string,
    params: PaginationParams = {}
  ): Promise<PaginatedResponse<Product>> {
    const result = await this.dynamoDB.queryEventuallyConsistent({
      indexName: 'GSI2',
      keyConditionExpression: 'GSI2PK = :gsi2pk',
      expressionAttributeValues: {
        ':gsi2pk': `PRODUCT_STATUS#${ProductStatus.PUBLISHED}`,
        ':term': term,
      },
      filterExpression: 'contains(#title, :term) OR contains(#desc, :term)',
      limit: params.limit || 30,
      exclusiveStartKey: params.lastEvaluatedKey,
      // Use projection expression to minimize data transfer
      projectionExpression: 'id, slug, #title, #desc, base_price, currency, #status, created_at, updated_at',
      expressionAttributeNames: {
        '#status': 'status',
        '#title': 'title',
        '#desc': 'short_description',
      },
    });

    return {
      items: result.data.map(item => this.mapToProduct(item)),
      lastEvaluatedKey: result.lastEvaluatedKey,
      count: result.count,
    };
  }
}
