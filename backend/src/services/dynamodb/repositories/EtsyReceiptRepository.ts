/**
 * EtsyReceiptRepository - DynamoDB implementation for Etsy Receipt operations
 * 
 * DynamoDB Structure:
 * PK: "ETSY_RECEIPT#${etsy_receipt_id}"
 * SK: "METADATA"
 * GSI1PK: "ETSY_ORDER#${local_order_id}"
 * GSI1SK: "METADATA"
 */

import { DynamoDBOptimized } from '../DynamoDBOptimized';
import {
  EtsyReceipt,
  CreateEtsyReceiptData,
  UpdateEtsyReceiptData,
} from './types';

export class EtsyReceiptRepository {
  private dynamoDB: DynamoDBOptimized;
  
  constructor(dynamoDB: DynamoDBOptimized) {
    this.dynamoDB = dynamoDB;
  }

  /**
   * Map DynamoDB item to EtsyReceipt interface
   */
  private mapToReceipt(item: Record<string, any>): EtsyReceipt {
    return {
      etsy_receipt_id: item.etsy_receipt_id,
      local_order_id: item.local_order_id,
      shop_id: item.shop_id,
      buyer_email: item.buyer_email,
      buyer_name: item.buyer_name,
      status: item.status,
      is_paid: item.is_paid,
      is_shipped: item.is_shipped,
      grand_total: item.grand_total,
      subtotal: item.subtotal,
      total_shipping_cost: item.total_shipping_cost,
      total_tax_cost: item.total_tax_cost,
      currency: item.currency,
      payment_method: item.payment_method,
      shipping_address: item.shipping_address,
      message_from_buyer: item.message_from_buyer,
      etsy_created_at: item.etsy_created_at,
      etsy_updated_at: item.etsy_updated_at,
      last_synced_at: item.last_synced_at,
      sync_status: item.sync_status,
      created_at: item.created_at,
      updated_at: item.updated_at,
    };
  }

  /**
   * Build DynamoDB item from EtsyReceipt
   */
  private buildReceiptItem(receipt: EtsyReceipt): Record<string, any> {
    const item: Record<string, any> = {
      PK: `ETSY_RECEIPT#${receipt.etsy_receipt_id}`,
      SK: 'METADATA',
      etsy_receipt_id: receipt.etsy_receipt_id,
      shop_id: receipt.shop_id,
      is_paid: receipt.is_paid,
      is_shipped: receipt.is_shipped,
      etsy_created_at: receipt.etsy_created_at,
      etsy_updated_at: receipt.etsy_updated_at,
      sync_status: receipt.sync_status,
      created_at: receipt.created_at,
      updated_at: receipt.updated_at,
    };

    // Add GSI1 if local_order_id exists (sparse index)
    if (receipt.local_order_id !== undefined && receipt.local_order_id !== null) {
      item.local_order_id = receipt.local_order_id;
      item.GSI1PK = `ETSY_ORDER#${receipt.local_order_id}`;
      item.GSI1SK = 'METADATA';
    }

    // Add optional fields
    if (receipt.buyer_email !== undefined) item.buyer_email = receipt.buyer_email;
    if (receipt.buyer_name !== undefined) item.buyer_name = receipt.buyer_name;
    if (receipt.status !== undefined) item.status = receipt.status;
    if (receipt.grand_total !== undefined) item.grand_total = receipt.grand_total;
    if (receipt.subtotal !== undefined) item.subtotal = receipt.subtotal;
    if (receipt.total_shipping_cost !== undefined) item.total_shipping_cost = receipt.total_shipping_cost;
    if (receipt.total_tax_cost !== undefined) item.total_tax_cost = receipt.total_tax_cost;
    if (receipt.currency !== undefined) item.currency = receipt.currency;
    if (receipt.payment_method !== undefined) item.payment_method = receipt.payment_method;
    if (receipt.shipping_address !== undefined) item.shipping_address = receipt.shipping_address;
    if (receipt.message_from_buyer !== undefined) item.message_from_buyer = receipt.message_from_buyer;
    if (receipt.last_synced_at !== undefined) item.last_synced_at = receipt.last_synced_at;

    return item;
  }

