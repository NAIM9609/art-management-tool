/**
 * Unit tests for OrderService
 */

import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  QueryCommand,
  TransactWriteCommand
} from '@aws-sdk/lib-dynamodb';
import { DynamoDBOptimized } from './dynamodb/DynamoDBOptimized';
import { OrderService, CreateOrderData, OrderItemInput, PaymentData } from './OrderService';
import { OrderStatus } from './dynamodb/repositories/types';

// Mock DynamoDB Document Client
const ddbMock = mockClient(DynamoDBDocumentClient);

describe('OrderService', () => {
  let dynamoDB: DynamoDBOptimized;
  let service: OrderService;

  beforeEach(() => {
    ddbMock.reset();
    dynamoDB = new DynamoDBOptimized({
      tableName: 'test-table',
      region: 'us-east-1',
    });
    service = new OrderService(dynamoDB);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateTotals', () => {
    it('should calculate subtotal, tax, and total correctly', () => {
      const items: OrderItemInput[] = [
        {
          product_id: 1,
          product_name: 'Product 1',
          quantity: 2,
          unit_price: 50.00,
        },
        {
          product_id: 2,
          product_name: 'Product 2',
          quantity: 1,
          unit_price: 30.00,
        },
      ];

      const totals = service.calculateTotals(items);

      expect(totals.subtotal).toBe(130.00); // 2*50 + 1*30
      expect(totals.tax).toBeGreaterThan(0); // Should have tax
      expect(totals.total).toBe(totals.subtotal + totals.tax);
    });

    it('should handle empty items array', () => {
      const totals = service.calculateTotals([]);
      expect(totals.subtotal).toBe(0);
      expect(totals.tax).toBe(0);
      expect(totals.total).toBe(0);
    });
  });

  describe('createOrder', () => {
    const mockOrderData: CreateOrderData = {
      customerEmail: 'test@example.com',
      customerName: 'Test Customer',
      shippingAddress: { street: '123 Main St', city: 'Test City' },
      paymentMethod: 'credit_card',
      items: [
        {
          product_id: 1,
          variant_id: 'variant-1',
          product_name: 'Test Product',
          variant_name: 'Red',
          sku: 'TEST-001',
          quantity: 2,
          unit_price: 50.00,
        },
      ],
    };

    it('should create order with transaction', async () => {
      // Mock order number generation
      ddbMock.on(UpdateCommand).resolves({
        Attributes: { value: 1 },
      });

      // Mock variant stock check
      ddbMock.on(QueryCommand).resolves({
        Items: [{
          id: 'variant-1',
          product_id: 1,
          stock: 10,
          sku: 'TEST-001',
          name: 'Red',
          price_adjustment: 0,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        }],
      });

      // Mock transaction write
      ddbMock.on(TransactWriteCommand).resolves({});

      // Mock notification creation
      ddbMock.on(PutCommand).resolves({});

      const order = await service.createOrder(mockOrderData);

      expect(order).toBeDefined();
      expect(order.customer_email).toBe('test@example.com');
      expect(order.customer_name).toBe('Test Customer');
      expect(order.status).toBe(OrderStatus.PENDING);
      expect(order.order_number).toMatch(/^ORD-\d{8}-\d{4}$/);

      // Verify transaction was called
      const transactCalls = ddbMock.commandCalls(TransactWriteCommand);
      expect(transactCalls).toHaveLength(1);
    });

    it('should throw error if stock is insufficient', async () => {
      // Mock order number generation
      ddbMock.on(UpdateCommand).resolves({
        Attributes: { value: 1 },
      });

      // Mock variant with insufficient stock
      ddbMock.on(QueryCommand).resolves({
        Items: [{
          id: 'variant-1',
          product_id: 1,
          stock: 1, // Less than requested quantity of 2
          sku: 'TEST-001',
          name: 'Red',
          price_adjustment: 0,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        }],
      });

      await expect(service.createOrder(mockOrderData)).rejects.toThrow('Insufficient stock');
    });

    it('should handle transaction cancellation', async () => {
      // Mock order number generation
      ddbMock.on(UpdateCommand).resolves({
        Attributes: { value: 1 },
      });

      // Mock variant stock check
      ddbMock.on(QueryCommand).resolves({
        Items: [{
          id: 'variant-1',
          product_id: 1,
          stock: 10,
          sku: 'TEST-001',
          name: 'Red',
          price_adjustment: 0,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        }],
      });

      // Mock transaction failure
      const error = new Error('Transaction cancelled');
      error.name = 'TransactionCanceledException';
      ddbMock.on(TransactWriteCommand).rejects(error);

      await expect(service.createOrder(mockOrderData)).rejects.toThrow('Order creation failed');
    });
  });

  describe('getOrderById', () => {
    it('should fetch order and items in parallel', async () => {
      const orderId = 'test-order-id';

      // Mock order fetch
      ddbMock.on(GetCommand).resolves({
        Item: {
          id: orderId,
          order_number: 'ORD-20240101-0001',
          customer_email: 'test@example.com',
          customer_name: 'Test Customer',
          status: OrderStatus.PENDING,
          subtotal: 100,
          tax: 10,
          discount: 0,
          total: 110,
          currency: 'EUR',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
      });

      // Mock items fetch
      ddbMock.on(QueryCommand).resolves({
        Items: [
          {
            id: 'item-1',
            order_id: parseInt(orderId),
            product_name: 'Test Product',
            quantity: 2,
            unit_price: 50,
            total_price: 100,
            created_at: '2024-01-01T00:00:00.000Z',
          },
        ],
      });

      const result = await service.getOrderById(orderId);

      expect(result).toBeDefined();
      expect(result?.id).toBe(orderId);
      expect(result?.items).toHaveLength(1);
      expect(result?.items[0].product_name).toBe('Test Product');
    });

    it('should return null if order not found', async () => {
      ddbMock.on(GetCommand).resolves({});
      ddbMock.on(QueryCommand).resolves({ Items: [] });

      const result = await service.getOrderById('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('getOrderByNumber', () => {
    it('should fetch order by order number', async () => {
      const orderNumber = 'ORD-20240101-0001';

      // Mock order fetch by number
      ddbMock.on(QueryCommand).resolves({
        Items: [{
          id: 'test-order-id',
          order_number: orderNumber,
          customer_email: 'test@example.com',
          customer_name: 'Test Customer',
          status: OrderStatus.PENDING,
          subtotal: 100,
          tax: 10,
          discount: 0,
          total: 110,
          currency: 'EUR',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        }],
      });

      const result = await service.getOrderByNumber(orderNumber);

      expect(result).toBeDefined();
      expect(result?.order_number).toBe(orderNumber);
    });
  });

  describe('getOrdersByCustomer', () => {
    it('should fetch orders for a customer with pagination', async () => {
      const email = 'test@example.com';

      ddbMock.on(QueryCommand).resolves({
        Items: [
          {
            id: 'order-1',
            order_number: 'ORD-20240101-0001',
            customer_email: email,
            customer_name: 'Test Customer',
            total: 110,
            status: OrderStatus.PENDING,
            created_at: '2024-01-01T00:00:00.000Z',
          },
        ],
        Count: 1,
      });

      const result = await service.getOrdersByCustomer(email, { limit: 10 });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].customer_email).toBe(email);
    });
  });

  describe('updateOrderStatus', () => {
    it('should update order status and create audit log', async () => {
      const orderId = 'test-order-id';
      const newStatus = OrderStatus.SHIPPED;

      // Mock get current order
      ddbMock.on(GetCommand).resolves({
        Item: {
          id: orderId,
          order_number: 'ORD-20240101-0001',
          status: OrderStatus.PENDING,
          customer_email: 'test@example.com',
          customer_name: 'Test Customer',
          subtotal: 100,
          tax: 10,
          discount: 0,
          total: 110,
          currency: 'EUR',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
      });

      // Mock update order
      ddbMock.on(PutCommand).resolves({});

      const result = await service.updateOrderStatus(orderId, newStatus, 'user-123');

      expect(result).toBeDefined();
      expect(result?.status).toBe(newStatus);

      // Verify audit log and notification were created
      const putCalls = ddbMock.commandCalls(PutCommand);
      expect(putCalls.length).toBeGreaterThan(0);
    });

    it('should return null if order not found', async () => {
      ddbMock.on(GetCommand).resolves({});

      const result = await service.updateOrderStatus('non-existent', OrderStatus.SHIPPED);
      expect(result).toBeNull();
    });
  });

  describe('processPayment', () => {
    it('should update payment status and create audit log', async () => {
      const orderId = 'test-order-id';
      const paymentData: PaymentData = {
        payment_status: 'paid',
        payment_intent_id: 'pi_123',
      };

      // Mock get current order
      ddbMock.on(GetCommand).resolves({
        Item: {
          id: orderId,
          order_number: 'ORD-20240101-0001',
          status: OrderStatus.PENDING,
          payment_status: 'pending',
          customer_email: 'test@example.com',
          customer_name: 'Test Customer',
          subtotal: 100,
          tax: 10,
          discount: 0,
          total: 110,
          currency: 'EUR',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
      });

      // Mock update order
      ddbMock.on(PutCommand).resolves({});

      const result = await service.processPayment(orderId, paymentData, 'user-123');

      expect(result).toBeDefined();
      expect(result?.payment_status).toBe('paid');
      expect(result?.payment_intent_id).toBe('pi_123');

      // Verify audit log and notification were created
      const putCalls = ddbMock.commandCalls(PutCommand);
      expect(putCalls.length).toBeGreaterThan(0);
    });

    it('should return null if order not found', async () => {
      ddbMock.on(GetCommand).resolves({});

      const result = await service.processPayment('non-existent', {
        payment_status: 'paid',
      });
      expect(result).toBeNull();
    });
  });
});
