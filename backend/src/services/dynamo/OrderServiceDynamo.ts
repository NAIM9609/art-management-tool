/**
 * OrderService using DynamoDB repositories
 * Provides full API compatibility with the original TypeORM-based service
 */

import { config } from '../../config';
import { 
  OrderRepository,
  CartRepository,
  CartItemRepository,
  ProductRepository,
  ProductVariantRepository,
  NotificationRepository,
  Order,
  OrderItem,
  PaymentStatus,
  FulfillmentStatus,
} from '../../repositories';
import { PaymentProvider } from '../payment/PaymentProvider';

export { Order, OrderItem, PaymentStatus, FulfillmentStatus };

export interface CheckoutData {
  customerEmail: string;
  customerName: string;
  shippingAddress: Record<string, any>;
  billingAddress?: Record<string, any>;
  paymentMethod: string;
  notes?: string;
}

export interface OrderFilters {
  status?: PaymentStatus;
  fulfillmentStatus?: FulfillmentStatus;
  customerEmail?: string;
  dateFrom?: string;
  dateTo?: string;
}

export class OrderServiceDynamo {
  private paymentProvider?: PaymentProvider;

  constructor(paymentProvider?: PaymentProvider) {
    this.paymentProvider = paymentProvider;
  }

  /**
   * Create order from cart
   */
  async createOrderFromCart(sessionId: string, checkoutData: CheckoutData): Promise<Order> {
    const cart = await CartRepository.findBySessionIdWithItems(sessionId);

    if (!cart || !cart.items || cart.items.length === 0) {
      throw new Error('Cart is empty');
    }

    // Calculate order totals
    let subtotal = 0;
    const orderItems: Array<{
      product_id: number;
      variant_id?: number;
      product_name: string;
      variant_name?: string;
      sku?: string;
      quantity: number;
      unit_price: number;
      total_price: number;
    }> = [];

    for (const item of cart.items) {
      const product = await ProductRepository.findById(item.product_id);
      if (!product) continue;

      let unitPrice = product.base_price;
      let variantName: string | undefined;
      let sku = product.sku;

      if (item.variant_id) {
        const variant = await ProductVariantRepository.findById(item.variant_id);
        if (variant) {
          unitPrice += variant.price_adjustment;
          variantName = variant.name;
          sku = variant.sku || sku;
        }
      }

      const totalPrice = unitPrice * item.quantity;
      subtotal += totalPrice;

      orderItems.push({
        product_id: item.product_id,
        variant_id: item.variant_id,
        product_name: product.title,
        variant_name: variantName,
        sku,
        quantity: item.quantity,
        unit_price: unitPrice,
        total_price: totalPrice,
      });
    }

    const tax = subtotal * (config.taxRate || 0);
    const discount = cart.discount_amount || 0;
    const total = Math.max(0, subtotal + tax - discount);

    // Create order with items
    const order = await OrderRepository.createWithItems(
      {
        customer_email: checkoutData.customerEmail,
        customer_name: checkoutData.customerName,
        subtotal,
        tax,
        discount,
        total,
        currency: 'EUR',
        payment_status: PaymentStatus.PENDING,
        payment_method: checkoutData.paymentMethod,
        fulfillment_status: FulfillmentStatus.UNFULFILLED,
        shipping_address: checkoutData.shippingAddress,
        billing_address: checkoutData.billingAddress || checkoutData.shippingAddress,
        notes: checkoutData.notes,
      },
      orderItems
    );

    // Clear cart after successful order
    await CartItemRepository.deleteByCartId(sessionId);

    // Create notification
    await NotificationRepository.createOrderNotification(order.id, order.order_number, 'new');

    return order;
  }

  /**
   * Get order by ID
   */
  async getOrderById(id: number): Promise<Order | null> {
    return OrderRepository.findByIdWithItems(id);
  }

  /**
   * Get order by order number
   */
  async getOrderByNumber(orderNumber: string): Promise<Order | null> {
    const order = await OrderRepository.findByOrderNumber(orderNumber);
    if (!order) return null;
    return OrderRepository.findByIdWithItems(order.id);
  }

  /**
   * List orders with filters and pagination
   */
  async listOrders(filters: OrderFilters = {}, page: number = 1, perPage: number = 20): Promise<{ orders: Order[]; total: number }> {
    return OrderRepository.findAll(filters, page, perPage);
  }

  /**
   * Update order status
   */
  async updateOrderStatus(id: number, status: PaymentStatus): Promise<Order> {
    await OrderRepository.updatePaymentStatus(id, status);
    
    if (status === PaymentStatus.PAID) {
      const order = await OrderRepository.findById(id);
      if (order) {
        await NotificationRepository.createOrderNotification(order.id, order.order_number, 'paid');
      }
    }
    
    const order = await this.getOrderById(id);
    if (!order) throw new Error(`Order with id ${id} not found`);
    return order;
  }

  /**
   * Update fulfillment status
   */
  async updateFulfillmentStatus(id: number, status: FulfillmentStatus): Promise<Order> {
    await OrderRepository.updateFulfillmentStatus(id, status);
    
    if (status === FulfillmentStatus.FULFILLED) {
      const order = await OrderRepository.findById(id);
      if (order) {
        await NotificationRepository.createOrderNotification(order.id, order.order_number, 'shipped');
      }
    }
    
    const order = await this.getOrderById(id);
    if (!order) throw new Error(`Order with id ${id} not found`);
    return order;
  }

  /**
   * Process payment for an order
   */
  async processPayment(orderId: number): Promise<{ success: boolean; paymentIntentId?: string; error?: string }> {
    const order = await this.getOrderById(orderId);
    if (!order) {
      return { success: false, error: 'Order not found' };
    }

    if (!this.paymentProvider) {
      // Mock successful payment
      await OrderRepository.updatePaymentStatus(orderId, PaymentStatus.PAID, 'mock_payment_intent');
      return { success: true, paymentIntentId: 'mock_payment_intent' };
    }

    try {
      const result = await this.paymentProvider.processPayment(
        order.total,
        order.currency || 'EUR',
        {
          orderId: order.id,
          customerEmail: order.customer_email,
        }
      );

      if (result.success) {
        await OrderRepository.updatePaymentStatus(orderId, PaymentStatus.PAID, result.transactionId);
        return { success: true, paymentIntentId: result.transactionId };
      }

      return { success: false, error: result.error || 'Payment failed' };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get order statistics
   */
  async getStatistics(dateFrom?: string, dateTo?: string): Promise<{
    totalOrders: number;
    totalRevenue: number;
    pendingOrders: number;
    paidOrders: number;
  }> {
    return OrderRepository.getStatistics(dateFrom, dateTo);
  }

  /**
   * Cancel an order
   */
  async cancelOrder(id: number): Promise<Order> {
    await OrderRepository.softDelete(id);
    const order = await OrderRepository.findById(id, true);
    if (!order) throw new Error(`Order with id ${id} not found`);
    return order;
  }
}

// Export default instance
export const orderServiceDynamo = new OrderServiceDynamo();
