import { DynamoDBHelper, EntityPrefix, GSI } from '../database/dynamodb-client';

// ==================== Etsy OAuth Token ====================

export interface EtsyOAuthToken {
  id: number;
  shop_id: string;
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_at: string;
  scope?: string;
  created_at: string;
  updated_at: string;
}

export class EtsyOAuthTokenRepository {
  
  static async create(data: Omit<EtsyOAuthToken, 'id' | 'created_at' | 'updated_at'>): Promise<EtsyOAuthToken> {
    const id = await DynamoDBHelper.getNextId(EntityPrefix.ETSY_TOKEN);
    const now = new Date().toISOString();
    
    const token: EtsyOAuthToken = {
      ...data,
      id,
      created_at: now,
      updated_at: now,
    };

    await DynamoDBHelper.put({
      PK: `${EntityPrefix.ETSY_TOKEN}#${data.shop_id}`,
      SK: 'METADATA',
      GSI1PK: `ETSY_TOKEN#${id}`,
      GSI1SK: 'METADATA',
      entity_type: 'EtsyOAuthToken',
      ...token,
    });

    return token;
  }

  static async findByShopId(shopId: string): Promise<EtsyOAuthToken | null> {
    const item = await DynamoDBHelper.get(`${EntityPrefix.ETSY_TOKEN}#${shopId}`, 'METADATA');
    if (!item) return null;
    return this.mapToToken(item);
  }

  static async upsert(data: Omit<EtsyOAuthToken, 'id' | 'created_at' | 'updated_at'>): Promise<EtsyOAuthToken> {
    const existing = await this.findByShopId(data.shop_id);
    if (existing) {
      return this.update(data.shop_id, data);
    }
    return this.create(data);
  }

  static async update(shopId: string, data: Partial<EtsyOAuthToken>): Promise<EtsyOAuthToken> {
    const { id: _, shop_id: __, created_at: ___, ...updateData } = data as any;
    
    const { updateExpression, expressionAttributeValues, expressionAttributeNames } = 
      DynamoDBHelper.buildUpdateExpression(updateData);

    const result = await DynamoDBHelper.update(
      `${EntityPrefix.ETSY_TOKEN}#${shopId}`,
      'METADATA',
      updateExpression,
      expressionAttributeValues,
      expressionAttributeNames
    );

    return this.mapToToken(result);
  }

  static async delete(shopId: string): Promise<void> {
    await DynamoDBHelper.delete(`${EntityPrefix.ETSY_TOKEN}#${shopId}`, 'METADATA');
  }

  private static mapToToken(item: any): EtsyOAuthToken {
    const { PK, SK, GSI1PK, GSI1SK, entity_type, ...token } = item;
    return token as EtsyOAuthToken;
  }
}

// ==================== Etsy Sync Config ====================

export interface EtsySyncConfig {
  id: number;
  shop_id: string;
  enabled: boolean;
  sync_interval_products: number;
  sync_interval_inventory: number;
  last_product_sync?: string;
  last_inventory_sync?: string;
  created_at: string;
  updated_at: string;
}

export class EtsySyncConfigRepository {
  
  static async create(data: Omit<EtsySyncConfig, 'id' | 'created_at' | 'updated_at'>): Promise<EtsySyncConfig> {
    const id = await DynamoDBHelper.getNextId(EntityPrefix.ETSY_CONFIG);
    const now = new Date().toISOString();
    
    const config: EtsySyncConfig = {
      ...data,
      id,
      created_at: now,
      updated_at: now,
    };

    await DynamoDBHelper.put({
      PK: `${EntityPrefix.ETSY_CONFIG}#${data.shop_id}`,
      SK: 'METADATA',
      entity_type: 'EtsySyncConfig',
      ...config,
    });

    return config;
  }

  static async findByShopId(shopId: string): Promise<EtsySyncConfig | null> {
    const item = await DynamoDBHelper.get(`${EntityPrefix.ETSY_CONFIG}#${shopId}`, 'METADATA');
    if (!item) return null;
    return this.mapToConfig(item);
  }

  static async update(shopId: string, data: Partial<EtsySyncConfig>): Promise<EtsySyncConfig> {
    const { id: _, shop_id: __, created_at: ___, ...updateData } = data as any;
    
    const { updateExpression, expressionAttributeValues, expressionAttributeNames } = 
      DynamoDBHelper.buildUpdateExpression(updateData);

    const result = await DynamoDBHelper.update(
      `${EntityPrefix.ETSY_CONFIG}#${shopId}`,
      'METADATA',
      updateExpression,
      expressionAttributeValues,
      expressionAttributeNames
    );

    return this.mapToConfig(result);
  }

