/**
 * Unit tests for OrderService (DynamoDB-based)
 */

import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { OrderService, OrderStatus } from './OrderService';
import { MockPaymentProvider } from './payment/MockPaymentProvider';
import { NotificationService } from './NotificationService';

// Mock DynamoDB Document Client
const ddbMock = mockClient(DynamoDBDocumentClient);

// Mock NotificationService to avoid DynamoDB setup
jest.mock('./NotificationService');
jest.mock('./AuditService', () => ({
  AuditService: jest.fn().mockImplementation(() => ({
    logAction: jest.fn().mockResolvedValue({}),
    getEntityHistory: jest.fn().mockResolvedValue({ items: [], count: 0 }),
    getUserActivity: jest.fn().mockResolvedValue({ items: [], count: 0 }),
    getActivityByDateRange: jest.fn().mockResolvedValue({ items: [], count: 0 }),
  })),
}));

describe('OrderService', () => {
  let orderService: OrderService;
  let mockNotificationService: jest.Mocked<NotificationService>;

  beforeEach(() => {
    ddbMock.reset();
    process.env.DYNAMODB_TABLE_NAME = 'test-table';

    mockNotificationService = {
      createNotification: jest.fn().mockResolvedValue({}),
      getNotifications: jest.fn(),
      getNotificationById: jest.fn(),
      markAsRead: jest.fn(),
      markAllAsRead: jest.fn(),
      deleteNotification: jest.fn(),
    } as unknown as jest.Mocked<NotificationService>;

    const paymentProvider = new MockPaymentProvider(1, false);
    orderService = new OrderService(paymentProvider, mockNotificationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.DYNAMODB_TABLE_NAME;
  });

  describe('calculateTotals', () => {
    it('should calculate subtotal, tax, and total correctly', () => {
      const items = [
        { quantity: 2, unit_price: 25.00 },
        { quantity: 1, unit_price: 50.00 },
      ];

      const result = orderService.calculateTotals(items);

      expect(result.subtotal).toBe(100.00);
      expect(result.discount).toBe(0);
      expect(result.tax).toBeGreaterThanOrEqual(0);
      expect(result.total).toBe(result.subtotal + result.tax - result.discount);
    });

    it('should return zero totals for empty items', () => {
      const result = orderService.calculateTotals([]);

      expect(result.subtotal).toBe(0);
      expect(result.tax).toBe(0);
      expect(result.discount).toBe(0);
      expect(result.total).toBe(0);
    });

    it('should handle single item correctly', () => {
      const items = [{ quantity: 3, unit_price: 10.00 }];

      const result = orderService.calculateTotals(items);

      expect(result.subtotal).toBe(30.00);
      expect(result.total).toBe(result.subtotal + result.tax - result.discount);
    });
  });

  describe('createOrder', () => {
    it('should create an order with items using a DynamoDB transaction', async () => {
      // Mock counter for order number generation
      ddbMock.on(UpdateCommand).resolves({ Attributes: { value: 1 } });
      // Mock the transaction
      ddbMock.on(TransactWriteCommand).resolves({});

      const orderData = {
        customer_email: 'test@example.com',
        customer_name: 'Test Customer',
        subtotal: 100.00,
        tax: 10.00,
        discount: 0,
        total: 110.00,
        currency: 'EUR',
        status: OrderStatus.PENDING,
        items: [
          {
            product_id: 101,
            product_name: 'Art Print',
            quantity: 2,
            unit_price: 50.00,
            total_price: 100.00,
          },
        ],
      };

      const result = await orderService.createOrder(orderData);

      expect(result.order.id).toBeDefined();
      expect(result.order.customer_email).toBe('test@example.com');
      expect(result.order.customer_name).toBe('Test Customer');
      expect(result.order.status).toBe(OrderStatus.PENDING);
      expect(result.order.order_number).toMatch(/^ORD-\d{8}-\d{4}$/);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].product_name).toBe('Art Print');
      expect(result.items[0].quantity).toBe(2);
      expect(result.items[0].order_id).toBe(result.order.id);
    });

    it('should check stock before creating order and throw if insufficient', async () => {
      // Mock findByIdAndProductId to return low stock variant
      ddbMock.on(GetCommand).resolves({
        Item: {
          PK: 'PRODUCT#101',
          SK: 'VARIANT#var-1',
          id: 'var-1',
          product_id: 101,
          sku: 'ART-PRINT-L',
          name: 'Large',
          price_adjustment: 0,
          stock: 1, // Only 1 in stock
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
      });

      const orderData = {
        customer_email: 'test@example.com',
        customer_name: 'Test Customer',
        subtotal: 100.00,
        tax: 10.00,
        discount: 0,
        total: 110.00,
        items: [
          {
            product_id: 101,
            variant_id: 'var-1',
            product_name: 'Art Print',
            quantity: 5, // Requesting more than available
            unit_price: 20.00,
            total_price: 100.00,
          },
        ],
      };

      await expect(orderService.createOrder(orderData)).rejects.toThrow('Insufficient stock');
    });

    it('should include stock decrement in transaction when variant is specified', async () => {
      // Mock counter for order number generation
      ddbMock.on(UpdateCommand).resolves({ Attributes: { value: 1 } });

      // Mock findByIdAndProductId to return sufficient stock variant
      ddbMock.on(GetCommand).resolves({
        Item: {
          PK: 'PRODUCT#101',
          SK: 'VARIANT#var-1',
          id: 'var-1',
          product_id: 101,
          sku: 'ART-L',
          name: 'Large',
          price_adjustment: 0,
          stock: 10,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
      });

      let transactItems: any[] = [];
      ddbMock.on(TransactWriteCommand).callsFake((input) => {
        transactItems = input.TransactItems || [];
        return {};
      });

      const orderData = {
        customer_email: 'test@example.com',
        customer_name: 'Test Customer',
        subtotal: 50.00,
        tax: 5.00,
        discount: 0,
        total: 55.00,
        items: [
          {
            product_id: 101,
            variant_id: 'var-1',
            product_name: 'Art Print',
            quantity: 2,
            unit_price: 25.00,
            total_price: 50.00,
          },
        ],
      };

      await orderService.createOrder(orderData);

      // Verify transaction includes stock decrement
      const stockUpdate = transactItems.find(item => item.Update?.Key?.PK === 'PRODUCT#101');
      expect(stockUpdate).toBeDefined();
      expect(stockUpdate.Update.UpdateExpression).toContain('stock = stock - :quantity');
      expect(stockUpdate.Update.ConditionExpression).toContain('stock >= :quantity');
    });

    it('should throw when transaction is cancelled (e.g., concurrent stock depletion)', async () => {
      ddbMock.on(UpdateCommand).resolves({ Attributes: { value: 1 } });
      ddbMock.on(GetCommand).resolves({
        Item: {
          id: 'var-1',
          product_id: 101,
          sku: 'ART-L',
          name: 'Large',
          price_adjustment: 0,
          stock: 10,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
      });

      const error = new Error('TransactionCanceledException');
      error.name = 'TransactionCanceledException';
      ddbMock.on(TransactWriteCommand).rejects(error);

      const orderData = {
        customer_email: 'test@example.com',
        customer_name: 'Test Customer',
        subtotal: 50.00,
        tax: 5.00,
        discount: 0,
        total: 55.00,
        items: [
          {
            product_id: 101,
            variant_id: 'var-1',
            product_name: 'Art Print',
            quantity: 2,
            unit_price: 25.00,
            total_price: 50.00,
          },
        ],
      };

      await expect(orderService.createOrder(orderData)).rejects.toThrow(
        'Order creation failed: insufficient stock or concurrent modification'
      );
    });
  });

  describe('getOrderById', () => {
    it('should return order with items in parallel', async () => {
      const orderId = 'test-order-id';

      ddbMock.on(GetCommand).resolves({
        Item: {
          PK: `ORDER#${orderId}`,
          SK: 'METADATA',
          id: orderId,
          order_number: 'ORD-20240101-0001',
          customer_email: 'test@example.com',
          customer_name: 'Test Customer',
          subtotal: 100.00,
          tax: 10.00,
          discount: 0,
          total: 110.00,
          currency: 'EUR',
          status: OrderStatus.PENDING,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
      });

      ddbMock.on(QueryCommand).resolves({
        Items: [
          {
            PK: `ORDER#${orderId}`,
            SK: 'ITEM#item-1',
            id: 'item-1',
            order_id: orderId,
            product_name: 'Art Print',
            quantity: 2,
            unit_price: 50.00,
            total_price: 100.00,
            created_at: '2024-01-01T00:00:00.000Z',
          },
        ],
        Count: 1,
      });

      const result = await orderService.getOrderById(orderId);

      expect(result).not.toBeNull();
      expect(result!.order.id).toBe(orderId);
      expect(result!.order.customer_email).toBe('test@example.com');
      expect(result!.items).toHaveLength(1);
      expect(result!.items[0].product_name).toBe('Art Print');
    });

    it('should return null when order does not exist', async () => {
      ddbMock.on(GetCommand).resolves({ Item: undefined });
      ddbMock.on(QueryCommand).resolves({ Items: [], Count: 0 });

      const result = await orderService.getOrderById('non-existent-id');

      expect(result).toBeNull();
    });
  });

  describe('getOrderByNumber', () => {
    it('should return order by order number using repository', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [
          {
            PK: 'ORDER#test-id',
            SK: 'METADATA',
            id: 'test-id',
            order_number: 'ORD-20240101-0001',
            customer_email: 'test@example.com',
            customer_name: 'Test Customer',
            subtotal: 100.00,
            tax: 10.00,
            discount: 0,
            total: 110.00,
            currency: 'EUR',
            status: OrderStatus.PENDING,
            created_at: '2024-01-01T00:00:00.000Z',
            updated_at: '2024-01-01T00:00:00.000Z',
          },
        ],
        Count: 1,
      });

      const order = await orderService.getOrderByNumber('ORD-20240101-0001');

      expect(order).not.toBeNull();
      expect(order!.order_number).toBe('ORD-20240101-0001');
    });

    it('should return null when order number not found', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [], Count: 0 });

      const order = await orderService.getOrderByNumber('ORD-99999999-0000');

      expect(order).toBeNull();
    });
  });

  describe('getOrdersByCustomer', () => {
    it('should return paginated orders for a customer using repository', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [
          {
            id: 'order-1',
            order_number: 'ORD-20240101-0001',
            customer_email: 'customer@example.com',
            customer_name: 'Customer',
            total: 110.00,
            status: OrderStatus.PENDING,
            created_at: '2024-01-01T00:00:00.000Z',
          },
        ],
        Count: 1,
      });

      const result = await orderService.getOrdersByCustomer('customer@example.com', { limit: 10 });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].customer_email).toBe('customer@example.com');
      expect(result.count).toBe(1);
    });
  });

  describe('updateOrderStatus', () => {
    it('should update order status and create audit log', async () => {
      const orderId = 'test-order-id';
      const mockOrderItem = {
        PK: `ORDER#${orderId}`,
        SK: 'METADATA',
        id: orderId,
        order_number: 'ORD-20240101-0001',
        customer_email: 'test@example.com',
        customer_name: 'Test Customer',
        subtotal: 100.00,
        tax: 10.00,
        discount: 0,
        total: 110.00,
        currency: 'EUR',
        status: OrderStatus.PENDING,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      };

      ddbMock.on(GetCommand).resolves({ Item: mockOrderItem });
      ddbMock.on(PutCommand).resolves({});

      const newStatus = OrderStatus.PROCESSING;
      const result = await orderService.updateOrderStatus(orderId, newStatus, 'user-123');

      expect(result).not.toBeNull();
      expect(result!.status).toBe(newStatus);
    });

    it('should return null when order does not exist', async () => {
      ddbMock.on(GetCommand).resolves({ Item: undefined });

      const result = await orderService.updateOrderStatus('non-existent-id', OrderStatus.PROCESSING);

      expect(result).toBeNull();
    });
  });

  describe('processPayment', () => {
    it('should update payment status on the order', async () => {
      const orderId = 'test-order-id';
      const mockOrderItem = {
        PK: `ORDER#${orderId}`,
        SK: 'METADATA',
        id: orderId,
        order_number: 'ORD-20240101-0001',
        customer_email: 'test@example.com',
        customer_name: 'Test Customer',
        subtotal: 100.00,
        tax: 10.00,
        discount: 0,
        total: 110.00,
        currency: 'EUR',
        status: OrderStatus.PENDING,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      };

      ddbMock.on(GetCommand).resolves({ Item: mockOrderItem });
      ddbMock.on(PutCommand).resolves({});

      const result = await orderService.processPayment(orderId, {
        payment_status: 'paid',
        payment_intent_id: 'pi_123',
        payment_method: 'stripe',
      });

      expect(result).not.toBeNull();
      expect(result!.payment_status).toBe('paid');
    });

    it('should create paid notification when payment_status is paid', async () => {
      const orderId = 'test-order-id';
      const mockOrderItem = {
        PK: `ORDER#${orderId}`,
        SK: 'METADATA',
        id: orderId,
        order_number: 'ORD-20240101-0001',
        customer_email: 'test@example.com',
        customer_name: 'Test Customer',
        subtotal: 100.00,
        tax: 10.00,
        discount: 0,
        total: 110.00,
        currency: 'EUR',
        status: OrderStatus.PENDING,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      };

      ddbMock.on(GetCommand).resolves({ Item: mockOrderItem });
      ddbMock.on(PutCommand).resolves({});

      await orderService.processPayment(orderId, { payment_status: 'paid' });

      expect(mockNotificationService.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'order_paid' })
      );
    });
  });

  describe('listOrders', () => {
    it('should return paginated orders', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [
          {
            id: 'order-1',
            order_number: 'ORD-20240101-0001',
            customer_email: 'test@example.com',
            customer_name: 'Test Customer',
            total: 110.00,
            status: OrderStatus.PENDING,
            created_at: '2024-01-01T00:00:00.000Z',
          },
        ],
        Count: 1,
      });

      const result = await orderService.listOrders({}, 1, 20);

      expect(result.orders).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });
});
