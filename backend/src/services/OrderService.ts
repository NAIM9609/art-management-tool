import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBOptimized } from './dynamodb/DynamoDBOptimized';
import { OrderRepository } from './dynamodb/repositories/OrderRepository';
import { OrderItemRepository } from './dynamodb/repositories/OrderItemRepository';
import { ProductRepository } from './dynamodb/repositories/ProductRepository';
import { ProductVariantRepository } from './dynamodb/repositories/ProductVariantRepository';
import { CartRepository } from './dynamodb/repositories/CartRepository';
import { CartItemRepository } from './dynamodb/repositories/CartItemRepository';
import {
  Order,
  OrderItem,
  OrderStatus,
  OrderSummary,
  CreateOrderData,
  UpdateOrderData,
  CreateOrderItemData,
  PaginationParams,
  PaginatedResponse,
} from './dynamodb/repositories/types';
import { NotificationService } from './NotificationService';
import { AuditService } from './AuditService';
import { PaymentProvider } from './payment/PaymentProvider';
import { config } from '../config';

export { OrderStatus };

export interface CheckoutData {
  customerEmail: string;
  customerName: string;
  shippingAddress: Record<string, any>;
  billingAddress?: Record<string, any>;
  paymentMethod: string;
  notes?: string;
}

export interface OrderItemInput {
  quantity: number;
  unit_price: number;
  product_id?: number;
  variant_id?: string;
  product_name?: string;
}

export interface TotalsResult {
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
}

export interface CreateOrderServiceData extends CreateOrderData {
  items: Omit<CreateOrderItemData, 'order_id'>[];
}

export interface PaymentData {
  payment_status: string;
  payment_intent_id?: string;
  payment_method?: string;
}

export interface OrderWithItems {
  order: Order;
  items: OrderItem[];
}

export class OrderService {
  private orderRepo: OrderRepository;
  private orderItemRepo: OrderItemRepository;
  private productRepo: ProductRepository;
  private variantRepo: ProductVariantRepository;
  private cartRepo: CartRepository;
  private cartItemRepo: CartItemRepository;
  private notificationService: NotificationService;
  private paymentProvider: PaymentProvider;
  private auditService: AuditService;
  private tableName: string;
  private dynamoDB: DynamoDBOptimized;

  constructor(paymentProvider: PaymentProvider, notificationService: NotificationService, auditService?: AuditService) {
    this.tableName = process.env.DYNAMODB_TABLE_NAME || 'products';

    this.dynamoDB = new DynamoDBOptimized({
      tableName: this.tableName,
      region: process.env.AWS_REGION || 'us-east-1',
    });

    this.orderRepo = new OrderRepository(this.dynamoDB);
    this.orderItemRepo = new OrderItemRepository(this.dynamoDB);
    this.productRepo = new ProductRepository(this.dynamoDB);
    this.variantRepo = new ProductVariantRepository(this.dynamoDB);
    this.cartRepo = new CartRepository(this.dynamoDB);
    this.cartItemRepo = new CartItemRepository(this.dynamoDB);
    this.paymentProvider = paymentProvider;
    this.notificationService = notificationService;
    this.auditService = auditService || new AuditService();
  }

  /**
   * Calculate order totals from items
   */
  calculateTotals(items: OrderItemInput[]): TotalsResult {
    const subtotal = items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
    const tax = subtotal * config.taxRate;
    const discount = 0;
    const total = subtotal + tax - discount;
    return { subtotal, tax, discount, total };
  }

