/**
 * OrderRepository - DynamoDB implementation for Order CRUD operations
 * 
 * DynamoDB Structure:
 * PK: "ORDER#${id}"
 * SK: "METADATA"
 * GSI1PK: "ORDER_NUMBER#${order_number}"
 * GSI2PK: "ORDER_EMAIL#${customer_email}"
 * GSI2SK: "${created_at}"
 * GSI3PK: "ORDER_STATUS#${status}"
 * GSI3SK: "${created_at}"
 * 
 * Order Number Format: ORD-YYYYMMDD-XXXX
 */

import { DynamoDBOptimized } from '../DynamoDBOptimized';
import {
  Order,
  OrderStatus,
  OrderSummary,
  CreateOrderData,
  UpdateOrderData,
  OrderFilters,
  PaginationParams,
  PaginatedResponse,
} from './types';
import { v4 as uuidv4 } from 'uuid';

export class OrderRepository {
  private dynamoDB: DynamoDBOptimized;
  private readonly COUNTER_PK = 'COUNTER';
  private readonly COUNTER_SK_PREFIX = 'ORDER_NUMBER_';

  constructor(dynamoDB: DynamoDBOptimized) {
    this.dynamoDB = dynamoDB;
  }

  /**
   * Normalize start date to beginning of day (00:00:00.000Z)
   * Handles both YYYY-MM-DD and full ISO timestamp formats
   */
  private normalizeStartDate(date: string): string {
    // If already full ISO timestamp, return as is
    if (date.includes('T')) {
      return date;
    }
    // Convert YYYY-MM-DD to start of day
    return `${date}T00:00:00.000Z`;
  }

  /**
   * Normalize end date to end of day (23:59:59.999Z)
   * Handles both YYYY-MM-DD and full ISO timestamp formats
   */
  private normalizeEndDate(date: string): string {
    // If already full ISO timestamp, return as is
    if (date.includes('T')) {
      return date;
    }
    // Convert YYYY-MM-DD to end of day
    return `${date}T23:59:59.999Z`;
  }

  /**
   * Generate order number in format ORD-YYYYMMDD-XXXX
   * Uses atomic counter per day to ensure uniqueness
   */
  async generateOrderNumber(): Promise<string> {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
    const counterSK = `${this.COUNTER_SK_PREFIX}${dateStr}`;

    // Use atomic ADD operation to increment counter for this day
    const { UpdateCommand } = await import('@aws-sdk/lib-dynamodb');
    const command = new UpdateCommand({
      TableName: (this.dynamoDB as any).tableName || process.env.DYNAMODB_TABLE_NAME,
      Key: {
        PK: this.COUNTER_PK,
        SK: counterSK,
      },
      UpdateExpression: 'SET #v = if_not_exists(#v, :zero) + :one',
      ExpressionAttributeNames: {
        '#v': 'value',
      },
      ExpressionAttributeValues: {
        ':zero': 0,
        ':one': 1,
      },
      ReturnValues: 'ALL_NEW',
    });

    const client = (this.dynamoDB as any).client;
    const result = await client.send(command);
    const sequentialNumber = result.Attributes?.value || 1;

    // Format: ORD-YYYYMMDD-XXXX (pad sequential number to 4 digits)
    const paddedNumber = sequentialNumber.toString().padStart(4, '0');
    return `ORD-${dateStr}-${paddedNumber}`;
  }

  /**
   * Map DynamoDB item to OrderSummary interface (for list queries)
   */
  mapToOrderSummary(item: Record<string, any>): OrderSummary {
    return {
      id: item.id,
      order_number: item.order_number,
      customer_email: item.customer_email,
      customer_name: item.customer_name,
      total: item.total,
      status: item.status as OrderStatus,
      created_at: item.created_at,
      subtotal: item.subtotal,
      tax: item.tax,
      discount: item.discount,
      currency: item.currency,
      updated_at: item.updated_at,
    };
  }

  /**
   * Map DynamoDB item to Order interface
   */
  mapToOrder(item: Record<string, any>): Order {
    return {
      id: item.id,
      order_number: item.order_number,
      user_id: item.user_id,
      customer_email: item.customer_email,
      customer_name: item.customer_name,
      subtotal: item.subtotal,
      tax: item.tax,
      discount: item.discount,
      total: item.total,
      currency: item.currency,
      status: item.status as OrderStatus,
      payment_status: item.payment_status,
      payment_intent_id: item.payment_intent_id,
      payment_method: item.payment_method,
      fulfillment_status: item.fulfillment_status,
      shipping_address: item.shipping_address,
      billing_address: item.billing_address,
      notes: item.notes,
      created_at: item.created_at,
      updated_at: item.updated_at,
      deleted_at: item.deleted_at,
    };
  }

