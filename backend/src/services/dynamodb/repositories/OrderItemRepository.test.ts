/**
 * Unit tests for OrderItemRepository
 */

import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBOptimized } from '../DynamoDBOptimized';
import { OrderItemRepository } from './OrderItemRepository';
import { CreateOrderItemData } from './types';

// Mock DynamoDB Document Client
const ddbMock = mockClient(DynamoDBDocumentClient);

describe('OrderItemRepository', () => {
  let dynamoDB: DynamoDBOptimized;
  let repository: OrderItemRepository;

  beforeEach(() => {
    ddbMock.reset();
    dynamoDB = new DynamoDBOptimized({
      tableName: 'test-table',
      region: 'us-east-1',
    });
    repository = new OrderItemRepository(dynamoDB);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new order item', async () => {
      const createData: CreateOrderItemData = {
        order_id: 1,
        product_id: 101,
        variant_id: 'variant-abc',
        product_name: 'Art Print',
        variant_name: 'Large',
        sku: 'ART-PRINT-L',
        quantity: 2,
        unit_price: 25.00,
        total_price: 50.00,
      };

      ddbMock.on(PutCommand).resolves({});

      const orderItem = await repository.create(createData);

      expect(orderItem.id).toBeDefined();
      expect(orderItem.order_id).toBe(1);
      expect(orderItem.product_id).toBe(101);
      expect(orderItem.variant_id).toBe('variant-abc');
      expect(orderItem.product_name).toBe('Art Print');
      expect(orderItem.variant_name).toBe('Large');
      expect(orderItem.sku).toBe('ART-PRINT-L');
      expect(orderItem.quantity).toBe(2);
      expect(orderItem.unit_price).toBe(25.00);
      expect(orderItem.total_price).toBe(50.00);
      expect(orderItem.created_at).toBeDefined();
    });

    it('should create order item without optional fields', async () => {
      const createData: CreateOrderItemData = {
        order_id: 2,
        product_name: 'Digital Download',
        quantity: 1,
        unit_price: 10.00,
        total_price: 10.00,
      };

      ddbMock.on(PutCommand).resolves({});

      const orderItem = await repository.create(createData);

      expect(orderItem.id).toBeDefined();
      expect(orderItem.order_id).toBe(2);
      expect(orderItem.product_name).toBe('Digital Download');
      expect(orderItem.quantity).toBe(1);
      expect(orderItem.unit_price).toBe(10.00);
      expect(orderItem.total_price).toBe(10.00);
      expect(orderItem.product_id).toBeUndefined();
      expect(orderItem.variant_id).toBeUndefined();
      expect(orderItem.variant_name).toBeUndefined();
      expect(orderItem.sku).toBeUndefined();
    });

    it('should create order item with correct DynamoDB structure', async () => {
      const createData: CreateOrderItemData = {
        order_id: 3,
        product_id: 102,
        product_name: 'Poster',
        quantity: 3,
        unit_price: 15.00,
        total_price: 45.00,
      };

      let putItem: any;
      ddbMock.on(PutCommand).callsFake((input) => {
        putItem = input.Item;
        return {};
      });

      await repository.create(createData);

      expect(putItem.PK).toBe('ORDER#3');
      expect(putItem.SK).toMatch(/^ITEM#/);
      expect(putItem.entity_type).toBe('OrderItem');
      expect(putItem.id).toBeDefined();
      expect(putItem.order_id).toBe(3);
      expect(putItem.product_id).toBe(102);
      expect(putItem.product_name).toBe('Poster');
      expect(putItem.quantity).toBe(3);
      expect(putItem.unit_price).toBe(15.00);
      expect(putItem.total_price).toBe(45.00);
    });

    it('should include proper product/variant references', async () => {
      const createData: CreateOrderItemData = {
        order_id: 4,
        product_id: 103,
        variant_id: 'variant-xyz',
        product_name: 'Canvas Print',
        variant_name: 'Medium',
        sku: 'CANVAS-M',
        quantity: 1,
        unit_price: 75.00,
        total_price: 75.00,
      };

      let putItem: any;
      ddbMock.on(PutCommand).callsFake((input) => {
        putItem = input.Item;
        return {};
      });

      const orderItem = await repository.create(createData);

      // Verify the order item has correct references
      expect(orderItem.product_id).toBe(103);
      expect(orderItem.variant_id).toBe('variant-xyz');
      
      // Verify DynamoDB item has correct references
      expect(putItem.product_id).toBe(103);
      expect(putItem.variant_id).toBe('variant-xyz');
    });
  });

  describe('findByOrderId', () => {
    it('should retrieve all items for an order in single query', async () => {
      const mockItems = [
        {
          PK: 'ORDER#1',
          SK: 'ITEM#item-1',
          entity_type: 'OrderItem',
          id: 'item-1',
          order_id: 1,
          product_id: 101,
          product_name: 'Art Print',
          quantity: 2,
          unit_price: 25.00,
          total_price: 50.00,
          created_at: '2024-01-01T00:00:00.000Z',
        },
        {
          PK: 'ORDER#1',
          SK: 'ITEM#item-2',
          entity_type: 'OrderItem',
          id: 'item-2',
          order_id: 1,
          product_id: 102,
          variant_id: 'variant-abc',
          product_name: 'Poster',
          variant_name: 'Large',
          sku: 'POSTER-L',
          quantity: 1,
          unit_price: 15.00,
          total_price: 15.00,
          created_at: '2024-01-01T00:00:00.000Z',
        },
      ];

      ddbMock.on(QueryCommand).resolves({
        Items: mockItems,
        Count: 2,
      });

      const items = await repository.findByOrderId(1);

      expect(items).toHaveLength(2);
      expect(items[0].id).toBe('item-1');
      expect(items[0].order_id).toBe(1);
      expect(items[0].product_id).toBe(101);
      expect(items[0].product_name).toBe('Art Print');
      expect(items[0].quantity).toBe(2);
      
      expect(items[1].id).toBe('item-2');
      expect(items[1].order_id).toBe(1);
      expect(items[1].product_id).toBe(102);
      expect(items[1].variant_id).toBe('variant-abc');
      expect(items[1].product_name).toBe('Poster');
      expect(items[1].variant_name).toBe('Large');
      expect(items[1].sku).toBe('POSTER-L');
      expect(items[1].quantity).toBe(1);
    });

    it('should return empty array when order has no items', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [],
        Count: 0,
      });

      const items = await repository.findByOrderId(999);

      expect(items).toHaveLength(0);
    });

    it('should use eventually consistent reads for cost optimization', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [],
        Count: 0,
      });

      await repository.findByOrderId(1);

      const call = ddbMock.commandCalls(QueryCommand)[0];
      expect(call.args[0].input.ConsistentRead).toBe(false);
    });

    it('should query with correct PK and SK prefix', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [],
        Count: 0,
      });

      await repository.findByOrderId(42);

      const call = ddbMock.commandCalls(QueryCommand)[0];
      expect(call.args[0].input.KeyConditionExpression).toBe('PK = :pk AND begins_with(SK, :sk)');
      expect(call.args[0].input.ExpressionAttributeValues).toEqual({
        ':pk': 'ORDER#42',
        ':sk': 'ITEM#',
      });
    });
  });

  describe('batchCreate', () => {
    it('should batch create multiple order items', async () => {
      const items: CreateOrderItemData[] = [
        {
          order_id: 1,
          product_id: 101,
          product_name: 'Art Print',
          quantity: 2,
          unit_price: 25.00,
          total_price: 50.00,
        },
        {
          order_id: 1,
          product_id: 102,
          variant_id: 'variant-abc',
          product_name: 'Poster',
          variant_name: 'Large',
          sku: 'POSTER-L',
          quantity: 1,
          unit_price: 15.00,
          total_price: 15.00,
        },
        {
          order_id: 1,
          product_id: 103,
          product_name: 'Canvas',
          quantity: 1,
          unit_price: 100.00,
          total_price: 100.00,
        },
      ];

      ddbMock.on(BatchWriteCommand).resolves({});

      const created = await repository.batchCreate(items);

      expect(created).toHaveLength(3);
      expect(created[0].order_id).toBe(1);
      expect(created[0].product_id).toBe(101);
      expect(created[0].product_name).toBe('Art Print');
      expect(created[0].id).toBeDefined();
      
      expect(created[1].order_id).toBe(1);
      expect(created[1].product_id).toBe(102);
      expect(created[1].variant_id).toBe('variant-abc');
      expect(created[1].product_name).toBe('Poster');
      expect(created[1].variant_name).toBe('Large');
      expect(created[1].id).toBeDefined();
      
      expect(created[2].order_id).toBe(1);
      expect(created[2].product_id).toBe(103);
      expect(created[2].product_name).toBe('Canvas');
      expect(created[2].id).toBeDefined();
    });

    it('should return empty array for empty input', async () => {
      const created = await repository.batchCreate([]);
      expect(created).toHaveLength(0);
    });

    it('should throw error when batch size exceeds 25', async () => {
      const items: CreateOrderItemData[] = Array.from({ length: 26 }, (_, i) => ({
        order_id: 1,
        product_name: `Product ${i}`,
        quantity: 1,
        unit_price: 10.00,
        total_price: 10.00,
      }));

      await expect(repository.batchCreate(items)).rejects.toThrow('Batch create supports up to 25 order items');
    });

    it('should create all items with same timestamp', async () => {
      const items: CreateOrderItemData[] = [
        {
          order_id: 1,
          product_name: 'Item 1',
          quantity: 1,
          unit_price: 10.00,
          total_price: 10.00,
        },
        {
          order_id: 1,
          product_name: 'Item 2',
          quantity: 1,
          unit_price: 20.00,
          total_price: 20.00,
        },
      ];

      ddbMock.on(BatchWriteCommand).resolves({});

      const created = await repository.batchCreate(items);

      expect(created[0].created_at).toBe(created[1].created_at);
    });

    it('should properly handle product and variant references in batch', async () => {
      const items: CreateOrderItemData[] = [
        {
          order_id: 1,
          product_id: 101,
          variant_id: 'var-1',
          product_name: 'Item with variant',
          variant_name: 'Small',
          sku: 'ITEM-S',
          quantity: 1,
          unit_price: 10.00,
          total_price: 10.00,
        },
        {
          order_id: 1,
          product_id: 102,
          product_name: 'Item without variant',
          quantity: 1,
          unit_price: 20.00,
          total_price: 20.00,
        },
      ];

      ddbMock.on(BatchWriteCommand).resolves({});

      const created = await repository.batchCreate(items);

      // First item should have all references
      expect(created[0].product_id).toBe(101);
      expect(created[0].variant_id).toBe('var-1');
      expect(created[0].variant_name).toBe('Small');
      expect(created[0].sku).toBe('ITEM-S');
      
      // Second item should only have product_id
      expect(created[1].product_id).toBe(102);
      expect(created[1].variant_id).toBeUndefined();
      expect(created[1].variant_name).toBeUndefined();
      expect(created[1].sku).toBeUndefined();
    });
  });
});
