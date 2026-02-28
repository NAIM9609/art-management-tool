import { DynamoDBOptimized } from './dynamodb/DynamoDBOptimized';
import { OrderRepository } from './dynamodb/repositories/OrderRepository';
import { OrderItemRepository } from './dynamodb/repositories/OrderItemRepository';
import { ProductVariantRepository } from './dynamodb/repositories/ProductVariantRepository';
import { AuditLogRepository } from './dynamodb/repositories/AuditLogRepository';
import { NotificationRepository } from './dynamodb/repositories/NotificationRepository';
import {
  Order,
  OrderItem,
  CreateOrderItemData,
  OrderStatus,
  PaginationParams,
  PaginatedResponse,
  OrderSummary
} from './dynamodb/repositories/types';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { config } from '../config';

export interface CreateOrderData {
  user_id?: number;
  customerEmail: string;
  customerName: string;
  shippingAddress: Record<string, any>;
  billingAddress?: Record<string, any>;
  paymentMethod: string;
  notes?: string;
  items: OrderItemInput[];
}

export interface OrderItemInput {
  product_id: number;
  variant_id?: string;
  product_name: string;
  variant_name?: string;
  sku?: string;
  quantity: number;
  unit_price: number;
}

export interface PaymentData {
  payment_status: string;
  payment_intent_id?: string;
}

export class OrderService {
  private dynamoDB: DynamoDBOptimized;
  private orderRepo: OrderRepository;
  private orderItemRepo: OrderItemRepository;
  private variantRepo: ProductVariantRepository;
  private auditLogRepo: AuditLogRepository;
  private notificationRepo: NotificationRepository;
  private tableName: string;

  constructor(dynamoDB: DynamoDBOptimized) {
    this.dynamoDB = dynamoDB;
    this.tableName = (dynamoDB as any).tableName || process.env.DYNAMODB_TABLE_NAME || 'products';
    this.orderRepo = new OrderRepository(dynamoDB);
    this.orderItemRepo = new OrderItemRepository(dynamoDB);
    this.variantRepo = new ProductVariantRepository(dynamoDB);
    this.auditLogRepo = new AuditLogRepository(dynamoDB);
    this.notificationRepo = new NotificationRepository(dynamoDB);
  }

  /**
   * Calculate order totals from items
   */
  calculateTotals(items: OrderItemInput[]): {
    subtotal: number;
    tax: number;
    total: number;
  } {
    const subtotal = items.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
    const tax = subtotal * (config.taxRate || 0);
    const total = subtotal + tax;

    return { subtotal, tax, total };
  }

  /**
   * Check stock availability for all items
   * Throws error if any item has insufficient stock
   */
  private async checkStockAvailability(items: OrderItemInput[]): Promise<void> {
    const stockChecks = await Promise.all(
      items
        .filter(item => item.variant_id) // Only check variants with IDs
        .map(async (item) => {
          const variant = await this.variantRepo.findById(item.variant_id!);
          if (!variant) {
            throw new Error(`Variant ${item.variant_id} not found`);
          }
          if (variant.stock < item.quantity) {
            throw new Error(
              `Insufficient stock for ${item.product_name}${item.variant_name ? ` (${item.variant_name})` : ''}. Available: ${variant.stock}, Requested: ${item.quantity}`
            );
          }
          return { variant, quantity: item.quantity };
        })
    );
  }

  /**
   * Create order with atomic transaction:
   * - Create order
   * - Create order items (batch)
   * - Decrement stock atomically
   * - Create notification
   */
  async createOrder(data: CreateOrderData): Promise<Order> {
    // Calculate totals
    const { subtotal, tax, total } = this.calculateTotals(data.items);

    // Check stock availability before creating order
    await this.checkStockAvailability(data.items);

    // Generate order number first (atomic counter operation)
    const orderNumber = await this.orderRepo.generateOrderNumber();
    const now = new Date().toISOString();
    const orderId = require('uuid').v4();

    // Build order
    const order: Order = {
      id: orderId,
      order_number: orderNumber,
      user_id: data.user_id,
      customer_email: data.customerEmail,
      customer_name: data.customerName,
      subtotal,
      tax,
      discount: 0,
      total,
      currency: 'EUR',
      status: OrderStatus.PENDING,
      payment_method: data.paymentMethod,
      shipping_address: data.shippingAddress,
      billing_address: data.billingAddress || data.shippingAddress,
      notes: data.notes,
      created_at: now,
      updated_at: now,
    };

    // Build order items
    const orderItems: CreateOrderItemData[] = data.items.map(item => ({
      order_id: parseInt(orderId), // Convert to number for compatibility
      product_id: item.product_id,
      variant_id: item.variant_id,
      product_name: item.product_name,
      variant_name: item.variant_name,
      sku: item.sku,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total_price: item.unit_price * item.quantity,
    }));

    // Build transaction items
    const transactItems: any[] = [];

    // 1. Put Order
    const orderItem = this.orderRepo.buildOrderItem(order);
    transactItems.push({
      Put: {
        TableName: this.tableName,
        Item: orderItem,
        ConditionExpression: 'attribute_not_exists(PK)',
      },
    });

    // 2. Put Order Items (up to 24 items to stay within 25 transaction limit)
    const itemsToPut = orderItems.slice(0, 24); // Leave room for order item
    itemsToPut.forEach(itemData => {
      const item = this.orderItemRepo.buildOrderItemItem({
        ...itemData,
        id: require('uuid').v4(),
        created_at: now,
      });
      transactItems.push({
        Put: {
          TableName: this.tableName,
          Item: item,
          ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
        },
      });
    });

    // 3. Decrement stock for variants (only those with variant_id)
    const variantUpdates = data.items
      .filter(item => item.variant_id)
      .slice(0, Math.min(24 - itemsToPut.length, data.items.length)); // Stay within limit

    for (const item of variantUpdates) {
      // We need to find the variant to get product_id
      const variant = await this.variantRepo.findById(item.variant_id!);
      if (variant) {
        transactItems.push({
          Update: {
            TableName: this.tableName,
            Key: {
              PK: `PRODUCT#${variant.product_id}`,
              SK: `VARIANT#${item.variant_id}`,
            },
            UpdateExpression: 'SET stock = stock - :quantity, updated_at = :now',
            ExpressionAttributeValues: {
              ':quantity': item.quantity,
              ':now': now,
            },
            ConditionExpression: 'attribute_exists(PK) AND attribute_not_exists(deleted_at) AND stock >= :quantity',
          },
        });
      }
    }

    // Execute transaction
    try {
      await this.dynamoDB.transactWrite(transactItems);
    } catch (error: any) {
      if (error.name === 'TransactionCanceledException') {
        throw new Error('Order creation failed: Insufficient stock or concurrent modification');
      }
      throw error;
    }

    // If we had more than 24 items, create remaining items in batch
    if (orderItems.length > 24) {
      const remainingItems = orderItems.slice(24);
      await this.orderItemRepo.batchCreate(remainingItems);
    }

    // Create notification (outside transaction)
    await this.notificationRepo.create({
      type: 'order_created' as any,
      title: `New Order: ${orderNumber}`,
      message: `Order from ${data.customerName}`,
      metadata: { order_id: orderId },
    });

    return order;
  }

