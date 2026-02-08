import { DynamoDBHelper, EntityPrefix, GSI } from '../database/dynamodb-client';

export enum PaymentStatus {
  PENDING = 'pending',
  PAID = 'paid',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

export enum FulfillmentStatus {
  UNFULFILLED = 'unfulfilled',
  FULFILLED = 'fulfilled',
  PARTIALLY_FULFILLED = 'partially_fulfilled',
}

export interface Order {
  id: number;
  order_number: string;
  user_id?: number;
  customer_email: string;
  customer_name: string;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  currency: string;
  payment_status: PaymentStatus;
  payment_intent_id?: string;
  payment_method?: string;
  fulfillment_status: FulfillmentStatus;
  shipping_address?: Record<string, any>;
  billing_address?: Record<string, any>;
  notes?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
  // Populated relations
  items?: OrderItem[];
}

export interface OrderItem {
  id: number;
  order_id: number;
  product_id: number;
  variant_id?: number;
  product_name: string;
  variant_name?: string;
  sku?: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  created_at: string;
  updated_at: string;
}

export interface OrderFilters {
  status?: PaymentStatus;
  fulfillmentStatus?: FulfillmentStatus;
  customerEmail?: string;
  dateFrom?: string;
  dateTo?: string;
}

export class OrderRepository {
  
  /**
   * Create a new order
   */
  static async create(data: Omit<Order, 'id' | 'order_number' | 'created_at' | 'updated_at'>): Promise<Order> {
    const id = await DynamoDBHelper.getNextId(EntityPrefix.ORDER);
    const now = new Date().toISOString();
    const orderNumber = `ORD-${String(id).padStart(8, '0')}`;
    
    const order: Order = {
      ...data,
      id,
      order_number: orderNumber,
      created_at: now,
      updated_at: now,
    };

    await DynamoDBHelper.put({
      PK: `${EntityPrefix.ORDER}#${id}`,
      SK: 'METADATA',
      GSI1PK: `ORDER_NUMBER#${orderNumber}`,
      GSI1SK: `${EntityPrefix.ORDER}#${id}`,
      GSI2PK: `ORDER_EMAIL#${data.customer_email.toLowerCase()}`,
      GSI2SK: now,
      GSI3PK: `ORDER_STATUS#${data.payment_status}`,
      GSI3SK: now,
      entity_type: 'Order',
      ...order,
    });

    return order;
  }

  /**
   * Find order by ID
   */
  static async findById(id: number, includeDeleted: boolean = false): Promise<Order | null> {
    const item = await DynamoDBHelper.get(`${EntityPrefix.ORDER}#${id}`, 'METADATA');
    if (!item) return null;
    if (!includeDeleted && item.deleted_at) return null;
    return this.mapToOrder(item);
  }

  /**
   * Find order by order number
   */
  static async findByOrderNumber(orderNumber: string): Promise<Order | null> {
    const items = await DynamoDBHelper.query({
      indexName: GSI.GSI1,
      keyConditionExpression: 'GSI1PK = :pk',
      expressionAttributeValues: {
        ':pk': `ORDER_NUMBER#${orderNumber}`,
      },
      limit: 1,
    });

    if (items.length === 0 || items[0].deleted_at) return null;
    return this.mapToOrder(items[0]);
  }

  /**
   * Find orders by customer email
   */
  static async findByCustomerEmail(email: string): Promise<Order[]> {
    const items = await DynamoDBHelper.query({
      indexName: GSI.GSI2,
      keyConditionExpression: 'GSI2PK = :pk',
      expressionAttributeValues: {
        ':pk': `ORDER_EMAIL#${email.toLowerCase()}`,
      },
      scanIndexForward: false,
    });

    return items
      .filter(item => !item.deleted_at)
      .map(this.mapToOrder);
  }

  /**
   * Find orders by payment status
   */
  static async findByPaymentStatus(status: PaymentStatus): Promise<Order[]> {
    const items = await DynamoDBHelper.query({
      indexName: GSI.GSI3,
      keyConditionExpression: 'GSI3PK = :pk',
      expressionAttributeValues: {
        ':pk': `ORDER_STATUS#${status}`,
      },
      scanIndexForward: false,
    });

    return items
      .filter(item => !item.deleted_at)
      .map(this.mapToOrder);
  }

