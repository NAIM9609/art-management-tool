import { DynamoDBHelper, EntityPrefix, GSI } from '../database/dynamodb-client';

export interface ProductImage {
  id: number;
  product_id: number;
  url: string;
  alt_text?: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export class ProductImageRepository {
  
  /**
   * Create a new product image
   */
  static async create(data: Omit<ProductImage, 'id' | 'created_at' | 'updated_at'>): Promise<ProductImage> {
    const id = await DynamoDBHelper.getNextId(EntityPrefix.PRODUCT_IMAGE);
    const now = new Date().toISOString();
    
    const image: ProductImage = {
      ...data,
      id,
      created_at: now,
      updated_at: now,
    };

    await DynamoDBHelper.put({
      // Store under product for easy retrieval
      PK: `${EntityPrefix.PRODUCT}#${data.product_id}`,
      SK: `IMAGE#${id}`,
      // GSI for direct image lookup
      GSI1PK: `IMAGE#${id}`,
      GSI1SK: 'METADATA',
      entity_type: 'ProductImage',
      ...image,
    });

    return image;
  }

  /**
   * Find image by ID
   */
  static async findById(id: number): Promise<ProductImage | null> {
    const items = await DynamoDBHelper.query({
      indexName: GSI.GSI1,
      keyConditionExpression: 'GSI1PK = :pk',
      expressionAttributeValues: {
        ':pk': `IMAGE#${id}`,
      },
      limit: 1,
    });

    if (items.length === 0) return null;
    return this.mapToProductImage(items[0]);
  }

  /**
   * Find all images for a product
   */
  static async findByProductId(productId: number): Promise<ProductImage[]> {
    const items = await DynamoDBHelper.query({
      keyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      expressionAttributeValues: {
        ':pk': `${EntityPrefix.PRODUCT}#${productId}`,
        ':sk': 'IMAGE#',
      },
    });

    return items
      .map(this.mapToProductImage)
      .sort((a, b) => a.position - b.position);
  }

  /**
   * Update an image
   */
  static async update(productId: number, imageId: number, data: Partial<ProductImage>): Promise<ProductImage> {
    const { id: _, product_id: __, created_at: ___, ...updateData } = data as any;
    
    const { updateExpression, expressionAttributeValues, expressionAttributeNames } = 
      DynamoDBHelper.buildUpdateExpression(updateData);

    const result = await DynamoDBHelper.update(
      `${EntityPrefix.PRODUCT}#${productId}`,
      `IMAGE#${imageId}`,
      updateExpression,
      expressionAttributeValues,
      expressionAttributeNames
    );

    return this.mapToProductImage(result);
  }

  /**
   * Delete an image
   */
  static async delete(productId: number, imageId: number): Promise<void> {
    await DynamoDBHelper.delete(`${EntityPrefix.PRODUCT}#${productId}`, `IMAGE#${imageId}`);
  }

  /**
   * Reorder images
   */
  static async reorder(productId: number, imageOrders: Array<{ id: number; position: number }>): Promise<void> {
    for (const { id, position } of imageOrders) {
      await this.update(productId, id, { position });
    }
  }

  /**
   * Delete all images for a product
   */
  static async deleteByProductId(productId: number): Promise<void> {
    const images = await this.findByProductId(productId);
    
    const operations = images.map(img => ({
      type: 'delete' as const,
      key: { PK: `${EntityPrefix.PRODUCT}#${productId}`, SK: `IMAGE#${img.id}` },
    }));

    await DynamoDBHelper.batchWrite(operations);
  }

  private static mapToProductImage(item: any): ProductImage {
    const { PK, SK, GSI1PK, GSI1SK, entity_type, ...image } = item;
    return image as ProductImage;
  }
}
