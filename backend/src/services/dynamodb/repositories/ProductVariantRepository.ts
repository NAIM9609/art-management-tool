/**
 * ProductVariantRepository - DynamoDB implementation for Product Variant CRUD operations
 * 
 * DynamoDB Structure:
 * PK: "PRODUCT#${product_id}"
 * SK: "VARIANT#${id}"
 * GSI1PK: "VARIANT_SKU#${sku}"
 * GSI1SK: "${product_id}"
 * entity_type: "ProductVariant"
 * 
 * Cost Optimizations:
 * - Query variants by PK (single query for all variants)
 * - Batch create for multiple variants
 * - Eventually consistent reads for non-critical queries
 */

import { DynamoDBOptimized } from '../DynamoDBOptimized';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  ProductVariant,
  CreateProductVariantData,
  UpdateProductVariantData,
} from './types';
import { v4 as uuidv4 } from 'uuid';

export class ProductVariantRepository {
  private dynamoDB: DynamoDBOptimized;
  
  constructor(dynamoDB: DynamoDBOptimized) {
    this.dynamoDB = dynamoDB;
  }

  /**
   * Map DynamoDB item to ProductVariant interface
   */
  mapToVariant(item: Record<string, any>): ProductVariant {
    return {
      id: item.id,
      product_id: item.product_id,
      sku: item.sku,
      name: item.name,
      attributes: item.attributes,
      price_adjustment: item.price_adjustment,
      stock: item.stock,
      created_at: item.created_at,
      updated_at: item.updated_at,
      deleted_at: item.deleted_at,
    };
  }

  /**
   * Build DynamoDB item from ProductVariant
   */
  buildVariantItem(variant: ProductVariant): Record<string, any> {
    const item: Record<string, any> = {
      PK: `PRODUCT#${variant.product_id}`,
      SK: `VARIANT#${variant.id}`,
      entity_type: 'ProductVariant',
      id: variant.id,
      product_id: variant.product_id,
      sku: variant.sku,
      name: variant.name,
      price_adjustment: variant.price_adjustment,
      stock: variant.stock,
      created_at: variant.created_at,
      updated_at: variant.updated_at,
      // GSI1 - Variant by SKU
      GSI1PK: `VARIANT_SKU#${variant.sku}`,
      GSI1SK: `${variant.product_id}`,
    };

    // Add optional fields
    if (variant.attributes !== undefined) item.attributes = variant.attributes;
    if (variant.deleted_at !== undefined) item.deleted_at = variant.deleted_at;

    return item;
  }

  /**
   * Create a new product variant
   */
  async create(data: CreateProductVariantData): Promise<ProductVariant> {
    const now = new Date().toISOString();
    const id = uuidv4();

    const variant: ProductVariant = {
      id,
      product_id: data.product_id,
      sku: data.sku,
      name: data.name,
      attributes: data.attributes,
      price_adjustment: data.price_adjustment || 0,
      stock: data.stock || 0,
      created_at: now,
      updated_at: now,
    };

    const item = this.buildVariantItem(variant);

    await this.dynamoDB.put({
      item,
      conditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
    });

    return variant;
  }

  /**
   * Find variant by ID (strongly consistent read)
   */
  async findById(id: string): Promise<ProductVariant | null> {
    // We need to know the product_id to construct the PK
    // So we'll query GSI1 first to get the full item
    // Alternative: Store product_id in the id or pass it as parameter
    // For now, we'll scan for the variant (not optimal, but works)
    
    // Better approach: Use a query on a different GSI or pass product_id
    // Let's create a helper method that requires product_id
    throw new Error('findById requires product_id. Use findByIdAndProductId instead.');
  }

  /**
   * Find variant by ID and product ID (strongly consistent read)
   */
  async findByIdAndProductId(id: string, productId: number): Promise<ProductVariant | null> {
    const result = await this.dynamoDB.get({
      key: {
        PK: `PRODUCT#${productId}`,
        SK: `VARIANT#${id}`,
      },
      consistentRead: true,
    });

    if (!result.data) {
      return null;
    }

    return this.mapToVariant(result.data);
  }

  /**
   * Find all variants for a product (query by PK)
   * Uses eventually consistent reads for cost optimization
   */
  async findByProductId(productId: number): Promise<ProductVariant[]> {
    const result = await this.dynamoDB.queryEventuallyConsistent({
      keyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      expressionAttributeValues: {
        ':pk': `PRODUCT#${productId}`,
        ':sk': 'VARIANT#',
      },
      // Exclude soft-deleted variants
      filterExpression: 'attribute_not_exists(deleted_at)',
    });

    return result.data.map(item => this.mapToVariant(item));
  }

  /**
   * Find variant by SKU using GSI1 (eventually consistent)
   */
  async findBySku(sku: string): Promise<ProductVariant | null> {
    const result = await this.dynamoDB.queryEventuallyConsistent({
      indexName: 'GSI1',
      keyConditionExpression: 'GSI1PK = :gsi1pk',
      expressionAttributeValues: {
        ':gsi1pk': `VARIANT_SKU#${sku}`,
      },
      limit: 1,
    });

    if (result.data.length === 0) {
      return null;
    }

    return this.mapToVariant(result.data[0]);
  }