  /**
   * Create a new order with items and decrement stock atomically using DynamoDB transactions.
   * Checks stock availability before order creation.
   * Rolls back atomically via DynamoDB transaction on failure.
   */
  async createOrder(data: CreateOrderServiceData): Promise<OrderWithItems> {
    // 1. Check stock availability for all variant items
    for (const item of data.items) {
      if (item.variant_id && item.product_id) {
        const variant = await this.variantRepo.findByIdAndProductId(item.variant_id, item.product_id);
        if (!variant) {
          throw new Error(`Variant ${item.variant_id} not found for product ${item.product_id}`);
        }
        if (variant.stock < item.quantity) {
          throw new Error(
            `Insufficient stock for variant ${item.variant_id}. Requested: ${item.quantity}, Available: ${variant.stock}`
          );
        }
      }
    }

    // 2. Generate order number
    const orderNumber = await this.orderRepo.generateOrderNumber();
    const now = new Date().toISOString();
    const { v4: uuidv4 } = await import('uuid');
    const orderId = uuidv4();

    const order: Order = {
      id: orderId,
      order_number: orderNumber,
      user_id: data.user_id,
      customer_email: data.customer_email,
      customer_name: data.customer_name,
      subtotal: data.subtotal,
      tax: data.tax ?? 0,
      discount: data.discount ?? 0,
      total: data.total,
      currency: data.currency ?? 'EUR',
      status: data.status ?? OrderStatus.PENDING,
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

    // 3. Build order item records
    const orderItems: OrderItem[] = data.items.map(item => ({
      id: uuidv4(),
      order_id: orderId,
      product_id: item.product_id,
      variant_id: item.variant_id,
      product_name: item.product_name ?? '',
      variant_name: item.variant_name,
      sku: item.sku,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total_price: item.unit_price * item.quantity,
      created_at: now,
    }));

    // 4. Build DynamoDB transaction items: create order + create order items + decrement stock
    const orderDynamoItem = this.orderRepo.buildOrderItem(order);
    const transactItems: any[] = [
      {
        Put: {
          TableName: this.tableName,
          Item: orderDynamoItem,
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
    ];

    // Add order item puts to transaction
    for (const oi of orderItems) {
      transactItems.push({
        Put: {
          TableName: this.tableName,
          Item: this.orderItemRepo.buildOrderItemItem(oi),
          ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
        },
      });
    }

    // Add stock decrement updates to transaction (atomic, conditional on stock >= quantity)
    for (const item of data.items) {
      if (item.variant_id && item.product_id) {
        transactItems.push({
          Update: {
            TableName: this.tableName,
            Key: {
              PK: `PRODUCT#${item.product_id}`,
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

    // DynamoDB transactions support up to 100 items
    if (transactItems.length > 100) {
      throw new Error('Order exceeds maximum transaction size (too many items or stock decrements)');
    }

    // 5. Execute the transaction (creates order + items + decrements stock atomically)
    const client = (this.dynamoDB as any).client;
    try {
      await client.send(new TransactWriteCommand({ TransactItems: transactItems }));
    } catch (error: any) {
      if (error.name === 'TransactionCanceledException') {
        throw new Error('Order creation failed: insufficient stock or concurrent modification. Please try again.');
      }
      throw error;
    }

    // 6. Create notification (non-blocking)
    this.notificationService.createNotification({
      type: 'order_created',
      title: `New Order: ${order.order_number}`,
      message: `Order from ${order.customer_name}`,
      metadata: { order_id: orderId },
    }).catch(err => console.error('Failed to create order notification:', err));

    return { order, items: orderItems };
  }

  /**
   * Get order by ID with items fetched in parallel
   */
  async getOrderById(id: string): Promise<OrderWithItems | null> {
    const [order, items] = await Promise.all([
      this.orderRepo.findById(id),
      this.orderItemRepo.findByOrderId(id),
    ]);

    if (!order) {
      return null;
    }

    return { order, items };
  }

  /**
   * Get order by order number using repository
   */
  async getOrderByNumber(orderNumber: string): Promise<Order | null> {
    return this.orderRepo.findByOrderNumber(orderNumber);
  }

  /**
   * Get orders by customer email with pagination using repository
   */
  async getOrdersByCustomer(email: string, pagination?: PaginationParams): Promise<PaginatedResponse<OrderSummary>> {
    return this.orderRepo.findByCustomerEmail(email, pagination);
  }

  /**
   * Update order status with audit log (non-blocking)
   */
  async updateOrderStatus(id: string, status: OrderStatus, userId?: string): Promise<Order | null> {
    const existing = await this.orderRepo.findById(id);
    if (!existing) {
      return null;
    }

    const updated = await this.orderRepo.update(id, { status });

    // Create notification for status update (non-blocking)
    if (updated) {
      this.notificationService.createNotification({
        type: 'order_created',
        title: `Order Status Updated: ${updated.order_number}`,
        message: `Order ${updated.order_number} status changed to ${status}`,
        metadata: { order_id: id, status },
      }).catch(err => console.error('Failed to create status notification:', err));
    }

    // Log audit trail (non-blocking)
    if (userId && existing) {
      this.auditService.logAction(
        userId,
        'UPDATE_ORDER_STATUS',
        'Order',
        id,
        { status: { old: existing.status, new: status } }
      ).catch(err => console.error('Failed to log audit action:', err));
    }

    return updated;
  }

  /**
   * Process payment by updating payment status on the order
   */
  async processPayment(orderId: string, paymentData: PaymentData): Promise<Order | null> {
    const updateData: UpdateOrderData = {
      payment_status: paymentData.payment_status,
    };
    if (paymentData.payment_intent_id !== undefined) {
      updateData.payment_intent_id = paymentData.payment_intent_id;
    }
    if (paymentData.payment_method !== undefined) {
      updateData.payment_method = paymentData.payment_method;
    }

    const updated = await this.orderRepo.update(orderId, updateData);

    if (updated && paymentData.payment_status === 'paid') {
      // Create notification for paid order (non-blocking)
      this.notificationService.createNotification({
        type: 'order_paid',
        title: `Order Paid: ${updated.order_number}`,
        message: `Payment received for order ${updated.order_number}`,
        metadata: { order_id: orderId },
      }).catch(err => console.error('Failed to create payment notification:', err));
    }

    return updated;
  }

  /**
   * List orders with optional filters and pagination (wraps OrderRepository.findAll)
   */
  async listOrders(
    filters: any = {},
    page: number = 1,
    perPage: number = 20
  ): Promise<{ orders: OrderSummary[]; total: number }> {
    const result = await this.orderRepo.findAll(
      filters.status ? { status: filters.status } : undefined,
      { limit: perPage }
    );

    return { orders: result.items, total: result.count };
  }

  /**
   * Create an order from a cart session.
   * Uses DynamoDB cart and product repositories.
   */
  async createOrderFromCart(sessionId: string, checkoutData: CheckoutData): Promise<OrderWithItems> {
    // Find cart by session
    const cart = await this.cartRepo.findBySessionId(sessionId);
    if (!cart) {
      throw new Error('Cart is empty');
    }

    const cartItems = await this.cartItemRepo.findByCartId(cart.id);
    if (!cartItems || cartItems.length === 0) {
      throw new Error('Cart is empty');
    }

    // Fetch products and variants
    const productIds = [...new Set(cartItems.map(item => item.product_id))];
    const products = await Promise.all(productIds.map(id => this.productRepo.findById(id)));
    const productMap = new Map(
      products.filter((p): p is NonNullable<typeof p> => p !== null).map(p => [p.id, p])
    );

    const variantIds = cartItems
      .filter(item => item.variant_id != null)
      .map(item => ({ id: String(item.variant_id), product_id: item.product_id }));
    const variantMap = new Map<string, NonNullable<Awaited<ReturnType<typeof this.variantRepo.findByIdAndProductId>>>>();
    await Promise.all(
      variantIds.map(async ({ id, product_id }) => {
        const variant = await this.variantRepo.findByIdAndProductId(id, product_id);
        if (variant) variantMap.set(id, variant);
      })
    );

    // Build order items
    const itemsData: Omit<CreateOrderItemData, 'order_id'>[] = [];
    let subtotal = 0;

    for (const cartItem of cartItems) {
      const product = productMap.get(cartItem.product_id);
      if (!product) continue;

      const variantId = cartItem.variant_id != null ? String(cartItem.variant_id) : undefined;
      const variant = variantId ? variantMap.get(variantId) : undefined;
      const unitPrice = variant
        ? product.base_price + variant.price_adjustment
        : product.base_price;
      const totalPrice = unitPrice * cartItem.quantity;

      subtotal += totalPrice;

      itemsData.push({
        product_id: cartItem.product_id,
        variant_id: variantId,
        product_name: product.title,
        variant_name: variant?.name,
        sku: variant?.sku || product.sku,
        quantity: cartItem.quantity,
        unit_price: unitPrice,
        total_price: totalPrice,
      });
    }

    const tax = subtotal * config.taxRate;
    const discount = cart.discount_amount ?? 0;
    const total = subtotal + tax - discount;

    const orderData: CreateOrderServiceData = {
      customer_email: checkoutData.customerEmail,
      customer_name: checkoutData.customerName,
      subtotal,
      tax,
      discount,
      total,
      currency: 'EUR',
      status: OrderStatus.PENDING,
      payment_method: checkoutData.paymentMethod,
      shipping_address: checkoutData.shippingAddress,
      billing_address: checkoutData.billingAddress ?? checkoutData.shippingAddress,
      notes: checkoutData.notes,
      items: itemsData,
    };

    const result = await this.createOrder(orderData);

    // Clear cart items after order (non-blocking on delete errors)
    await this.cartRepo.delete(cart.id).catch(err => console.error('Failed to clear cart:', err));

    return result;
  }

  /**
   * Update payment status (backward-compatible wrapper around processPayment)
   */
  async updatePaymentStatus(id: string, status: string, paymentIntentId?: string, userId?: string): Promise<Order> {
    const updated = await this.processPayment(id, {
      payment_status: status,
      payment_intent_id: paymentIntentId,
    });

    // Log audit trail (non-blocking)
    if (userId) {
      this.auditService.logAction(
        userId,
        'UPDATE_PAYMENT_STATUS',
        'Order',
        id,
        { payment_status: status, payment_intent_id: paymentIntentId }
      ).catch(err => console.error('Failed to log audit action:', err));
    }

    if (!updated) {
      throw new Error(`Order with id ${id} not found`);
    }
    return updated;
  }

  /**
   * Update fulfillment status (backward-compatible wrapper around updateOrderStatus)
   */
  async updateFulfillmentStatus(id: string, fulfillmentStatus: string, userId?: string): Promise<Order> {
    const existing = await this.orderRepo.findById(id);
    if (!existing) {
      throw new Error(`Order with id ${id} not found`);
    }

    const updated = await this.orderRepo.update(id, { fulfillment_status: fulfillmentStatus });

    // Log audit trail (non-blocking)
    if (userId) {
      this.auditService.logAction(
        userId,
        'UPDATE_FULFILLMENT_STATUS',
        'Order',
        id,
        { fulfillment_status: { old: existing.fulfillment_status, new: fulfillmentStatus } }
      ).catch(err => console.error('Failed to log audit action:', err));
    }

    if (!updated) {
      throw new Error(`Order with id ${id} not found`);
    }
    return updated;
  }
}