  /**
   * Get order by ID with items fetched in parallel
   */
  async getOrderById(id: string): Promise<(Order & { items: OrderItem[] }) | null> {
    // Fetch order and items in parallel
    const [order, items] = await Promise.all([
      this.orderRepo.findById(id),
      this.orderItemRepo.findByOrderId(parseInt(id)),
    ]);

    if (!order) {
      return null;
    }

    return { ...order, items };
  }

  /**
   * Get order by order number using repository
   */
  async getOrderByNumber(orderNumber: string): Promise<(Order & { items: OrderItem[] }) | null> {
    const order = await this.orderRepo.findByOrderNumber(orderNumber);
    if (!order) {
      return null;
    }

    const items = await this.orderItemRepo.findByOrderId(parseInt(order.id));
    return { ...order, items };
  }

  /**
   * Get orders by customer email with pagination
   */
  async getOrdersByCustomer(
    email: string,
    pagination?: PaginationParams
  ): Promise<PaginatedResponse<OrderSummary>> {
    return this.orderRepo.findByCustomerEmail(email, pagination);
  }

  /**
   * Update order status and create audit log
   */
  async updateOrderStatus(
    id: string,
    status: OrderStatus,
    userId: string = 'system'
  ): Promise<Order | null> {
    // Get current order
    const currentOrder = await this.orderRepo.findById(id);
    if (!currentOrder) {
      return null;
    }

    // Update order
    const updatedOrder = await this.orderRepo.update(id, { status });
    if (!updatedOrder) {
      return null;
    }

    // Create audit log
    await this.auditLogRepo.create({
      entity_type: 'Order',
      entity_id: id,
      user_id: userId,
      action: 'status_update',
      changes: {
        status: {
          from: currentOrder.status,
          to: status,
        },
      },
      metadata: {
        order_number: updatedOrder.order_number,
      },
    });

    // Create notification for certain status changes
    if (status === OrderStatus.SHIPPED) {
      await this.notificationRepo.create({
        type: 'order_shipped' as any,
        title: `Order Shipped: ${updatedOrder.order_number}`,
        message: `Order has been shipped`,
        metadata: { order_id: id },
      });
    }

    return updatedOrder;
  }

  /**
   * Process payment and update payment status
   */
  async processPayment(
    orderId: string,
    paymentData: PaymentData,
    userId: string = 'system'
  ): Promise<Order | null> {
    // Get current order
    const currentOrder = await this.orderRepo.findById(orderId);
    if (!currentOrder) {
      return null;
    }

    // Update payment status
    const updatedOrder = await this.orderRepo.update(orderId, {
      payment_status: paymentData.payment_status,
      payment_intent_id: paymentData.payment_intent_id,
    });

    if (!updatedOrder) {
      return null;
    }

    // Create audit log
    await this.auditLogRepo.create({
      entity_type: 'Order',
      entity_id: orderId,
      user_id: userId,
      action: 'payment_update',
      changes: {
        payment_status: {
          from: currentOrder.payment_status,
          to: paymentData.payment_status,
        },
      },
      metadata: {
        order_number: updatedOrder.order_number,
        payment_intent_id: paymentData.payment_intent_id,
      },
    });

    // Create notification for successful payment
    if (paymentData.payment_status === 'paid') {
      await this.notificationRepo.create({
        type: 'order_paid' as any,
        title: `Order Paid: ${updatedOrder.order_number}`,
        message: `Payment received for order ${updatedOrder.order_number}`,
        metadata: { order_id: orderId },
      });
    }

    return updatedOrder;
  }
}
