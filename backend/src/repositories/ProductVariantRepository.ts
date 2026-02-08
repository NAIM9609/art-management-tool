import { DynamoDBHelper, EntityPrefix, GSI } from '../database/dynamodb-client';

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

export class ProductVariantRepository {
  
  /**
   * Create a new product variant
   */
  static async create(data: Omit<ProductVariant, 'id' | 'created_at' | 'updated_at'>): Promise<ProductVariant> {
    const id = await DynamoDBHelper.getNextId(EntityPrefix.PRODUCT_VARIANT);
    const now = new Date().toISOString();
    
    const variant: ProductVariant = {
      ...data,
      id,
      created_at: now,
      updated_at: now,
    };

    await DynamoDBHelper.put({
      // Store under product for easy retrieval
      PK: `${EntityPrefix.PRODUCT}#${data.product_id}`,
      SK: `VARIANT#${id}`,
      // GSI for direct variant lookup
      GSI1PK: `VARIANT#${id}`,
      GSI1SK: 'METADATA',
      // GSI for SKU lookup
      ...(data.sku && { GSI2PK: `VARIANT_SKU#${data.sku}`, GSI2SK: 'METADATA' }),
      entity_type: 'ProductVariant',
      ...variant,
    });

    return variant;
  }

  /**
   * Find variant by ID
   */
  static async findById(id: number, includeDeleted: boolean = false): Promise<ProductVariant | null> {
    const items = await DynamoDBHelper.query({
      indexName: GSI.GSI1,
      keyConditionExpression: 'GSI1PK = :pk',
      expressionAttributeValues: {
        ':pk': `VARIANT#${id}`,
      },
      limit: 1,
    });

    if (items.length === 0) return null;
    if (!includeDeleted && items[0].deleted_at) return null;
    return this.mapToProductVariant(items[0]);
  }

  /**
   * Find variant by SKU
   */
  static async findBySku(sku: string): Promise<ProductVariant | null> {
    const items = await DynamoDBHelper.query({
      indexName: GSI.GSI2,
      keyConditionExpression: 'GSI2PK = :pk',
      expressionAttributeValues: {
        ':pk': `VARIANT_SKU#${sku}`,
      },
      limit: 1,
    });

    if (items.length === 0 || items[0].deleted_at) return null;
    return this.mapToProductVariant(items[0]);
  }

  /**
   * Find all variants for a product
   */
  static async findByProductId(productId: number, includeDeleted: boolean = false): Promise<ProductVariant[]> {
    const items = await DynamoDBHelper.query({
      keyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      expressionAttributeValues: {
        ':pk': `${EntityPrefix.PRODUCT}#${productId}`,
        ':sk': 'VARIANT#',
      },
    });

    return items
      .filter(item => includeDeleted || !item.deleted_at)
      .map(this.mapToProductVariant);
  }

  /**
   * Update a variant
   */
  static async update(productId: number, variantId: number, data: Partial<ProductVariant>): Promise<ProductVariant> {
    const { id: _, product_id: __, created_at: ___, ...updateData } = data as any;
    
    const { updateExpression, expressionAttributeValues, expressionAttributeNames } = 
      DynamoDBHelper.buildUpdateExpression(updateData);

    const result = await DynamoDBHelper.update(
      `${EntityPrefix.PRODUCT}#${productId}`,
      `VARIANT#${variantId}`,
      updateExpression,
      expressionAttributeValues,
      expressionAttributeNames
    );

    return this.mapToProductVariant(result);
  }

  /**
   * Update stock for a variant
   */
  static async updateStock(productId: number, variantId: number, stockChange: number): Promise<ProductVariant> {
    const result = await DynamoDBHelper.update(
      `${EntityPrefix.PRODUCT}#${productId}`,
      `VARIANT#${variantId}`,
      'SET stock = stock + :change, updated_at = :updated_at',
      {
        ':change': stockChange,
        ':updated_at': new Date().toISOString(),
      }
    );

    return this.mapToProductVariant(result);
  }

  /**
   * Soft delete a variant
   */
  static async softDelete(productId: number, variantId: number): Promise<void> {
    await DynamoDBHelper.softDelete(`${EntityPrefix.PRODUCT}#${productId}`, `VARIANT#${variantId}`);
  }

  /**
   * Hard delete a variant
   */
  static async delete(productId: number, variantId: number): Promise<void> {
    await DynamoDBHelper.delete(`${EntityPrefix.PRODUCT}#${productId}`, `VARIANT#${variantId}`);
  }

  /**
   * Batch update inventory
   */
  static async batchUpdateInventory(adjustments: Array<{ productId: number; variantId: number; quantity: number }>): Promise<void> {
    for (const { productId, variantId, quantity } of adjustments) {
      await this.updateStock(productId, variantId, quantity);
    }
  }

  private static mapToProductVariant(item: any): ProductVariant {
    const { PK, SK, GSI1PK, GSI1SK, GSI2PK, GSI2SK, entity_type, ...variant } = item;
    return variant as ProductVariant;
  }
}
