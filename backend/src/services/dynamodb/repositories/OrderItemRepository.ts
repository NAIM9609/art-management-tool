/**
 * OrderItemRepository - DynamoDB implementation for OrderItem CRUD operations
 * 
 * DynamoDB Structure:
 * PK: "ORDER#${order_id}"
 * SK: "ITEM#${id}"
 * entity_type: "OrderItem"
 * 
 * Cost Optimizations:
 * - Store as children of orders (single query)
 * - Batch create for all order items at once
 * - No GSI needed
 */

import { DynamoDBOptimized } from '../DynamoDBOptimized';
import { OrderItem, CreateOrderItemData } from './types';
import { v4 as uuidv4 } from 'uuid';

export class OrderItemRepository {
  private dynamoDB: DynamoDBOptimized;
  
  constructor(dynamoDB: DynamoDBOptimized) {
    this.dynamoDB = dynamoDB;
  }

  /**
   * Map DynamoDB item to OrderItem interface
   */
  mapToOrderItem(item: Record<string, any>): OrderItem {
    return {
      id: item.id,
      order_id: item.order_id,
      product_id: item.product_id,
      variant_id: item.variant_id,
      product_name: item.product_name,
      variant_name: item.variant_name,
      sku: item.sku,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total_price: item.total_price,
      created_at: item.created_at,
    };
  }

  /**
   * Build DynamoDB item from OrderItem
   */
  buildOrderItemItem(orderItem: OrderItem): Record<string, any> {
    const item: Record<string, any> = {
      PK: `ORDER#${orderItem.order_id}`,
      SK: `ITEM#${orderItem.id}`,
      entity_type: 'OrderItem',
      id: orderItem.id,
      order_id: orderItem.order_id,
      product_name: orderItem.product_name,
      quantity: orderItem.quantity,
      unit_price: orderItem.unit_price,
      total_price: orderItem.total_price,
      created_at: orderItem.created_at,
    };

    // Add optional fields
    if (orderItem.product_id !== undefined) item.product_id = orderItem.product_id;
    if (orderItem.variant_id !== undefined) item.variant_id = orderItem.variant_id;
    if (orderItem.variant_name !== undefined) item.variant_name = orderItem.variant_name;
    if (orderItem.sku !== undefined) item.sku = orderItem.sku;

    return item;
  }

  /**
   * Create a new order item
   */
  async create(data: CreateOrderItemData): Promise<OrderItem> {
    const now = new Date().toISOString();
    const id = uuidv4();

    const orderItem: OrderItem = {
      id,
      order_id: data.order_id,
      product_id: data.product_id,
      variant_id: data.variant_id,
      product_name: data.product_name,
      variant_name: data.variant_name,
      sku: data.sku,
      quantity: data.quantity,
      unit_price: data.unit_price,
      total_price: data.total_price,
      created_at: now,
    };

    const item = this.buildOrderItemItem(orderItem);

    await this.dynamoDB.put({
      item,
      conditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
    });

    return orderItem;
  }

  /**
   * Find all items for a specific order
   * Cost-optimized: Single query retrieves all items
   */
  async findByOrderId(orderId: number): Promise<OrderItem[]> {
    const result = await this.dynamoDB.queryEventuallyConsistent({
      keyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      expressionAttributeValues: {
        ':pk': `ORDER#${orderId}`,
        ':sk': 'ITEM#',
      },
    });

    return result.data.map(item => this.mapToOrderItem(item));
  }

  /**
   * Batch create multiple order items at once
   * Cost-optimized: Creates up to 25 items in a single batch operation
   */
  async batchCreate(items: CreateOrderItemData[]): Promise<OrderItem[]> {
    if (items.length === 0) {
      return [];
    }

    if (items.length > 25) {
      throw new Error('Batch create supports up to 25 order items at a time');
    }

    const now = new Date().toISOString();
    const createdItems: OrderItem[] = [];

    // Build order item items
    const dynamoItems = items.map(data => {
      const id = uuidv4();
      const orderItem: OrderItem = {
        id,
        order_id: data.order_id,
        product_id: data.product_id,
        variant_id: data.variant_id,
        product_name: data.product_name,
        variant_name: data.variant_name,
        sku: data.sku,
        quantity: data.quantity,
        unit_price: data.unit_price,
        total_price: data.total_price,
        created_at: now,
      };
      createdItems.push(orderItem);
      return this.buildOrderItemItem(orderItem);
    });

    // Use batch write
    await this.dynamoDB.batchWriteOptimized({
      items: dynamoItems.map(item => ({ type: 'put' as const, item })),
    });

    return createdItems;
  }
}