  /**
   * Build DynamoDB item from Order
   */
  buildOrderItem(order: Order): Record<string, any> {
    const item: Record<string, any> = {
      PK: `ORDER#${order.id}`,
      SK: 'METADATA',
      GSI1PK: `ORDER_NUMBER#${order.order_number}`,
      GSI2PK: `ORDER_EMAIL#${order.customer_email}`,
      GSI2SK: order.created_at,
      GSI3PK: `ORDER_STATUS#${order.status}`,
      GSI3SK: order.created_at,
      id: order.id,
      order_number: order.order_number,
      customer_email: order.customer_email,
      customer_name: order.customer_name,
      subtotal: order.subtotal,
      tax: order.tax,
      discount: order.discount,
      total: order.total,
      currency: order.currency,
      status: order.status,
      created_at: order.created_at,
      updated_at: order.updated_at,
    };

    // Optional fields
    if (order.user_id !== undefined) item.user_id = order.user_id;
    if (order.payment_status) item.payment_status = order.payment_status;
    if (order.payment_intent_id) item.payment_intent_id = order.payment_intent_id;
    if (order.payment_method) item.payment_method = order.payment_method;
    if (order.fulfillment_status) item.fulfillment_status = order.fulfillment_status;
    if (order.shipping_address) item.shipping_address = order.shipping_address;
    if (order.billing_address) item.billing_address = order.billing_address;
    if (order.notes) item.notes = order.notes;
    if (order.deleted_at) item.deleted_at = order.deleted_at;

    return item;
  }

  /**
   * Create a new order with auto-generated order number
   */
  async create(data: CreateOrderData): Promise<Order> {
    const now = new Date().toISOString();
    const id = uuidv4();
    const orderNumber = await this.generateOrderNumber();

    const order: Order = {
      id,
      order_number: orderNumber,
      user_id: data.user_id,
      customer_email: data.customer_email,
      customer_name: data.customer_name,
      subtotal: data.subtotal,
      tax: data.tax || 0,
      discount: data.discount || 0,
      total: data.total,
      currency: data.currency || 'EUR',
      status: data.status || OrderStatus.PENDING,
      payment_status: data.payment_status,
      payment_intent_id: data.payment_intent_id,
      payment_method: data.payment_method,
      fulfillment_status: data.fulfillment_status,
      shipping_address: data.shipping_address,
      billing_address: data.billing_address,
      notes: data.notes,
      created_at: now,
      updated_at: now,
    };

    const item = this.buildOrderItem(order);
    await this.dynamoDB.put({
      item,
      conditionExpression: 'attribute_not_exists(PK)',
    });

    return order;
  }

  /**
   * Find order by ID
   */
  async findById(id: string): Promise<Order | null> {
    const result = await this.dynamoDB.get({
      key: {
        PK: `ORDER#${id}`,
        SK: 'METADATA',
      },
      consistentRead: true, // Strongly consistent for findById
    });

    if (!result.data) {
      return null;
    }

    return this.mapToOrder(result.data);
  }

  /**
   * Find order by order number using GSI1
   */
  async findByOrderNumber(orderNumber: string): Promise<Order | null> {
    const result = await this.dynamoDB.queryEventuallyConsistent({
      indexName: 'GSI1',
      keyConditionExpression: 'GSI1PK = :pk',
      expressionAttributeValues: {
        ':pk': `ORDER_NUMBER#${orderNumber}`,
      },
      limit: 1,
    });

    if (!result.data || result.data.length === 0) {
      return null;
    }

    return this.mapToOrder(result.data[0]);
  }