  private static mapToConfig(item: any): EtsySyncConfig {
    const { PK, SK, entity_type, ...config } = item;
    return config as EtsySyncConfig;
  }
}

// ==================== Etsy Product ====================

export interface EtsyProduct {
  id: number;
  local_product_id: number;
  etsy_listing_id: string;
  etsy_inventory_id?: string;
  sync_status: string;
  last_synced_at?: string;
  created_at: string;
  updated_at: string;
}

export class EtsyProductRepository {
  
  static async create(data: Omit<EtsyProduct, 'id' | 'created_at' | 'updated_at'>): Promise<EtsyProduct> {
    const id = await DynamoDBHelper.getNextId(EntityPrefix.ETSY_PRODUCT);
    const now = new Date().toISOString();
    
    const product: EtsyProduct = {
      ...data,
      id,
      created_at: now,
      updated_at: now,
    };

    await DynamoDBHelper.put({
      PK: `${EntityPrefix.ETSY_PRODUCT}#${data.local_product_id}`,
      SK: 'METADATA',
      GSI1PK: `ETSY_LISTING#${data.etsy_listing_id}`,
      GSI1SK: 'METADATA',
      entity_type: 'EtsyProduct',
      ...product,
    });

    return product;
  }

  static async findByLocalProductId(localProductId: number): Promise<EtsyProduct | null> {
    const item = await DynamoDBHelper.get(`${EntityPrefix.ETSY_PRODUCT}#${localProductId}`, 'METADATA');
    if (!item) return null;
    return this.mapToProduct(item);
  }

  static async findByEtsyListingId(etsyListingId: string): Promise<EtsyProduct | null> {
    const items = await DynamoDBHelper.query({
      indexName: GSI.GSI1,
      keyConditionExpression: 'GSI1PK = :pk',
      expressionAttributeValues: {
        ':pk': `ETSY_LISTING#${etsyListingId}`,
      },
      limit: 1,
    });

    if (items.length === 0) return null;
    return this.mapToProduct(items[0]);
  }

  static async update(localProductId: number, data: Partial<EtsyProduct>): Promise<EtsyProduct> {
    const { id: _, local_product_id: __, created_at: ___, ...updateData } = data as any;
    
    const { updateExpression, expressionAttributeValues, expressionAttributeNames } = 
      DynamoDBHelper.buildUpdateExpression(updateData);

    const result = await DynamoDBHelper.update(
      `${EntityPrefix.ETSY_PRODUCT}#${localProductId}`,
      'METADATA',
      updateExpression,
      expressionAttributeValues,
      expressionAttributeNames
    );

    return this.mapToProduct(result);
  }

  static async delete(localProductId: number): Promise<void> {
    await DynamoDBHelper.delete(`${EntityPrefix.ETSY_PRODUCT}#${localProductId}`, 'METADATA');
  }

  private static mapToProduct(item: any): EtsyProduct {
    const { PK, SK, GSI1PK, GSI1SK, entity_type, ...product } = item;
    return product as EtsyProduct;
  }
}

// ==================== Etsy Receipt ====================

export interface EtsyReceipt {
  id: number;
  etsy_receipt_id: string;
  local_order_id?: number;
  shop_id: string;
  buyer_email?: string;
  buyer_name?: string;
  status: string;
  is_paid: boolean;
  is_shipped: boolean;
  grand_total: number;
  currency: string;
  created_at: string;
  updated_at: string;
}

export class EtsyReceiptRepository {
  
  static async create(data: Omit<EtsyReceipt, 'id' | 'created_at' | 'updated_at'>): Promise<EtsyReceipt> {
    const id = await DynamoDBHelper.getNextId(EntityPrefix.ETSY_RECEIPT);
    const now = new Date().toISOString();
    
    const receipt: EtsyReceipt = {
      ...data,
      id,
      created_at: now,
      updated_at: now,
    };

    await DynamoDBHelper.put({
      PK: `${EntityPrefix.ETSY_RECEIPT}#${data.etsy_receipt_id}`,
      SK: 'METADATA',
      GSI1PK: data.local_order_id ? `ETSY_ORDER#${data.local_order_id}` : 'ETSY_ORDER#UNLINKED',
      GSI1SK: now,
      entity_type: 'EtsyReceipt',
      ...receipt,
    });

    return receipt;
  }

