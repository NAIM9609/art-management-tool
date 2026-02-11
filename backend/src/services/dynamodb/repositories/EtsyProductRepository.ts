/**
 * EtsyProductRepository - DynamoDB implementation for Etsy Product operations
 * 
 * DynamoDB Structure:
 * PK: "ETSY_PRODUCT#${local_product_id}"
 * SK: "METADATA"
 * GSI1PK: "ETSY_LISTING#${etsy_listing_id}"
 * GSI1SK: "METADATA"
 */

import { DynamoDBOptimized } from '../DynamoDBOptimized';
import {
  EtsyProduct,
  CreateEtsyProductData,
  UpdateEtsyProductData,
} from './types';

export class EtsyProductRepository {
  private dynamoDB: DynamoDBOptimized;
  
  constructor(dynamoDB: DynamoDBOptimized) {
    this.dynamoDB = dynamoDB;
  }

  /**
   * Map DynamoDB item to EtsyProduct interface
   */
  private mapToProduct(item: Record<string, any>): EtsyProduct {
    return {
      local_product_id: item.local_product_id,
      etsy_listing_id: item.etsy_listing_id,
      title: item.title,
      description: item.description,
      price: item.price,
      quantity: item.quantity,
      sku: item.sku,
      state: item.state,
      url: item.url,
      last_synced_at: item.last_synced_at,
      sync_status: item.sync_status,
      created_at: item.created_at,
      updated_at: item.updated_at,
    };
  }

  /**
   * Build DynamoDB item from EtsyProduct
   */
  private buildProductItem(product: EtsyProduct): Record<string, any> {
    const item: Record<string, any> = {
      PK: `ETSY_PRODUCT#${product.local_product_id}`,
      SK: 'METADATA',
      local_product_id: product.local_product_id,
      etsy_listing_id: product.etsy_listing_id,
      title: product.title,
      quantity: product.quantity,
      sync_status: product.sync_status,
      created_at: product.created_at,
      updated_at: product.updated_at,
      // GSI1 - Product by Etsy listing ID
      GSI1PK: `ETSY_LISTING#${product.etsy_listing_id}`,
      GSI1SK: 'METADATA',
    };

    // Add optional fields
    if (product.description !== undefined) item.description = product.description;
    if (product.price !== undefined) item.price = product.price;
    if (product.sku !== undefined) item.sku = product.sku;
    if (product.state !== undefined) item.state = product.state;
    if (product.url !== undefined) item.url = product.url;
    if (product.last_synced_at !== undefined) item.last_synced_at = product.last_synced_at;

    return item;
  }

  /**
   * Create a new Etsy product
   */
  async create(data: CreateEtsyProductData): Promise<EtsyProduct> {
    const now = new Date().toISOString();

    const product: EtsyProduct = {
      local_product_id: data.local_product_id,
      etsy_listing_id: data.etsy_listing_id,
      title: data.title,
      description: data.description,
      price: data.price,
      quantity: data.quantity || 0,
      sku: data.sku,
      state: data.state,
      url: data.url,
      sync_status: data.sync_status || 'pending',
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
   * Find product by local product ID (strongly consistent read)
   */
  async findByLocalProductId(localProductId: number): Promise<EtsyProduct | null> {
    const result = await this.dynamoDB.get({
      key: {
        PK: `ETSY_PRODUCT#${localProductId}`,
        SK: 'METADATA',
      },
      consistentRead: true,
    });

    if (!result.data) {
      return null;
    }

    return this.mapToProduct(result.data);
  }

  /**
   * Find product by Etsy listing ID using GSI1 (eventually consistent)
   */
  async findByEtsyListingId(etsyListingId: number): Promise<EtsyProduct | null> {
    const result = await this.dynamoDB.queryEventuallyConsistent({
      indexName: 'GSI1',
      keyConditionExpression: 'GSI1PK = :gsi1pk AND GSI1SK = :gsi1sk',
      expressionAttributeValues: {
        ':gsi1pk': `ETSY_LISTING#${etsyListingId}`,
        ':gsi1sk': 'METADATA',
      },
      limit: 1,
    });

    if (result.data.length === 0) {
      return null;
    }

    return this.mapToProduct(result.data[0]);
  }

  /**
   * Update product by local product ID
   */
  async update(localProductId: number, data: UpdateEtsyProductData): Promise<EtsyProduct | null> {
    const now = new Date().toISOString();
    const updates: Record<string, any> = {
      updated_at: now,
    };

    // Build updates object with only provided fields
    if (data.title !== undefined) updates.title = data.title;
    if (data.description !== undefined) updates.description = data.description;
    if (data.price !== undefined) updates.price = data.price;
    if (data.quantity !== undefined) updates.quantity = data.quantity;
    if (data.sku !== undefined) updates.sku = data.sku;
    if (data.state !== undefined) updates.state = data.state;
    if (data.url !== undefined) updates.url = data.url;
    if (data.last_synced_at !== undefined) updates.last_synced_at = data.last_synced_at;
    if (data.sync_status !== undefined) updates.sync_status = data.sync_status;

    try {
      const result = await this.dynamoDB.update({
        key: {
          PK: `ETSY_PRODUCT#${localProductId}`,
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
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException' || error.code === 'ConditionalCheckFailedException') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Update sync status for a product
   */
  async updateSyncStatus(
    localProductId: number,
    syncStatus: string,
    lastSyncedAt?: string
  ): Promise<EtsyProduct | null> {
    const updates: UpdateEtsyProductData = {
      sync_status: syncStatus,
    };

    if (lastSyncedAt) {
      updates.last_synced_at = lastSyncedAt;
    } else {
      updates.last_synced_at = new Date().toISOString();
    }

    return this.update(localProductId, updates);
  }

  /**
   * Delete product by local product ID
   */
  async delete(localProductId: number): Promise<void> {
    await this.dynamoDB.delete({
      key: {
        PK: `ETSY_PRODUCT#${localProductId}`,
        SK: 'METADATA',
      },
    });
  }
}
