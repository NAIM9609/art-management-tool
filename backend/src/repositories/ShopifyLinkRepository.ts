import { DynamoDBHelper, EntityPrefix, GSI } from '../database/dynamodb-client';

export interface ShopifyLink {
  id: number;
  local_product_id: number;
  shopify_product_id: string;
  shopify_variant_id?: string;
  sync_status: string;
  last_synced_at?: string;
  created_at: string;
  updated_at: string;
}

export class ShopifyLinkRepository {
  
  /**
   * Create a new Shopify link
   */
  static async create(data: Omit<ShopifyLink, 'id' | 'created_at' | 'updated_at'>): Promise<ShopifyLink> {
    const id = await DynamoDBHelper.getNextId(EntityPrefix.SHOPIFY_LINK);
    const now = new Date().toISOString();
    
    const link: ShopifyLink = {
      ...data,
      id,
      created_at: now,
      updated_at: now,
    };

    await DynamoDBHelper.put({
      PK: `${EntityPrefix.SHOPIFY_LINK}#${data.local_product_id}`,
      SK: 'METADATA',
      GSI1PK: `SHOPIFY_PRODUCT#${data.shopify_product_id}`,
      GSI1SK: 'METADATA',
      entity_type: 'ShopifyLink',
      ...link,
    });

    return link;
  }

  /**
   * Find by local product ID
   */
  static async findByLocalProductId(localProductId: number): Promise<ShopifyLink | null> {
    const item = await DynamoDBHelper.get(`${EntityPrefix.SHOPIFY_LINK}#${localProductId}`, 'METADATA');
    if (!item) return null;
    return this.mapToLink(item);
  }

  /**
   * Find by Shopify product ID
   */
  static async findByShopifyProductId(shopifyProductId: string): Promise<ShopifyLink | null> {
    const items = await DynamoDBHelper.query({
      indexName: GSI.GSI1,
      keyConditionExpression: 'GSI1PK = :pk',
      expressionAttributeValues: {
        ':pk': `SHOPIFY_PRODUCT#${shopifyProductId}`,
      },
      limit: 1,
    });

    if (items.length === 0) return null;
    return this.mapToLink(items[0]);
  }

  /**
   * Find all links
   */
  static async findAll(): Promise<ShopifyLink[]> {
    const items = await DynamoDBHelper.scan({
      filterExpression: 'entity_type = :type',
      expressionAttributeValues: {
        ':type': 'ShopifyLink',
      },
    });

    return items.map(this.mapToLink);
  }

  /**
   * Update a link
   */
  static async update(localProductId: number, data: Partial<ShopifyLink>): Promise<ShopifyLink> {
    const { id: _, local_product_id: __, created_at: ___, ...updateData } = data as any;
    
    const { updateExpression, expressionAttributeValues, expressionAttributeNames } = 
      DynamoDBHelper.buildUpdateExpression(updateData);

    const result = await DynamoDBHelper.update(
      `${EntityPrefix.SHOPIFY_LINK}#${localProductId}`,
      'METADATA',
      updateExpression,
      expressionAttributeValues,
      expressionAttributeNames
    );

    return this.mapToLink(result);
  }

  /**
   * Update sync status
   */
  static async updateSyncStatus(localProductId: number, status: string): Promise<ShopifyLink> {
    return this.update(localProductId, {
      sync_status: status,
      last_synced_at: new Date().toISOString(),
    });
  }

  /**
   * Delete a link
   */
  static async delete(localProductId: number): Promise<void> {
    await DynamoDBHelper.delete(`${EntityPrefix.SHOPIFY_LINK}#${localProductId}`, 'METADATA');
  }

  private static mapToLink(item: any): ShopifyLink {
    { const { PK, SK, GSI1PK, GSI1SK, entity_type, ...link } = item;
    return link as ShopifyLink; }
  }
}
