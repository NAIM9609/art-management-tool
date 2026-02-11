/**
 * EtsySyncConfigRepository - DynamoDB implementation for Etsy Sync Config operations
 * 
 * DynamoDB Structure:
 * PK: "ETSY_SYNC_CONFIG#${shop_id}"
 * SK: "METADATA"
 */

import { DynamoDBOptimized } from '../DynamoDBOptimized';
import {
  EtsySyncConfig,
  CreateEtsySyncConfigData,
  UpdateEtsySyncConfigData,
  EtsySyncType,
} from './types';

export class EtsySyncConfigRepository {
  private dynamoDB: DynamoDBOptimized;
  
  constructor(dynamoDB: DynamoDBOptimized) {
    this.dynamoDB = dynamoDB;
  }

  /**
   * Map DynamoDB item to EtsySyncConfig interface
   */
  private mapToConfig(item: Record<string, any>): EtsySyncConfig {
    return {
      shop_id: item.shop_id,
      last_product_sync: item.last_product_sync,
      last_inventory_sync: item.last_inventory_sync,
      last_receipt_sync: item.last_receipt_sync,
      sync_status: item.sync_status,
      sync_error: item.sync_error,
      rate_limit_remaining: item.rate_limit_remaining,
      rate_limit_reset_at: item.rate_limit_reset_at,
      created_at: item.created_at,
      updated_at: item.updated_at,
    };
  }

  /**
   * Build DynamoDB item from EtsySyncConfig
   */
  private buildConfigItem(config: EtsySyncConfig): Record<string, any> {
    const item: Record<string, any> = {
      PK: `ETSY_SYNC_CONFIG#${config.shop_id}`,
      SK: 'METADATA',
      shop_id: config.shop_id,
      sync_status: config.sync_status,
      rate_limit_remaining: config.rate_limit_remaining,
      created_at: config.created_at,
      updated_at: config.updated_at,
    };

    // Add optional fields
    if (config.last_product_sync !== undefined) item.last_product_sync = config.last_product_sync;
    if (config.last_inventory_sync !== undefined) item.last_inventory_sync = config.last_inventory_sync;
    if (config.last_receipt_sync !== undefined) item.last_receipt_sync = config.last_receipt_sync;
    if (config.sync_error !== undefined) item.sync_error = config.sync_error;
    if (config.rate_limit_reset_at !== undefined) item.rate_limit_reset_at = config.rate_limit_reset_at;

    return item;
  }

  /**
   * Create a new sync config
   */
  async create(data: CreateEtsySyncConfigData): Promise<EtsySyncConfig> {
    const now = new Date().toISOString();

    const config: EtsySyncConfig = {
      shop_id: data.shop_id,
      sync_status: data.sync_status || 'idle',
      rate_limit_remaining: data.rate_limit_remaining || 10000,
      created_at: now,
      updated_at: now,
    };

    const item = this.buildConfigItem(config);

    await this.dynamoDB.put({
      item,
      conditionExpression: 'attribute_not_exists(PK)',
    });

    return config;
  }

  /**
   * Find sync config by shop ID (strongly consistent read)
   */
  async findByShopId(shopId: string): Promise<EtsySyncConfig | null> {
    const result = await this.dynamoDB.get({
      key: {
        PK: `ETSY_SYNC_CONFIG#${shopId}`,
        SK: 'METADATA',
      },
      consistentRead: true,
    });

    if (!result.data) {
      return null;
    }

    return this.mapToConfig(result.data);
  }

  /**
   * Update sync config by shop ID
   */
  async update(shopId: string, data: UpdateEtsySyncConfigData): Promise<EtsySyncConfig | null> {
    const now = new Date().toISOString();
    const updates: Record<string, any> = {
      updated_at: now,
    };

    // Build updates object with only provided fields
    if (data.last_product_sync !== undefined) updates.last_product_sync = data.last_product_sync;
    if (data.last_inventory_sync !== undefined) updates.last_inventory_sync = data.last_inventory_sync;
    if (data.last_receipt_sync !== undefined) updates.last_receipt_sync = data.last_receipt_sync;
    if (data.sync_status !== undefined) updates.sync_status = data.sync_status;
    if (data.sync_error !== undefined) updates.sync_error = data.sync_error;
    if (data.rate_limit_remaining !== undefined) updates.rate_limit_remaining = data.rate_limit_remaining;
    if (data.rate_limit_reset_at !== undefined) updates.rate_limit_reset_at = data.rate_limit_reset_at;

    try {
      const result = await this.dynamoDB.update({
        key: {
          PK: `ETSY_SYNC_CONFIG#${shopId}`,
          SK: 'METADATA',
        },
        updates,
        conditionExpression: 'attribute_exists(PK)',
        returnValues: 'ALL_NEW',
      });

      if (!result.data) {
        return null;
      }

      return this.mapToConfig(result.data);
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException' || error.code === 'ConditionalCheckFailedException') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Update last sync timestamp for a specific sync type
   * This is an atomic operation
   */
  async updateLastSync(shopId: string, syncType: EtsySyncType): Promise<EtsySyncConfig | null> {
    const now = new Date().toISOString();
    const updates: UpdateEtsySyncConfigData = {};

    switch (syncType) {
      case EtsySyncType.PRODUCT:
        updates.last_product_sync = now;
        break;
      case EtsySyncType.INVENTORY:
        updates.last_inventory_sync = now;
        break;
      case EtsySyncType.RECEIPT:
        updates.last_receipt_sync = now;
        break;
    }

    return this.update(shopId, updates);
  }

  /**
   * Create or update (upsert) sync config
   */
  async upsert(shopId: string, data: UpdateEtsySyncConfigData): Promise<EtsySyncConfig> {
    const now = new Date().toISOString();
    
    // Check if config already exists to set correct created_at
    const existing = await this.findByShopId(shopId);
    
    const config: EtsySyncConfig = {
      shop_id: shopId,
      last_product_sync: data.last_product_sync,
      last_inventory_sync: data.last_inventory_sync,
      last_receipt_sync: data.last_receipt_sync,
      sync_status: data.sync_status || existing?.sync_status || 'idle',
      sync_error: data.sync_error,
      rate_limit_remaining: data.rate_limit_remaining ?? existing?.rate_limit_remaining ?? 10000,
      rate_limit_reset_at: data.rate_limit_reset_at,
      created_at: existing?.created_at || now,
      updated_at: now,
    };

    const item = this.buildConfigItem(config);

    await this.dynamoDB.put({
      item,
    });

    return config;
  }

  /**
   * Delete sync config by shop ID
   */
  async delete(shopId: string): Promise<void> {
    await this.dynamoDB.delete({
      key: {
        PK: `ETSY_SYNC_CONFIG#${shopId}`,
        SK: 'METADATA',
      },
    });
  }
}
