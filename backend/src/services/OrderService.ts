import { Repository, In } from 'typeorm';
import { AppDataSource } from '../database/connection';
import { Order, PaymentStatus, FulfillmentStatus } from '../entities/Order';
import { OrderItem } from '../entities/OrderItem';
import { Cart } from '../entities/Cart';
import { CartItem } from '../entities/CartItem';
import { EnhancedProduct } from '../entities/EnhancedProduct';
import { ProductVariant } from '../entities/ProductVariant';
import { NotificationService } from './NotificationService';
import { PaymentProvider } from './payment/PaymentProvider';
import { AuditService } from './AuditService';
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
  private orderRepo: Repository<Order>;
  private orderItemRepo: Repository<OrderItem>;
  private cartRepo: Repository<Cart>;
  private cartItemRepo: Repository<CartItem>;
  private productRepo: Repository<EnhancedProduct>;
  private variantRepo: Repository<ProductVariant>;
  private notificationService: NotificationService;
  private paymentProvider: PaymentProvider;
  private auditService: AuditService;

  constructor(paymentProvider: PaymentProvider, notificationService: NotificationService, auditService?: AuditService) {
    this.orderRepo = AppDataSource.getRepository(Order);
    this.orderItemRepo = AppDataSource.getRepository(OrderItem);
    this.cartRepo = AppDataSource.getRepository(Cart);
    this.cartItemRepo = AppDataSource.getRepository(CartItem);
    this.productRepo = AppDataSource.getRepository(EnhancedProduct);
    this.variantRepo = AppDataSource.getRepository(ProductVariant);
    this.paymentProvider = paymentProvider;
    this.notificationService = notificationService;
    this.auditService = auditService || new AuditService();
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
    await Promise.all(
      items
        .filter(item => item.variant_id) // Only check variants with IDs
        .map(async (item) => {
          const variant = await this.variantRepo.findByIdAndProductId(item.variant_id!, item.product_id);
          if (!variant) {
            throw new Error(`Variant ${item.variant_id} not found`);
          }
          if (variant.stock < item.quantity) {
            throw new Error(
              `Insufficient stock for ${item.product_name}${item.variant_name ? ` (${item.variant_name})` : ''}. Available: ${variant.stock}, Requested: ${item.quantity}`
            );
          }
        })
    );
  }

  /**
   * Create order with atomic transaction:
   * - Create order
   * - Create order items (batch)
   * - Decrement stock atomically
   * - Create notification
   *
   * Transaction limit: 25 items max (1 order PUT + N item PUTs + N stock UPDATEs <= 25)
   * For N items with variants: 1 + 2N <= 25, so max 12 items atomically
   */
  async createOrder(data: CreateOrderData): Promise<Order> {
    // Calculate totals
    const { subtotal, tax, total } = this.calculateTotals(data.items);

    // Check stock availability before creating order
    await this.checkStockAvailability(data.items);

    // Generate order number first (atomic counter operation)
    const orderNumber = await this.orderRepo.generateOrderNumber();
    const now = new Date().toISOString();
    const orderId = uuidv4();

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
      order_id: orderId,
      product_id: item.product_id,
      variant_id: item.variant_id,
      product_name: item.product_name,
      variant_name: item.variant_name,
      sku: item.sku,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total_price: item.unit_price * item.quantity,
    }));

    // Calculate transaction sizing: 1 order PUT + N item PUTs + N stock UPDATEs <= 25
    // For items with variants: 1 + 2N <= 25, so max N = 12
    const variantItems = data.items.filter(item => item.variant_id);
    const maxItemsInTransaction = Math.min(12, Math.floor((25 - 1) / 2));
    const itemsToIncludeInTransaction = Math.min(variantItems.length, maxItemsInTransaction);

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

    // 2. Put Order Items (only those that fit in transaction with stock updates)
    const transactionItems = orderItems.slice(0, itemsToIncludeInTransaction);
    transactionItems.forEach(itemData => {
      const item = this.orderItemRepo.buildOrderItemItem({
        ...itemData,
        id: uuidv4(),
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

    // 3. Decrement stock for variants in transaction
    for (let i = 0; i < itemsToIncludeInTransaction; i++) {
      const item = data.items.filter(it => it.variant_id)[i];
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

    // Execute transaction with idempotency token
    const clientRequestToken = uuidv4();
    try {
      await this.dynamoDB.transactWrite(transactItems, clientRequestToken);
    } catch (error: any) {
      if (error.name === 'TransactionCanceledException') {
        throw new Error('Order creation failed: Insufficient stock or concurrent modification');
      }
      throw error;
    }

    // Handle remaining items beyond transaction limit
    if (orderItems.length > itemsToIncludeInTransaction) {
      const remainingItems = orderItems.slice(itemsToIncludeInTransaction);

      // Create remaining order items
      await this.orderItemRepo.batchCreate(remainingItems);

      // Decrement stock for remaining variant items (non-atomic)
      const remainingVariantItems = data.items
        .filter(item => item.variant_id)
        .slice(itemsToIncludeInTransaction);

      for (const item of remainingVariantItems) {
        try {
          await this.variantRepo.decrementStock(item.variant_id!, item.product_id, item.quantity);
        } catch (error) {
          // Log error but don't fail the order creation
          console.error(`Failed to decrement stock for variant ${item.variant_id}:`, error);
        }
      }
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
  async getOrderById(id: string | number): Promise<(Order & { items: OrderItem[] }) | null> {
    // Fetch order and items in parallel
    const orderId = typeof id === 'number' ? id.toString() : id;
    const [order, items] = await Promise.all([
      this.orderRepo.findById(orderId),
      this.orderItemRepo.findByOrderId(orderId),
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

    const items = await this.orderItemRepo.findByOrderId(order.id);
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

  async updatePaymentStatus(id: number, status: PaymentStatus, paymentIntentId?: string, userId?: string): Promise<Order> {
    const oldOrder = await this.getOrderById(id);

    await this.orderRepo.update(id, {
      payment_status: status,
      payment_intent_id: paymentIntentId,
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

  // ===== Backward Compatibility Methods =====
  // These methods provide compatibility with the old TypeORM-based API
  // Note: Order IDs are now UUID strings instead of numbers

  /**
   * List orders with filters and pagination (backward compatibility)
   * Maps to DynamoDB findAll method with cursor-based pagination
   */
  async listOrders(
    filters: any = {},
    page: number = 1,
    perPage: number = 20
  ): Promise<{ orders: any[]; total: number }> {
    // For page-based pagination, we need to iterate through pages
    let lastEvaluatedKey: any | undefined = undefined;
    let currentPage = 1;
    let result: any;

    // Iterate to the requested page
    while (currentPage <= page) {
      result = await this.orderRepo.findAll(
        {
          status: filters.paymentStatus as OrderStatus,
          customer_email: filters.customerEmail,
        },
        {
          limit: perPage,
          lastEvaluatedKey,
        }
      );

      if (currentPage === page) {
        break;
      }

      // If no more pages, return empty
      if (!result.lastEvaluatedKey) {
        return {
          orders: [],
          total: 0,
        };
      }

      lastEvaluatedKey = result.lastEvaluatedKey;
      currentPage++;
    }

    // Log audit trail (non-blocking)
    if (userId && oldOrder) {
      this.auditService.logAction(
        userId,
        'UPDATE_PAYMENT_STATUS',
        'Order',
        id.toString(),
        {
          payment_status: { old: oldOrder.payment_status, new: status },
          payment_intent_id: paymentIntentId
        }
      ).catch(err => console.error('Failed to log audit action:', err));
    }

    const order = await this.getOrderById(id);
    if (!order) {
      throw new Error(`Order with id ${id} not found`);
    }

    return result;
  }

  async updateFulfillmentStatus(id: number, status: FulfillmentStatus, userId?: string): Promise<Order> {
    const oldOrder = await this.getOrderById(id);

    await this.orderRepo.update(id, { fulfillment_status: status });

    // Log audit trail (non-blocking)
    if (userId && oldOrder) {
      this.auditService.logAction(
        userId,
        'UPDATE_FULFILLMENT_STATUS',
        'Order',
        id.toString(),
        { fulfillment_status: { old: oldOrder.fulfillment_status, new: status } }
      ).catch(err => console.error('Failed to log audit action:', err));
    }

    const order = await this.getOrderById(id);
    if (!order) {
      throw new Error(`Order with id ${id} not found`);
    }

    const updatedOrder = await this.orderRepo.update(id.toString(), {
      fulfillment_status: status,
    });

    if (!updatedOrder) {
      throw new Error(`Order with id ${id} not found`);
    }

    // Create audit log
    await this.auditLogRepo.create({
      entity_type: 'Order',
      entity_id: id.toString(),
      user_id: 'system',
      action: 'fulfillment_update',
      changes: {
        fulfillment_status: {
          from: currentOrder.fulfillment_status,
          to: status,
        },
      },
      metadata: {
        order_number: updatedOrder.order_number,
      },
    });

    return updatedOrder;
  }

  /**
   * Create order from cart (backward compatibility)
   * This is a placeholder that throws an error since cart functionality is not yet migrated
   */
  async createOrderFromCart(sessionId: string, checkoutData: any): Promise<any> {
    throw new Error('createOrderFromCart is not yet implemented for DynamoDB. Please use createOrder instead.');
  }
}