  /**
   * Find all orders with filters and pagination
   */
  static async findAll(filters: OrderFilters = {}, page: number = 1, perPage: number = 20): Promise<{ orders: Order[]; total: number }> {
    let items: any[];

    if (filters.status) {
      items = await DynamoDBHelper.query({
        indexName: GSI.GSI3,
        keyConditionExpression: 'GSI3PK = :pk',
        expressionAttributeValues: {
          ':pk': `ORDER_STATUS#${filters.status}`,
        },
        scanIndexForward: false,
      });
    } else if (filters.customerEmail) {
      items = await DynamoDBHelper.query({
        indexName: GSI.GSI2,
        keyConditionExpression: 'GSI2PK = :pk',
        expressionAttributeValues: {
          ':pk': `ORDER_EMAIL#${filters.customerEmail.toLowerCase()}`,
        },
        scanIndexForward: false,
      });
    } else {
      // Scan all orders
      items = await DynamoDBHelper.scan({
        filterExpression: 'entity_type = :type',
        expressionAttributeValues: {
          ':type': 'Order',
        },
      });
    }

    let filteredOrders = items
      .filter(item => !item.deleted_at)
      .map(this.mapToOrder);

    // Apply additional filters
    if (filters.fulfillmentStatus) {
      filteredOrders = filteredOrders.filter(o => o.fulfillment_status === filters.fulfillmentStatus);
    }

    if (filters.dateFrom) {
      filteredOrders = filteredOrders.filter(o => o.created_at >= filters.dateFrom!);
    }

    if (filters.dateTo) {
      filteredOrders = filteredOrders.filter(o => o.created_at <= filters.dateTo!);
    }

    // Sort by created_at descending
    filteredOrders.sort((a, b) => b.created_at.localeCompare(a.created_at));

    const total = filteredOrders.length;
    const startIndex = (page - 1) * perPage;
    const paginatedOrders = filteredOrders.slice(startIndex, startIndex + perPage);

    return { orders: paginatedOrders, total };
  }

  /**
   * Find order with items
   */
  static async findByIdWithItems(id: number): Promise<Order | null> {
    const order = await this.findById(id);
    if (!order) return null;

    order.items = await OrderItemRepository.findByOrderId(id);
    return order;
  }

  /**
   * Update an order
   */
  static async update(id: number, data: Partial<Order>): Promise<Order> {
    const { id: _, order_number: __, created_at: ___, items: ____, ...updateData } = data as any;
    
    const { updateExpression, expressionAttributeValues, expressionAttributeNames } = 
      DynamoDBHelper.buildUpdateExpression(updateData);

    const result = await DynamoDBHelper.update(
      `${EntityPrefix.ORDER}#${id}`,
      'METADATA',
      updateExpression,
      expressionAttributeValues,
      expressionAttributeNames
    );

    return this.mapToOrder(result);
  }

  /**
   * Update payment status
   */
  static async updatePaymentStatus(id: number, status: PaymentStatus, paymentIntentId?: string): Promise<Order> {
    const updateData: any = { payment_status: status };
    if (paymentIntentId) {
      updateData.payment_intent_id = paymentIntentId;
    }
    return this.update(id, updateData);
  }

  /**
   * Update fulfillment status
   */
  static async updateFulfillmentStatus(id: number, status: FulfillmentStatus): Promise<Order> {
    return this.update(id, { fulfillment_status: status });
  }

  /**
   * Soft delete an order
   */
  static async softDelete(id: number): Promise<void> {
    await DynamoDBHelper.softDelete(`${EntityPrefix.ORDER}#${id}`, 'METADATA');
  }