  static async findByEtsyReceiptId(etsyReceiptId: string): Promise<EtsyReceipt | null> {
    const item = await DynamoDBHelper.get(`${EntityPrefix.ETSY_RECEIPT}#${etsyReceiptId}`, 'METADATA');
    if (!item) return null;
    return this.mapToReceipt(item);
  }

  static async findByLocalOrderId(localOrderId: number): Promise<EtsyReceipt | null> {
    const items = await DynamoDBHelper.query({
      indexName: GSI.GSI1,
      keyConditionExpression: 'GSI1PK = :pk',
      expressionAttributeValues: {
        ':pk': `ETSY_ORDER#${localOrderId}`,
      },
      limit: 1,
    });

    if (items.length === 0) return null;
    return this.mapToReceipt(items[0]);
  }

  static async update(etsyReceiptId: string, data: Partial<EtsyReceipt>): Promise<EtsyReceipt> {
    const { id: _, etsy_receipt_id: __, created_at: ___, ...updateData } = data as any;
    
    const { updateExpression, expressionAttributeValues, expressionAttributeNames } = 
      DynamoDBHelper.buildUpdateExpression(updateData);

    const result = await DynamoDBHelper.update(
      `${EntityPrefix.ETSY_RECEIPT}#${etsyReceiptId}`,
      'METADATA',
      updateExpression,
      expressionAttributeValues,
      expressionAttributeNames
    );

    return this.mapToReceipt(result);
  }

  private static mapToReceipt(item: any): EtsyReceipt {
    const { PK, SK, GSI1PK, GSI1SK, entity_type, ...receipt } = item;
    return receipt as EtsyReceipt;
  }
}

// ==================== Etsy Inventory Sync Log ====================

export interface EtsyInventorySyncLog {
  id: number;
  sync_type: string;
  status: string;
  items_processed: number;
  errors?: string[];
  started_at: string;
  completed_at?: string;
  created_at: string;
}

export class EtsyInventorySyncLogRepository {
  
  static async create(data: Omit<EtsyInventorySyncLog, 'id' | 'created_at'>): Promise<EtsyInventorySyncLog> {
    const id = await DynamoDBHelper.getNextId(EntityPrefix.ETSY_SYNC_LOG);
    const now = new Date().toISOString();
    
    const log: EtsyInventorySyncLog = {
      ...data,
      id,
      created_at: now,
    };

    await DynamoDBHelper.put({
      PK: `${EntityPrefix.ETSY_SYNC_LOG}#${id}`,
      SK: 'METADATA',
      GSI1PK: `ETSY_SYNC_TYPE#${data.sync_type}`,
      GSI1SK: data.started_at,
      entity_type: 'EtsyInventorySyncLog',
      ...log,
    });

    return log;
  }

  static async findById(id: number): Promise<EtsyInventorySyncLog | null> {
    const item = await DynamoDBHelper.get(`${EntityPrefix.ETSY_SYNC_LOG}#${id}`, 'METADATA');
    if (!item) return null;
    return this.mapToLog(item);
  }

  static async findBySyncType(syncType: string, limit: number = 10): Promise<EtsyInventorySyncLog[]> {
    const items = await DynamoDBHelper.query({
      indexName: GSI.GSI1,
      keyConditionExpression: 'GSI1PK = :pk',
      expressionAttributeValues: {
        ':pk': `ETSY_SYNC_TYPE#${syncType}`,
      },
      scanIndexForward: false,
      limit,
    });

    return items.map(this.mapToLog);
  }

  static async update(id: number, data: Partial<EtsyInventorySyncLog>): Promise<EtsyInventorySyncLog> {
    const { id: _, created_at: __, ...updateData } = data as any;
    
    const updates: string[] = [];
    const values: Record<string, any> = {};
    const names: Record<string, string> = {};

    Object.entries(updateData).forEach(([key, value], index) => {
      if (value !== undefined) {
        const attrName = `#attr${index}`;
        const attrValue = `:val${index}`;
        names[attrName] = key;
        values[attrValue] = value;
        updates.push(`${attrName} = ${attrValue}`);
      }
    });

    const result = await DynamoDBHelper.update(
      `${EntityPrefix.ETSY_SYNC_LOG}#${id}`,
      'METADATA',
      `SET ${updates.join(', ')}`,
      values,
      names
    );

    return this.mapToLog(result);
  }

  private static mapToLog(item: any): EtsyInventorySyncLog {
    const { PK, SK, GSI1PK, GSI1SK, entity_type, ...log } = item;
    return log as EtsyInventorySyncLog;
  }
}
