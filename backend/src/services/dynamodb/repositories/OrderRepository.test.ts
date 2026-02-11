/**
 * Unit tests for OrderRepository
 */

import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBOptimized } from '../DynamoDBOptimized';
import { OrderRepository } from './OrderRepository';
import { OrderStatus, CreateOrderData, UpdateOrderData } from './types';

// Mock DynamoDB Document Client
const ddbMock = mockClient(DynamoDBDocumentClient);

describe('OrderRepository', () => {
  let dynamoDB: DynamoDBOptimized;
  let repository: OrderRepository;

  beforeEach(() => {
    ddbMock.reset();
    dynamoDB = new DynamoDBOptimized({
      tableName: 'test-table',
      region: 'us-east-1',
    });
    repository = new OrderRepository(dynamoDB);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateOrderNumber', () => {
    it('should generate order number in correct format ORD-YYYYMMDD-XXXX', async () => {
      ddbMock.on(UpdateCommand).resolves({
        Attributes: { value: 1 },
      });

      const orderNumber = await repository.generateOrderNumber();
      
      // Check format: ORD-YYYYMMDD-XXXX
      expect(orderNumber).toMatch(/^ORD-\d{8}-\d{4}$/);
      
      // Check the date part is today
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      expect(orderNumber).toContain(today);
      
      // Check sequential number is padded
      expect(orderNumber).toContain('-0001');
    });

    it('should generate sequential numbers with proper padding', async () => {
      ddbMock.on(UpdateCommand)
        .resolvesOnce({ Attributes: { value: 1 } })
        .resolvesOnce({ Attributes: { value: 2 } })
        .resolvesOnce({ Attributes: { value: 99 } })
        .resolvesOnce({ Attributes: { value: 9999 } });

      const order1 = await repository.generateOrderNumber();
      expect(order1).toMatch(/-0001$/);

      const order2 = await repository.generateOrderNumber();
      expect(order2).toMatch(/-0002$/);

      const order3 = await repository.generateOrderNumber();
      expect(order3).toMatch(/-0099$/);

      const order4 = await repository.generateOrderNumber();
      expect(order4).toMatch(/-9999$/);
    });

    it('should use atomic counter to ensure uniqueness', async () => {
      const updateSpy = jest.fn().mockResolvedValue({
        Attributes: { value: 1 },
      });

      ddbMock.on(UpdateCommand).callsFake(updateSpy);

      await repository.generateOrderNumber();

      expect(updateSpy).toHaveBeenCalledTimes(1);
      const callArgs = updateSpy.mock.calls[0][0];
      expect(callArgs.input.UpdateExpression).toContain('if_not_exists');
      expect(callArgs.input.ReturnValues).toBe('ALL_NEW');
    });
  });

  describe('create', () => {
    it('should create a new order with auto-generated order number', async () => {
      const createData: CreateOrderData = {
        customer_email: 'test@example.com',
        customer_name: 'Test Customer',
        subtotal: 100.00,
        tax: 10.00,
        discount: 5.00,
        total: 105.00,
        currency: 'EUR',
        status: OrderStatus.PENDING,
      };

      ddbMock.on(UpdateCommand).resolves({ Attributes: { value: 1 } });
      ddbMock.on(PutCommand).resolves({});

      const order = await repository.create(createData);

      expect(order.id).toBeDefined();
      expect(order.order_number).toMatch(/^ORD-\d{8}-\d{4}$/);
      expect(order.customer_email).toBe('test@example.com');
      expect(order.customer_name).toBe('Test Customer');
      expect(order.subtotal).toBe(100.00);
      expect(order.tax).toBe(10.00);
      expect(order.discount).toBe(5.00);
      expect(order.total).toBe(105.00);
      expect(order.status).toBe(OrderStatus.PENDING);
      expect(order.created_at).toBeDefined();
      expect(order.updated_at).toBeDefined();
    });

    it('should set default values when not provided', async () => {
      const createData: CreateOrderData = {
        customer_email: 'test@example.com',
        customer_name: 'Test Customer',
        subtotal: 50.00,
        total: 50.00,
      };

      ddbMock.on(UpdateCommand).resolves({ Attributes: { value: 1 } });
      ddbMock.on(PutCommand).resolves({});

      const order = await repository.create(createData);

      expect(order.tax).toBe(0);
      expect(order.discount).toBe(0);
      expect(order.currency).toBe('EUR');
      expect(order.status).toBe(OrderStatus.PENDING);
    });

    it('should create order with all optional fields', async () => {
      const createData: CreateOrderData = {
        user_id: 123,
        customer_email: 'test@example.com',
        customer_name: 'Test Customer',
        subtotal: 100.00,
        total: 100.00,
        payment_status: 'paid',
        payment_intent_id: 'pi_123456',
        payment_method: 'credit_card',
        fulfillment_status: 'unfulfilled',
        shipping_address: { street: '123 Main St', city: 'Test City' },
        billing_address: { street: '123 Main St', city: 'Test City' },
        notes: 'Test notes',
      };

      ddbMock.on(UpdateCommand).resolves({ Attributes: { value: 1 } });
      ddbMock.on(PutCommand).resolves({});

      const order = await repository.create(createData);

      expect(order.user_id).toBe(123);
      expect(order.payment_status).toBe('paid');
      expect(order.payment_intent_id).toBe('pi_123456');
      expect(order.payment_method).toBe('credit_card');
      expect(order.fulfillment_status).toBe('unfulfilled');
      expect(order.shipping_address).toEqual({ street: '123 Main St', city: 'Test City' });
      expect(order.billing_address).toEqual({ street: '123 Main St', city: 'Test City' });
      expect(order.notes).toBe('Test notes');
    });

    it('should store correct DynamoDB structure with GSI keys', async () => {
      const createData: CreateOrderData = {
        customer_email: 'test@example.com',
        customer_name: 'Test Customer',
        subtotal: 100.00,
        total: 100.00,
        status: OrderStatus.PROCESSING,
      };

      ddbMock.on(UpdateCommand).resolves({ Attributes: { value: 1 } });
      
      const putSpy = jest.fn().mockResolvedValue({});
      ddbMock.on(PutCommand).callsFake(putSpy);

      await repository.create(createData);

      expect(putSpy).toHaveBeenCalledTimes(1);
      const item = putSpy.mock.calls[0][0].input.Item;
      
      expect(item.PK).toMatch(/^ORDER#/);
      expect(item.SK).toBe('METADATA');
      expect(item.GSI1PK).toMatch(/^ORDER_NUMBER#ORD-/);
      expect(item.GSI2PK).toBe('ORDER_EMAIL#test@example.com');
      expect(item.GSI2SK).toBeDefined();
      expect(item.GSI3PK).toBe('ORDER_STATUS#processing');
      expect(item.GSI3SK).toBeDefined();
    });
  });

  describe('findById', () => {
    it('should find order by ID', async () => {
      const mockOrder = {
        PK: 'ORDER#test-id',
        SK: 'METADATA',
        id: 'test-id',
        order_number: 'ORD-20260211-0001',
        customer_email: 'test@example.com',
        customer_name: 'Test Customer',
        subtotal: 100,
        tax: 10,
        discount: 5,
        total: 105,
        currency: 'EUR',
        status: OrderStatus.PENDING,
        created_at: '2026-02-11T00:00:00.000Z',
        updated_at: '2026-02-11T00:00:00.000Z',
      };

      ddbMock.on(GetCommand).resolves({ Item: mockOrder });

      const order = await repository.findById('test-id');

      expect(order).toBeDefined();
      expect(order?.id).toBe('test-id');
      expect(order?.order_number).toBe('ORD-20260211-0001');
      expect(order?.customer_email).toBe('test@example.com');
    });

    it('should return null when order not found', async () => {
      ddbMock.on(GetCommand).resolves({});

      const order = await repository.findById('non-existent-id');

      expect(order).toBeNull();
    });

    it('should use consistent read for findById', async () => {
      const getSpy = jest.fn().mockResolvedValue({});
      ddbMock.on(GetCommand).callsFake(getSpy);

      await repository.findById('test-id');

      expect(getSpy).toHaveBeenCalledTimes(1);
      const callArgs = getSpy.mock.calls[0][0];
      expect(callArgs.input.ConsistentRead).toBe(true);
    });
  });

  describe('findByOrderNumber', () => {
    it('should find order by order number using GSI1', async () => {
      const mockOrder = {
        id: 'test-id',
        order_number: 'ORD-20260211-0001',
        customer_email: 'test@example.com',
        customer_name: 'Test Customer',
        subtotal: 100,
        tax: 10,
        discount: 5,
        total: 105,
        currency: 'EUR',
        status: OrderStatus.PENDING,
        created_at: '2026-02-11T00:00:00.000Z',
        updated_at: '2026-02-11T00:00:00.000Z',
      };

      ddbMock.on(QueryCommand).resolves({ Items: [mockOrder] });

      const order = await repository.findByOrderNumber('ORD-20260211-0001');

      expect(order).toBeDefined();
      expect(order?.order_number).toBe('ORD-20260211-0001');
    });

    it('should return null when order number not found', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });

      const order = await repository.findByOrderNumber('ORD-99999999-9999');

      expect(order).toBeNull();
    });

    it('should query GSI1 with correct parameters', async () => {
      const querySpy = jest.fn().mockResolvedValue({ Items: [] });
      ddbMock.on(QueryCommand).callsFake(querySpy);

      await repository.findByOrderNumber('ORD-20260211-0001');

      expect(querySpy).toHaveBeenCalledTimes(1);
      const callArgs = querySpy.mock.calls[0][0];
      expect(callArgs.input.IndexName).toBe('GSI1');
      expect(callArgs.input.KeyConditionExpression).toContain('GSI1PK');
    });
  });

  describe('findAll', () => {
    it('should find all orders with default status PENDING', async () => {
      const mockOrders = [
        {
          id: 'order-1',
          order_number: 'ORD-20260211-0001',
          customer_email: 'test1@example.com',
          customer_name: 'Customer 1',
          total: 100,
          status: OrderStatus.PENDING,
          created_at: '2026-02-11T00:00:00.000Z',
        },
        {
          id: 'order-2',
          order_number: 'ORD-20260211-0002',
          customer_email: 'test2@example.com',
          customer_name: 'Customer 2',
          total: 200,
          status: OrderStatus.PENDING,
          created_at: '2026-02-11T00:01:00.000Z',
        },
      ];

      ddbMock.on(QueryCommand).resolves({ Items: mockOrders });

      const result = await repository.findAll();

      expect(result.items).toHaveLength(2);
      expect(result.count).toBe(2);
    });

    it('should find orders filtered by status', async () => {
      const mockOrders = [
        {
          id: 'order-1',
          order_number: 'ORD-20260211-0001',
          customer_email: 'test1@example.com',
          customer_name: 'Customer 1',
          total: 100,
          status: OrderStatus.SHIPPED,
          created_at: '2026-02-11T00:00:00.000Z',
        },
      ];

      ddbMock.on(QueryCommand).resolves({ Items: mockOrders });

      const result = await repository.findAll({ status: OrderStatus.SHIPPED });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].status).toBe(OrderStatus.SHIPPED);
    });

    it('should use GSI3 with pagination', async () => {
      const querySpy = jest.fn().mockResolvedValue({ Items: [] });
      ddbMock.on(QueryCommand).callsFake(querySpy);

      await repository.findAll(
        { status: OrderStatus.PENDING },
        { limit: 10, lastEvaluatedKey: { PK: 'test' } }
      );

      expect(querySpy).toHaveBeenCalledTimes(1);
      const callArgs = querySpy.mock.calls[0][0];
      expect(callArgs.input.IndexName).toBe('GSI3');
      expect(callArgs.input.Limit).toBe(10);
      expect(callArgs.input.ExclusiveStartKey).toEqual({ PK: 'test' });
    });

    it('should use projection expression for cost optimization', async () => {
      const querySpy = jest.fn().mockResolvedValue({ Items: [] });
      ddbMock.on(QueryCommand).callsFake(querySpy);

      await repository.findAll();

      expect(querySpy).toHaveBeenCalledTimes(1);
      const callArgs = querySpy.mock.calls[0][0];
      expect(callArgs.input.ProjectionExpression).toBeDefined();
      expect(callArgs.input.ProjectionExpression).toContain('id');
      expect(callArgs.input.ProjectionExpression).toContain('order_number');
    });

    it('should filter out soft-deleted orders', async () => {
      const querySpy = jest.fn().mockResolvedValue({ Items: [] });
      ddbMock.on(QueryCommand).callsFake(querySpy);

      await repository.findAll();

      expect(querySpy).toHaveBeenCalledTimes(1);
      const callArgs = querySpy.mock.calls[0][0];
      expect(callArgs.input.FilterExpression).toContain('deleted_at');
    });
  });

  describe('update', () => {
    it('should update an existing order', async () => {
      const existingOrder = {
        id: 'test-id',
        order_number: 'ORD-20260211-0001',
        customer_email: 'test@example.com',
        customer_name: 'Test Customer',
        subtotal: 100,
        tax: 10,
        discount: 5,
        total: 105,
        currency: 'EUR',
        status: OrderStatus.PENDING,
        created_at: '2026-02-11T00:00:00.000Z',
        updated_at: '2026-02-11T00:00:00.000Z',
      };

      ddbMock.on(GetCommand).resolves({ Item: existingOrder });
      ddbMock.on(PutCommand).resolves({});

      const updateData: UpdateOrderData = {
        status: OrderStatus.PROCESSING,
        payment_status: 'paid',
      };

      const updated = await repository.update('test-id', updateData);

      expect(updated).toBeDefined();
      expect(updated?.status).toBe(OrderStatus.PROCESSING);
      expect(updated?.payment_status).toBe('paid');
      expect(updated?.updated_at).not.toBe(existingOrder.updated_at);
    });

    it('should return null when order not found', async () => {
      ddbMock.on(GetCommand).resolves({});

      const updated = await repository.update('non-existent-id', {
        status: OrderStatus.PROCESSING,
      });

      expect(updated).toBeNull();
    });

    it('should preserve unchanged fields', async () => {
      const existingOrder = {
        id: 'test-id',
        order_number: 'ORD-20260211-0001',
        customer_email: 'test@example.com',
        customer_name: 'Test Customer',
        subtotal: 100,
        tax: 10,
        discount: 5,
        total: 105,
        currency: 'EUR',
        status: OrderStatus.PENDING,
        created_at: '2026-02-11T00:00:00.000Z',
        updated_at: '2026-02-11T00:00:00.000Z',
      };

      ddbMock.on(GetCommand).resolves({ Item: existingOrder });
      ddbMock.on(PutCommand).resolves({});

      const updated = await repository.update('test-id', {
        status: OrderStatus.PROCESSING,
      });

      expect(updated?.customer_email).toBe('test@example.com');
      expect(updated?.total).toBe(105);
      expect(updated?.order_number).toBe('ORD-20260211-0001');
    });
  });

  describe('softDelete', () => {
    it('should soft delete an existing order', async () => {
      const existingOrder = {
        id: 'test-id',
        order_number: 'ORD-20260211-0001',
        customer_email: 'test@example.com',
        customer_name: 'Test Customer',
        subtotal: 100,
        tax: 10,
        discount: 5,
        total: 105,
        currency: 'EUR',
        status: OrderStatus.PENDING,
        created_at: '2026-02-11T00:00:00.000Z',
        updated_at: '2026-02-11T00:00:00.000Z',
      };

      ddbMock.on(GetCommand).resolves({ Item: existingOrder });
      ddbMock.on(UpdateCommand).resolves({});

      const result = await repository.softDelete('test-id');

      expect(result).toBe(true);
    });

    it('should return false when order not found', async () => {
      ddbMock.on(GetCommand).resolves({});

      const result = await repository.softDelete('non-existent-id');

      expect(result).toBe(false);
    });
  });

  describe('findByCustomerEmail', () => {
    it('should find orders by customer email using GSI2', async () => {
      const mockOrders = [
        {
          id: 'order-1',
          order_number: 'ORD-20260211-0001',
          total: 100,
          status: OrderStatus.PENDING,
          created_at: '2026-02-11T00:00:00.000Z',
        },
        {
          id: 'order-2',
          order_number: 'ORD-20260211-0002',
          total: 200,
          status: OrderStatus.SHIPPED,
          created_at: '2026-02-11T00:01:00.000Z',
        },
      ];

      ddbMock.on(QueryCommand).resolves({ Items: mockOrders });

      const result = await repository.findByCustomerEmail('test@example.com');

      expect(result.items).toHaveLength(2);
      expect(result.count).toBe(2);
    });

    it('should query GSI2 with correct parameters', async () => {
      const querySpy = jest.fn().mockResolvedValue({ Items: [] });
      ddbMock.on(QueryCommand).callsFake(querySpy);

      await repository.findByCustomerEmail('test@example.com');

      expect(querySpy).toHaveBeenCalledTimes(1);
      const callArgs = querySpy.mock.calls[0][0];
      expect(callArgs.input.IndexName).toBe('GSI2');
      expect(callArgs.input.KeyConditionExpression).toContain('GSI2PK');
      expect(callArgs.input.ScanIndexForward).toBe(false); // Most recent first
    });

    it('should use projection expression for cost optimization', async () => {
      const querySpy = jest.fn().mockResolvedValue({ Items: [] });
      ddbMock.on(QueryCommand).callsFake(querySpy);

      await repository.findByCustomerEmail('test@example.com');

      expect(querySpy).toHaveBeenCalledTimes(1);
      const callArgs = querySpy.mock.calls[0][0];
      expect(callArgs.input.ProjectionExpression).toBeDefined();
    });
  });

  describe('findByStatus', () => {
    it('should find orders by status using GSI3', async () => {
      const mockOrders = [
        {
          id: 'order-1',
          order_number: 'ORD-20260211-0001',
          customer_email: 'test1@example.com',
          customer_name: 'Customer 1',
          total: 100,
          created_at: '2026-02-11T00:00:00.000Z',
        },
      ];

      ddbMock.on(QueryCommand).resolves({ Items: mockOrders });

      const result = await repository.findByStatus(OrderStatus.SHIPPED);

      expect(result.items).toHaveLength(1);
    });

    it('should query GSI3 with correct parameters', async () => {
      const querySpy = jest.fn().mockResolvedValue({ Items: [] });
      ddbMock.on(QueryCommand).callsFake(querySpy);

      await repository.findByStatus(OrderStatus.PROCESSING);

      expect(querySpy).toHaveBeenCalledTimes(1);
      const callArgs = querySpy.mock.calls[0][0];
      expect(callArgs.input.IndexName).toBe('GSI3');
      expect(callArgs.input.ScanIndexForward).toBe(false); // Most recent first
    });
  });

  describe('findByDateRange', () => {
    it('should find orders by date range with status', async () => {
      const mockOrders = [
        {
          id: 'order-1',
          order_number: 'ORD-20260211-0001',
          customer_email: 'test1@example.com',
          customer_name: 'Customer 1',
          total: 100,
          status: OrderStatus.PENDING,
          created_at: '2026-02-11T00:00:00.000Z',
        },
      ];

      ddbMock.on(QueryCommand).resolves({ Items: mockOrders });

      const result = await repository.findByDateRange(
        '2026-02-01',
        '2026-02-28',
        OrderStatus.PENDING
      );

      expect(result.items).toHaveLength(1);
    });

    it('should query GSI3 with BETWEEN condition', async () => {
      const querySpy = jest.fn().mockResolvedValue({ Items: [] });
      ddbMock.on(QueryCommand).callsFake(querySpy);

      await repository.findByDateRange(
        '2026-02-01',
        '2026-02-28',
        OrderStatus.PENDING
      );

      expect(querySpy).toHaveBeenCalledTimes(1);
      const callArgs = querySpy.mock.calls[0][0];
      expect(callArgs.input.KeyConditionExpression).toContain('BETWEEN');
    });

    it('should find orders by date range without status', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });

      const result = await repository.findByDateRange(
        '2026-02-01',
        '2026-02-28'
      );

      // Should query multiple statuses
      expect(result).toBeDefined();
      expect(result.items).toEqual([]);
    });
  });

  describe('batchGet', () => {
    it('should batch get multiple orders', async () => {
      const mockOrders = [
        {
          id: 'order-1',
          order_number: 'ORD-20260211-0001',
          customer_email: 'test1@example.com',
          customer_name: 'Customer 1',
          total: 100,
          status: OrderStatus.PENDING,
          created_at: '2026-02-11T00:00:00.000Z',
          updated_at: '2026-02-11T00:00:00.000Z',
        },
        {
          id: 'order-2',
          order_number: 'ORD-20260211-0002',
          customer_email: 'test2@example.com',
          customer_name: 'Customer 2',
          total: 200,
          status: OrderStatus.SHIPPED,
          created_at: '2026-02-11T00:01:00.000Z',
          updated_at: '2026-02-11T00:01:00.000Z',
        },
      ];

      ddbMock.on(BatchGetCommand).resolves({
        Responses: { 'test-table': mockOrders },
      });

      const orders = await repository.batchGet(['order-1', 'order-2']);

      expect(orders).toHaveLength(2);
      expect(orders[0].id).toBe('order-1');
      expect(orders[1].id).toBe('order-2');
    });

    it('should return empty array when no IDs provided', async () => {
      const orders = await repository.batchGet([]);

      expect(orders).toEqual([]);
    });

    it('should use correct keys for batch get', async () => {
      const batchGetSpy = jest.fn().mockResolvedValue({
        Responses: { 'test-table': [] },
      });
      ddbMock.on(BatchGetCommand).callsFake(batchGetSpy);

      await repository.batchGet(['order-1', 'order-2']);

      expect(batchGetSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle large discount values', async () => {
      const createData: CreateOrderData = {
        customer_email: 'test@example.com',
        customer_name: 'Test Customer',
        subtotal: 100.00,
        discount: 50.00,
        total: 50.00,
      };

      ddbMock.on(UpdateCommand).resolves({ Attributes: { value: 1 } });
      ddbMock.on(PutCommand).resolves({});

      const order = await repository.create(createData);

      expect(order.discount).toBe(50.00);
      expect(order.total).toBe(50.00);
    });

    it('should handle zero values correctly', async () => {
      const createData: CreateOrderData = {
        customer_email: 'test@example.com',
        customer_name: 'Test Customer',
        subtotal: 0,
        total: 0,
      };

      ddbMock.on(UpdateCommand).resolves({ Attributes: { value: 1 } });
      ddbMock.on(PutCommand).resolves({});

      const order = await repository.create(createData);

      expect(order.subtotal).toBe(0);
      expect(order.total).toBe(0);
      expect(order.tax).toBe(0);
      expect(order.discount).toBe(0);
    });

    it('should handle pagination with lastEvaluatedKey', async () => {
      const mockOrders = [
        {
          id: 'order-1',
          order_number: 'ORD-20260211-0001',
          customer_email: 'test1@example.com',
          customer_name: 'Customer 1',
          total: 100,
          status: OrderStatus.PENDING,
          created_at: '2026-02-11T00:00:00.000Z',
        },
      ];

      ddbMock.on(QueryCommand).resolves({
        Items: mockOrders,
        LastEvaluatedKey: { PK: 'ORDER#order-1', SK: 'METADATA' },
      });

      const result = await repository.findAll();

      expect(result.lastEvaluatedKey).toBeDefined();
      expect(result.lastEvaluatedKey).toEqual({ PK: 'ORDER#order-1', SK: 'METADATA' });
    });
  });
});