  /**
   * Create order with items (transactional)
   */
  static async createWithItems(orderData: Omit<Order, 'id' | 'order_number' | 'created_at' | 'updated_at'>, items: Omit<OrderItem, 'id' | 'order_id' | 'created_at' | 'updated_at'>[]): Promise<Order> {
    const maxTransactItems = 25;
    if (items.length + 1 > maxTransactItems) {
      throw new Error(`Order has too many items for a single transaction. Max items per order: ${maxTransactItems - 1}`);
    }

    const id = await DynamoDBHelper.getNextId(EntityPrefix.ORDER);
    const now = new Date().toISOString();
    const orderNumber = `ORD-${String(id).padStart(8, '0')}`;

    const order: Order = {
      ...orderData,
      id,
      order_number: orderNumber,
      created_at: now,
      updated_at: now,
    };

    const orderItemRecords: OrderItem[] = [];
    for (const item of items) {
      const itemId = await DynamoDBHelper.getNextId(EntityPrefix.ORDER_ITEM);
      orderItemRecords.push({
        ...item,
        id: itemId,
        order_id: id,
        created_at: now,
        updated_at: now,
      });
    }

    await DynamoDBHelper.transactWrite([
      {
        type: 'Put',
        item: {
          PK: `${EntityPrefix.ORDER}#${id}`,
          SK: 'METADATA',
          GSI1PK: `ORDER_NUMBER#${orderNumber}`,
          GSI1SK: `${EntityPrefix.ORDER}#${id}`,
          GSI2PK: `ORDER_EMAIL#${orderData.customer_email.toLowerCase()}`,
          GSI2SK: now,
          GSI3PK: `ORDER_STATUS#${orderData.payment_status}`,
          GSI3SK: now,
          entity_type: 'Order',
          ...order,
        },
      },
      ...orderItemRecords.map(orderItem => ({
        type: 'Put' as const,
        item: {
          PK: `${EntityPrefix.ORDER}#${id}`,
          SK: `ITEM#${orderItem.id}`,
          GSI1PK: `ORDERITEM#${orderItem.id}`,
          GSI1SK: 'METADATA',
          entity_type: 'OrderItem',
          ...orderItem,
        },
      })),
    ]);

    order.items = orderItemRecords;
    return order;
  }

  /**
   * Get order statistics
   */
  static async getStatistics(dateFrom?: string, dateTo?: string): Promise<{
    totalOrders: number;
    totalRevenue: number;
    pendingOrders: number;
    paidOrders: number;
  }> {
    const items = await DynamoDBHelper.scan({
      filterExpression: 'entity_type = :type',
      expressionAttributeValues: {
        ':type': 'Order',
      },
    });

    let orders = items.filter(item => !item.deleted_at);

    if (dateFrom) {
      orders = orders.filter(o => o.created_at >= dateFrom);
    }
    if (dateTo) {
      orders = orders.filter(o => o.created_at <= dateTo);
    }

    const paidOrders = orders.filter(o => o.payment_status === PaymentStatus.PAID);
    const pendingOrders = orders.filter(o => o.payment_status === PaymentStatus.PENDING);
    const totalRevenue = paidOrders.reduce((sum, o) => sum + parseFloat(o.total), 0);

    return {
      totalOrders: orders.length,
      totalRevenue,
      pendingOrders: pendingOrders.length,
      paidOrders: paidOrders.length,
    };
  }

  private static mapToOrder(item: any): Order {
    const { PK, SK, GSI1PK, GSI1SK, GSI2PK, GSI2SK, GSI3PK, GSI3SK, entity_type, ...order } = item;
    return order as Order;
  }
}

export class OrderItemRepository {
  
  /**
   * Create an order item
   */
  static async create(data: Omit<OrderItem, 'id' | 'created_at' | 'updated_at'>): Promise<OrderItem> {
    const id = await DynamoDBHelper.getNextId(EntityPrefix.ORDER_ITEM);
    const now = new Date().toISOString();
    
    const item: OrderItem = {
      ...data,
      id,
      created_at: now,
      updated_at: now,
    };

    await DynamoDBHelper.put({
      PK: `${EntityPrefix.ORDER}#${data.order_id}`,
      SK: `ITEM#${id}`,
      GSI1PK: `ORDERITEM#${id}`,
      GSI1SK: 'METADATA',
      entity_type: 'OrderItem',
      ...item,
    });

    return item;
  }

  /**
   * Find order items by order ID
   */
  static async findByOrderId(orderId: number): Promise<OrderItem[]> {
    const items = await DynamoDBHelper.query({
      keyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      expressionAttributeValues: {
        ':pk': `${EntityPrefix.ORDER}#${orderId}`,
        ':sk': 'ITEM#',
      },
    });

    return items.map(this.mapToOrderItem);
  }

  /**
   * Find order item by ID
   */
  static async findById(id: number): Promise<OrderItem | null> {
    const items = await DynamoDBHelper.query({
      indexName: GSI.GSI1,
      keyConditionExpression: 'GSI1PK = :pk',
      expressionAttributeValues: {
        ':pk': `ORDERITEM#${id}`,
      },
      limit: 1,
    });

    if (items.length === 0) return null;
    return this.mapToOrderItem(items[0]);
  }

  private static mapToOrderItem(item: any): OrderItem {
    const { PK, SK, GSI1PK, GSI1SK, entity_type, ...orderItem } = item;
    return orderItem as OrderItem;
  }
}
