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

export interface CheckoutData {
  customerEmail: string;
  customerName: string;
  shippingAddress: Record<string, any>;
  billingAddress?: Record<string, any>;
  paymentMethod: string;
  notes?: string;
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

  constructor(paymentProvider: PaymentProvider, notificationService: NotificationService) {
    this.orderRepo = AppDataSource.getRepository(Order);
    this.orderItemRepo = AppDataSource.getRepository(OrderItem);
    this.cartRepo = AppDataSource.getRepository(Cart);
    this.cartItemRepo = AppDataSource.getRepository(CartItem);
    this.productRepo = AppDataSource.getRepository(EnhancedProduct);
    this.variantRepo = AppDataSource.getRepository(ProductVariant);
    this.paymentProvider = paymentProvider;
    this.notificationService = notificationService;
  }

  async createOrderFromCart(sessionId: string, checkoutData: CheckoutData): Promise<Order> {
    const cart = await this.cartRepo.findOne({
      where: { session_id: sessionId },
      relations: ['items'],
    });

    if (!cart || !cart.items || cart.items.length === 0) {
      throw new Error('Cart is empty');
    }

    const productIds = cart.items.map(item => item.product_id);
    const products = await this.productRepo.find({ where: { id: In(productIds) } });
    const productMap = new Map(products.map(p => [p.id, p]));

    const variantIds = cart.items.filter(item => item.variant_id).map(item => item.variant_id!);
    const variants = variantIds.length > 0
      ? await this.variantRepo.find({ where: { id: In(variantIds) } })
      : [];
    const variantMap = new Map(variants.map(v => [v.id, v]));

    let subtotal = 0;
    const orderItems: Partial<OrderItem>[] = [];

    for (const item of cart.items) {
      const product = productMap.get(item.product_id);
      if (!product) continue;

      const variant = item.variant_id ? variantMap.get(item.variant_id) : undefined;
      const unitPrice = variant
        ? parseFloat(product.base_price.toString()) + parseFloat(variant.price_adjustment.toString())
        : parseFloat(product.base_price.toString());
      const totalPrice = unitPrice * item.quantity;

      subtotal += totalPrice;

      orderItems.push({
        product_id: item.product_id,
        variant_id: item.variant_id,
        product_name: product.title,
        variant_name: variant?.name,
        sku: variant?.sku || product.sku,
        quantity: item.quantity,
        unit_price: unitPrice,
        total_price: totalPrice,
      });
    }

    const tax = subtotal * 0.0;
    const discount = parseFloat(cart.discount_amount.toString());
    const total = subtotal + tax - discount;

    const orderNumber = `ORD-${Date.now()}`;

    const order = this.orderRepo.create({
      order_number: orderNumber,
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
    });

    const savedOrder = await this.orderRepo.save(order);

    for (const itemData of orderItems) {
      const item = this.orderItemRepo.create({ ...itemData, order_id: savedOrder.id });
      await this.orderItemRepo.save(item);
    }

    await this.cartItemRepo.delete({ cart_id: cart.id });

    await this.notificationService.createNotification({
      type: 'order_created',
      title: `New Order: ${orderNumber}`,
      message: `Order from ${checkoutData.customerName}`,
      metadata: { order_id: savedOrder.id },
    });

    return this.orderRepo.findOne({
      where: { id: savedOrder.id },
      relations: ['items'],
    }) as Promise<Order>;
  }

  async getOrderById(id: number): Promise<Order | null> {
    return this.orderRepo.findOne({
      where: { id },
      relations: ['items'],
    });
  }

  async listOrders(filters: any = {}, page: number = 1, perPage: number = 20): Promise<{ orders: Order[]; total: number }> {
    const where: any = {};
    if (filters.paymentStatus) where.payment_status = filters.paymentStatus;
    if (filters.fulfillmentStatus) where.fulfillment_status = filters.fulfillmentStatus;

    const [orders, total] = await this.orderRepo.findAndCount({
      where,
      relations: ['items'],
      skip: (page - 1) * perPage,
      take: perPage,
      order: { created_at: 'DESC' },
    });

    return { orders, total };
  }

  async updatePaymentStatus(id: number, status: PaymentStatus, paymentIntentId?: string): Promise<Order> {
    await this.orderRepo.update(id, {
      payment_status: status,
      payment_intent_id: paymentIntentId,
    });

    if (status === PaymentStatus.PAID) {
      const order = await this.getOrderById(id);
      if (order) {
        await this.notificationService.createNotification({
          type: 'order_paid',
          title: `Order Paid: ${order.order_number}`,
          message: `Payment received for order ${order.order_number}`,
          metadata: { order_id: id },
        });
      }
    }

    return this.getOrderById(id) as Promise<Order>;
  }

  async updateFulfillmentStatus(id: number, status: FulfillmentStatus): Promise<Order> {
    await this.orderRepo.update(id, { fulfillment_status: status });
    return this.getOrderById(id) as Promise<Order>;
  }
}