  /**
   * Find all orders with optional filters and pagination
   * Supports filtering by status, customer_email, and date range
   * Note: For cost optimization, this queries using GSI2 or GSI3
   */
  async findAll(
    filters?: OrderFilters,
    pagination?: PaginationParams
  ): Promise<PaginatedResponse<OrderSummary>> {
    const limit = pagination?.limit || 30;
    const { status, customer_email, startDate, endDate } = filters || {};

    // Build query parameters based on available filters
    let indexName: string;
    let keyConditionExpression: string;
    const expressionAttributeValues: Record<string, unknown> = {};
    const expressionAttributeNames: Record<string, string> = {
      '#status': 'status',
    };
    const filterExpressions: string[] = ['attribute_not_exists(deleted_at)'];

    if (customer_email) {
      // Query by customer email using GSI2
      indexName = 'GSI2';
      expressionAttributeValues[':pk'] = `ORDER_EMAIL#${customer_email}`;

      // Apply date range on GSI2SK (created_at) when provided
      if (startDate && endDate) {
        keyConditionExpression = 'GSI2PK = :pk AND GSI2SK BETWEEN :startDate AND :endDate';
        expressionAttributeValues[':startDate'] = this.normalizeStartDate(startDate);
        expressionAttributeValues[':endDate'] = this.normalizeEndDate(endDate);
      } else if (startDate) {
        keyConditionExpression = 'GSI2PK = :pk AND GSI2SK >= :startDate';
        expressionAttributeValues[':startDate'] = this.normalizeStartDate(startDate);
      } else if (endDate) {
        keyConditionExpression = 'GSI2PK = :pk AND GSI2SK <= :endDate';
        expressionAttributeValues[':endDate'] = this.normalizeEndDate(endDate);
      } else {
        keyConditionExpression = 'GSI2PK = :pk';
      }
    } else {
      // Default to querying by status using GSI3
      const effectiveStatus = status || OrderStatus.PENDING;
      indexName = 'GSI3';
      expressionAttributeValues[':pk'] = `ORDER_STATUS#${effectiveStatus}`;

      // Apply date range on GSI3SK (created_at) when provided
      if (startDate && endDate) {
        keyConditionExpression = 'GSI3PK = :pk AND GSI3SK BETWEEN :startDate AND :endDate';
        expressionAttributeValues[':startDate'] = this.normalizeStartDate(startDate);
        expressionAttributeValues[':endDate'] = this.normalizeEndDate(endDate);
      } else if (startDate) {
        keyConditionExpression = 'GSI3PK = :pk AND GSI3SK >= :startDate';
        expressionAttributeValues[':startDate'] = this.normalizeStartDate(startDate);
      } else if (endDate) {
        keyConditionExpression = 'GSI3PK = :pk AND GSI3SK <= :endDate';
        expressionAttributeValues[':endDate'] = this.normalizeEndDate(endDate);
      } else {
        keyConditionExpression = 'GSI3PK = :pk';
      }
    }

    const result = await this.dynamoDB.queryEventuallyConsistent({
      indexName,
      keyConditionExpression,
      expressionAttributeValues,
      limit,
      exclusiveStartKey: pagination?.lastEvaluatedKey,
      scanIndexForward: false, // Most recent first
      projectionExpression: 'id, order_number, customer_email, customer_name, total, #status, created_at',
      expressionAttributeNames,
      filterExpression: filterExpressions.join(' AND '),
    });

    const orders = (result.data || []).map((item) => this.mapToOrderSummary(item));

    return {
      items: orders,
      lastEvaluatedKey: result.lastEvaluatedKey,
      count: orders.length,
    };
  }

  /**
   * Update an order
   */
  async update(id: string, data: UpdateOrderData): Promise<Order | null> {
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

    const now = new Date().toISOString();
    const updated: Order = {
      ...existing,
      ...data,
      updated_at: now,
    };

    const item = this.buildOrderItem(updated);
    await this.dynamoDB.put({
      item,
    });

    return updated;
  }

  /**
   * Soft delete an order
   */
  async softDelete(id: string): Promise<boolean> {
    const existing = await this.findById(id);
    if (!existing) {
      return false;
    }

    await this.dynamoDB.softDelete({
      key: {
        PK: `ORDER#${id}`,
        SK: 'METADATA',
      },
      deletedAtField: 'deleted_at',
    });

    return true;
  }

  /**
   * Find orders by customer email using GSI2
   */
  async findByCustomerEmail(
    email: string,
    pagination?: PaginationParams
  ): Promise<PaginatedResponse<OrderSummary>> {
    const limit = pagination?.limit || 30;

    const result = await this.dynamoDB.queryEventuallyConsistent({
      indexName: 'GSI2',
      keyConditionExpression: 'GSI2PK = :pk',
      expressionAttributeValues: {
        ':pk': `ORDER_EMAIL#${email}`,
      },
      limit,
      exclusiveStartKey: pagination?.lastEvaluatedKey,
      scanIndexForward: false, // Most recent first
      projectionExpression: 'id, order_number, total, #status, created_at',
      expressionAttributeNames: {
        '#status': 'status',
      },
      filterExpression: 'attribute_not_exists(deleted_at)',
    });

    const orders = (result.data || []).map((item) => this.mapToOrderSummary(item));

    return {
      items: orders,
      lastEvaluatedKey: result.lastEvaluatedKey,
      count: orders.length,
    };
  }