  /**
   * Create a new Etsy receipt
   */
  async create(data: CreateEtsyReceiptData): Promise<EtsyReceipt> {
    const now = new Date().toISOString();

    const receipt: EtsyReceipt = {
      etsy_receipt_id: data.etsy_receipt_id,
      local_order_id: data.local_order_id,
      shop_id: data.shop_id,
      buyer_email: data.buyer_email,
      buyer_name: data.buyer_name,
      status: data.status,
      is_paid: data.is_paid || false,
      is_shipped: data.is_shipped || false,
      grand_total: data.grand_total,
      subtotal: data.subtotal,
      total_shipping_cost: data.total_shipping_cost,
      total_tax_cost: data.total_tax_cost,
      currency: data.currency,
      payment_method: data.payment_method,
      shipping_address: data.shipping_address,
      message_from_buyer: data.message_from_buyer,
      etsy_created_at: data.etsy_created_at,
      etsy_updated_at: data.etsy_updated_at,
      sync_status: data.sync_status || 'pending',
      created_at: now,
      updated_at: now,
    };

    const item = this.buildReceiptItem(receipt);

    await this.dynamoDB.put({
      item,
      conditionExpression: 'attribute_not_exists(PK)',
    });

    return receipt;
  }

  /**
   * Find receipt by Etsy receipt ID (strongly consistent read)
   */
  async findByEtsyReceiptId(etsyReceiptId: number): Promise<EtsyReceipt | null> {
    const result = await this.dynamoDB.get({
      key: {
        PK: `ETSY_RECEIPT#${etsyReceiptId}`,
        SK: 'METADATA',
      },
      consistentRead: true,
    });

    if (!result.data) {
      return null;
    }

    return this.mapToReceipt(result.data);
  }

  /**
   * Find receipt by local order ID using GSI1 (eventually consistent)
   */
  async findByLocalOrderId(localOrderId: number): Promise<EtsyReceipt | null> {
    const result = await this.dynamoDB.queryEventuallyConsistent({
      indexName: 'GSI1',
      keyConditionExpression: 'GSI1PK = :gsi1pk AND GSI1SK = :gsi1sk',
      expressionAttributeValues: {
        ':gsi1pk': `ETSY_ORDER#${localOrderId}`,
        ':gsi1sk': 'METADATA',
      },
      limit: 1,
    });

    if (result.data.length === 0) {
      return null;
    }

    return this.mapToReceipt(result.data[0]);
  }