  /**
   * Update variant
   */
  async update(id: string, productId: number, data: UpdateProductVariantData): Promise<ProductVariant | null> {
    const now = new Date().toISOString();
    const updates: Record<string, any> = {
      updated_at: now,
    };

    // Build updates object with only provided fields
    if (data.sku !== undefined) updates.sku = data.sku;
    if (data.name !== undefined) updates.name = data.name;
    if (data.attributes !== undefined) updates.attributes = data.attributes;
    if (data.price_adjustment !== undefined) updates.price_adjustment = data.price_adjustment;
    if (data.stock !== undefined) updates.stock = data.stock;

    // Update GSI1 attributes if SKU is changed
    if (data.sku !== undefined) {
      updates.GSI1PK = `VARIANT_SKU#${data.sku}`;
    }

    try {
      const result = await this.dynamoDB.update({
        key: {
          PK: `PRODUCT#${productId}`,
          SK: `VARIANT#${id}`,
        },
        updates,
        conditionExpression: 'attribute_exists(PK) AND attribute_not_exists(deleted_at)',
        returnValues: 'ALL_NEW',
      });

      if (!result.data) {
        return null;
      }

      return this.mapToVariant(result.data);
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException' || error.code === 'ConditionalCheckFailedException') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Soft delete variant
   */
  async softDelete(id: string, productId: number): Promise<ProductVariant | null> {
    try {
      const result = await this.dynamoDB.softDelete({
        key: {
          PK: `PRODUCT#${productId}`,
          SK: `VARIANT#${id}`,
        },
        deletedAtField: 'deleted_at',
      });

      if (!result.data) {
        return null;
      }

      return this.mapToVariant(result.data);
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException' || error.code === 'ConditionalCheckFailedException') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Batch create variants (up to 25 items)
   */
  async batchCreate(variants: CreateProductVariantData[]): Promise<ProductVariant[]> {
    if (variants.length === 0) {
      return [];
    }

    if (variants.length > 25) {
      throw new Error('Batch create supports up to 25 variants at a time');
    }

    const now = new Date().toISOString();
    const createdVariants: ProductVariant[] = [];

    // Build variant items
    const items = variants.map(data => {
      const id = uuidv4();
      const variant: ProductVariant = {
        id,
        product_id: data.product_id,
        sku: data.sku,
        name: data.name,
        attributes: data.attributes,
        price_adjustment: data.price_adjustment || 0,
        stock: data.stock || 0,
        created_at: now,
        updated_at: now,
      };
      createdVariants.push(variant);
      return this.buildVariantItem(variant);
    });

    // Use batch write
    await this.dynamoDB.batchWriteOptimized({
      items: items.map(item => ({ type: 'put' as const, item })),
    });

    return createdVariants;
  }

  /**
   * Update stock atomically
   */
  async updateStock(id: string, productId: number, quantity: number): Promise<ProductVariant | null> {
    const { UpdateCommand } = await import('@aws-sdk/lib-dynamodb');
    const command = new UpdateCommand({
      TableName: (this.dynamoDB as any).tableName || process.env.DYNAMODB_TABLE_NAME,
      Key: {
        PK: `PRODUCT#${productId}`,
        SK: `VARIANT#${id}`,
      },
      UpdateExpression: 'SET stock = :quantity, updated_at = :now',
      ExpressionAttributeValues: {
        ':quantity': quantity,
        ':now': new Date().toISOString(),
      },
      ConditionExpression: 'attribute_exists(PK) AND attribute_not_exists(deleted_at)',
      ReturnValues: 'ALL_NEW',
    });

    try {
      const client = (this.dynamoDB as any).client;
      const result = await client.send(command);
      
      if (!result.Attributes) {
        return null;
      }

      return this.mapToVariant(result.Attributes);
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException' || error.code === 'ConditionalCheckFailedException') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Decrement stock atomically (cannot go below 0)
   */
  async decrementStock(id: string, productId: number, quantity: number): Promise<ProductVariant | null> {
    const { UpdateCommand } = await import('@aws-sdk/lib-dynamodb');
    const command = new UpdateCommand({
      TableName: (this.dynamoDB as any).tableName || process.env.DYNAMODB_TABLE_NAME,
      Key: {
        PK: `PRODUCT#${productId}`,
        SK: `VARIANT#${id}`,
      },
      UpdateExpression: 'SET stock = stock - :quantity, updated_at = :now',
      ExpressionAttributeValues: {
        ':quantity': quantity,
        ':now': new Date().toISOString(),
        ':zero': 0,
      },
      ConditionExpression: 'attribute_exists(PK) AND attribute_not_exists(deleted_at) AND stock >= :quantity',
      ReturnValues: 'ALL_NEW',
    });

    try {
      const client = (this.dynamoDB as any).client;
      const result = await client.send(command);
      
      if (!result.Attributes) {
        return null;
      }

      return this.mapToVariant(result.Attributes);
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException' || error.code === 'ConditionalCheckFailedException') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Increment stock atomically
   */
  async incrementStock(id: string, productId: number, quantity: number): Promise<ProductVariant | null> {
    const { UpdateCommand } = await import('@aws-sdk/lib-dynamodb');
    const command = new UpdateCommand({
      TableName: (this.dynamoDB as any).tableName || process.env.DYNAMODB_TABLE_NAME,
      Key: {
        PK: `PRODUCT#${productId}`,
        SK: `VARIANT#${id}`,
      },
      UpdateExpression: 'SET stock = stock + :quantity, updated_at = :now',
      ExpressionAttributeValues: {
        ':quantity': quantity,
        ':now': new Date().toISOString(),
      },
      ConditionExpression: 'attribute_exists(PK) AND attribute_not_exists(deleted_at)',
      ReturnValues: 'ALL_NEW',
    });

    try {
      const client = (this.dynamoDB as any).client;
      const result = await client.send(command);
      
      if (!result.Attributes) {
        return null;
      }

      return this.mapToVariant(result.Attributes);
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException' || error.code === 'ConditionalCheckFailedException') {
        return null;
      }
      throw error;
    }
  }
}