  /**
   * Find orders by status using GSI3
   */
  async findByStatus(
    status: OrderStatus,
    pagination?: PaginationParams
  ): Promise<PaginatedResponse<OrderSummary>> {
    const limit = pagination?.limit || 30;

    const result = await this.dynamoDB.queryEventuallyConsistent({
      indexName: 'GSI3',
      keyConditionExpression: 'GSI3PK = :pk',
      expressionAttributeValues: {
        ':pk': `ORDER_STATUS#${status}`,
      },
      limit,
      exclusiveStartKey: pagination?.lastEvaluatedKey,
      scanIndexForward: false, // Most recent first
      projectionExpression: 'id, order_number, customer_email, customer_name, total, #status, created_at',
      expressionAttributeNames: {
        '#status': 'status',
      },
      filterExpression: 'attribute_not_exists(deleted_at)',
    });

    const orders = (result.data || []).map((item) => this.mapToOrderSummary(item));

    return {
      items: orders,
      lastEvaluatedKey: result.lastEvaluatedKey,
      count: orders.length,
    };
  }

  /**
   * Find orders within a date range
   * Uses GSI3 with status filter
   * 
   * Note: When status is not provided, this method queries all statuses sequentially
   * which may result in higher read costs. For production use, consider providing a status
   * or implementing a dedicated GSI with created_at as the partition key.
   * 
   * Date parameters: Accept YYYY-MM-DD format (will be normalized to full day range)
   * or full ISO timestamps for precise control.
   */
  async findByDateRange(
    startDate: string,
    endDate: string,
    status?: OrderStatus,
    pagination?: PaginationParams
  ): Promise<PaginatedResponse<OrderSummary>> {
    const limit = pagination?.limit || 30;
    const normalizedStart = this.normalizeStartDate(startDate);
    const normalizedEnd = this.normalizeEndDate(endDate);

    if (status) {
      // Use GSI3 with date range on sort key
      const result = await this.dynamoDB.queryEventuallyConsistent({
        indexName: 'GSI3',
        keyConditionExpression: 'GSI3PK = :pk AND GSI3SK BETWEEN :start AND :end',
        expressionAttributeValues: {
          ':pk': `ORDER_STATUS#${status}`,
          ':start': normalizedStart,
          ':end': normalizedEnd,
        },
        limit,
        exclusiveStartKey: pagination?.lastEvaluatedKey,
        scanIndexForward: false,
        projectionExpression: 'id, order_number, customer_email, customer_name, total, #status, created_at',
        expressionAttributeNames: {
          '#status': 'status',
        },
        filterExpression: 'attribute_not_exists(deleted_at)',
      });

      const orders = (result.data || []).map((item) => this.mapToOrderSummary(item));

      return {
        items: orders,
        lastEvaluatedKey: result.lastEvaluatedKey,
        count: orders.length,
      };
    } else {
      // Without status, query all statuses and filter by date
      // Warning: This queries each status sequentially and may be expensive
      // Performance: 6 queries (one per status) with reduced limit per query
      // Note: Pagination is not supported in this mode - returns up to 'limit' total items
      const allOrders: OrderSummary[] = [];
      const statuses = Object.values(OrderStatus);
      const perStatusLimit = Math.ceil(limit / statuses.length); // Distribute limit across statuses
      
      for (const orderStatus of statuses) {
        const result = await this.dynamoDB.queryEventuallyConsistent({
          indexName: 'GSI3',
          keyConditionExpression: 'GSI3PK = :pk AND GSI3SK BETWEEN :start AND :end',
          expressionAttributeValues: {
            ':pk': `ORDER_STATUS#${orderStatus}`,
            ':start': normalizedStart,
            ':end': normalizedEnd,
          },
          limit: perStatusLimit,
          scanIndexForward: false, // Most recent first for each status
          projectionExpression: 'id, order_number, customer_email, customer_name, total, #status, created_at',
          expressionAttributeNames: {
            '#status': 'status',
          },
          filterExpression: 'attribute_not_exists(deleted_at)',
        });

        allOrders.push(...(result.data || []).map((item) => this.mapToOrderSummary(item)));
      }

      // Sort by created_at descending and apply pagination
      allOrders.sort((a, b) => b.created_at.localeCompare(a.created_at));
      const paginatedOrders = allOrders.slice(0, limit);

      return {
        items: paginatedOrders,
        lastEvaluatedKey: undefined, // Pagination not supported for multi-status queries
        count: paginatedOrders.length,
      };
    }
  }

  /**
   * Batch get multiple orders by IDs
   * Cost optimization: Uses batch get operation
   */
  async batchGet(ids: string[]): Promise<Order[]> {
    if (ids.length === 0) {
      return [];
    }

    const keys = ids.map((id) => ({
      PK: `ORDER#${id}`,
      SK: 'METADATA',
    }));

    const result = await this.dynamoDB.batchGetOptimized({
      keys,
    });

    return (result.data || []).map((item) => this.mapToOrder(item));
  }
}