  /**
   * Update receipt by Etsy receipt ID
   */
  async update(etsyReceiptId: number, data: UpdateEtsyReceiptData): Promise<EtsyReceipt | null> {
    const now = new Date().toISOString();
    
    // Special case: if local_order_id is being cleared (set to null), we need to REMOVE GSI1 attributes
    // This requires using UpdateCommand directly since DynamoDBOptimized.update only supports SET
    if (data.local_order_id === null) {
      const { UpdateCommand } = await import('@aws-sdk/lib-dynamodb');
      
      // Build update expression with SET and REMOVE clauses
      const setParts: string[] = ['#updated_at = :updated_at'];
      const removeParts: string[] = ['#local_order_id', 'GSI1PK', 'GSI1SK'];
      const expressionAttributeNames: Record<string, string> = {
        '#updated_at': 'updated_at',
        '#local_order_id': 'local_order_id',
      };
      const expressionAttributeValues: Record<string, any> = {
        ':updated_at': now,
      };
      
      // Add other fields to SET if provided
      let attrIndex = 0;
      const fieldsToUpdate: Array<[string, any]> = [
        ['buyer_email', data.buyer_email],
        ['buyer_name', data.buyer_name],
        ['status', data.status],
        ['is_paid', data.is_paid],
        ['is_shipped', data.is_shipped],
        ['grand_total', data.grand_total],
        ['subtotal', data.subtotal],
        ['total_shipping_cost', data.total_shipping_cost],
        ['total_tax_cost', data.total_tax_cost],
        ['currency', data.currency],
        ['payment_method', data.payment_method],
        ['shipping_address', data.shipping_address],
        ['message_from_buyer', data.message_from_buyer],
        ['etsy_updated_at', data.etsy_updated_at],
        ['last_synced_at', data.last_synced_at],
        ['sync_status', data.sync_status],
      ];
      
      fieldsToUpdate.forEach(([key, value]) => {
        if (value !== undefined) {
          const nameKey = `#field${attrIndex}`;
          const valueKey = `:field${attrIndex}`;
          expressionAttributeNames[nameKey] = key;
          expressionAttributeValues[valueKey] = value;
          setParts.push(`${nameKey} = ${valueKey}`);
          attrIndex++;
        }
      });
      
      const updateExpression = `SET ${setParts.join(', ')} REMOVE ${removeParts.join(', ')}`;
      
      const command = new UpdateCommand({
        TableName: (this.dynamoDB as any).tableName || process.env.DYNAMODB_TABLE_NAME,
        Key: {
          PK: `ETSY_RECEIPT#${etsyReceiptId}`,
          SK: 'METADATA',
        },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ConditionExpression: 'attribute_exists(PK)',
        ReturnValues: 'ALL_NEW',
      });
      
      try {
        const client = (this.dynamoDB as any).client;
        const result = await client.send(command);
        
        if (!result.Attributes) {
          return null;
        }
        
        return this.mapToReceipt(result.Attributes);
      } catch (error: any) {
        if (error.name === 'ConditionalCheckFailedException' || error.code === 'ConditionalCheckFailedException') {
          return null;
        }
        throw error;
      }
    }
    
    // Normal update path for other fields
    const updates: Record<string, any> = {
      updated_at: now,
    };

    // Build updates object with only provided fields
    if (data.local_order_id !== undefined) {
      updates.local_order_id = data.local_order_id;
      // Update GSI1 attributes if local_order_id is being set
      if (data.local_order_id !== null) {
        updates.GSI1PK = `ETSY_ORDER#${data.local_order_id}`;
        updates.GSI1SK = 'METADATA';
      }
    }
    if (data.buyer_email !== undefined) updates.buyer_email = data.buyer_email;
    if (data.buyer_name !== undefined) updates.buyer_name = data.buyer_name;
    if (data.status !== undefined) updates.status = data.status;
    if (data.is_paid !== undefined) updates.is_paid = data.is_paid;
    if (data.is_shipped !== undefined) updates.is_shipped = data.is_shipped;
    if (data.grand_total !== undefined) updates.grand_total = data.grand_total;
    if (data.subtotal !== undefined) updates.subtotal = data.subtotal;
    if (data.total_shipping_cost !== undefined) updates.total_shipping_cost = data.total_shipping_cost;
    if (data.total_tax_cost !== undefined) updates.total_tax_cost = data.total_tax_cost;
    if (data.currency !== undefined) updates.currency = data.currency;
    if (data.payment_method !== undefined) updates.payment_method = data.payment_method;
    if (data.shipping_address !== undefined) updates.shipping_address = data.shipping_address;
    if (data.message_from_buyer !== undefined) updates.message_from_buyer = data.message_from_buyer;
    if (data.etsy_updated_at !== undefined) updates.etsy_updated_at = data.etsy_updated_at;
    if (data.last_synced_at !== undefined) updates.last_synced_at = data.last_synced_at;
    if (data.sync_status !== undefined) updates.sync_status = data.sync_status;

    try {
      const result = await this.dynamoDB.update({
        key: {
          PK: `ETSY_RECEIPT#${etsyReceiptId}`,
          SK: 'METADATA',
        },
        updates,
        conditionExpression: 'attribute_exists(PK)',
        returnValues: 'ALL_NEW',
      });

      if (!result.data) {
        return null;
      }

      return this.mapToReceipt(result.data);
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException' || error.code === 'ConditionalCheckFailedException') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Update payment status for a receipt
   */
  async updatePaymentStatus(etsyReceiptId: number, isPaid: boolean): Promise<EtsyReceipt | null> {
    return this.update(etsyReceiptId, { is_paid: isPaid });
  }

  /**
   * Update shipping status for a receipt
   */
  async updateShippingStatus(etsyReceiptId: number, isShipped: boolean): Promise<EtsyReceipt | null> {
    return this.update(etsyReceiptId, { is_shipped: isShipped });
  }

  /**
   * Delete receipt by Etsy receipt ID
   */
  async delete(etsyReceiptId: number): Promise<void> {
    await this.dynamoDB.delete({
      key: {
        PK: `ETSY_RECEIPT#${etsyReceiptId}`,
        SK: 'METADATA',
      },
    });
  }
}
