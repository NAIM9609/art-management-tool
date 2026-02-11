/**
 * Unit tests for CartItemRepository
 */

import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBOptimized } from '../DynamoDBOptimized';
import { CartItemRepository } from './CartItemRepository';

// Mock DynamoDB Document Client
const ddbMock = mockClient(DynamoDBDocumentClient);

describe('CartItemRepository', () => {
  let dynamoDB: DynamoDBOptimized;
  let repository: CartItemRepository;

  beforeEach(() => {
    ddbMock.reset();
    dynamoDB = new DynamoDBOptimized({
      tableName: 'test-table',
      region: 'us-east-1',
    });
    repository = new CartItemRepository(dynamoDB);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findByCartId', () => {
    it('should retrieve all items for a cart in single query', async () => {
      const mockItems = [
        {
          PK: 'CART#cart-123',
          SK: 'ITEM#item-1',
          id: 'item-1',
          cart_id: 'cart-123',
          product_id: 1,
          quantity: 2,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
        {
          PK: 'CART#cart-123',
          SK: 'ITEM#item-2',
          id: 'item-2',
          cart_id: 'cart-123',
          product_id: 2,
          variant_id: 5,
          quantity: 1,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
      ];

      ddbMock.on(QueryCommand).resolves({
        Items: mockItems,
        Count: 2,
        ScannedCount: 2,
        ConsumedCapacity: {},
      });

      const items = await repository.findByCartId('cart-123');

      expect(items).toHaveLength(2);
      expect(items[0].id).toBe('item-1');
      expect(items[0].product_id).toBe(1);
      expect(items[0].quantity).toBe(2);
      expect(items[1].id).toBe('item-2');
      expect(items[1].variant_id).toBe(5);
    });

    it('should return empty array if cart has no items', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [],
        Count: 0,
        ScannedCount: 0,
        ConsumedCapacity: {},
      });

      const items = await repository.findByCartId('empty-cart');

      expect(items).toHaveLength(0);
    });
  });

  describe('addItem', () => {
    it('should create new item if it does not exist', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [],
        Count: 0,
        ScannedCount: 0,
        ConsumedCapacity: {},
      });

      ddbMock.on(PutCommand).resolves({});

      const item = await repository.addItem('cart-123', 100, undefined, 3);

      expect(item.id).toBeDefined();
      expect(item.cart_id).toBe('cart-123');
      expect(item.product_id).toBe(100);
      expect(item.variant_id).toBeUndefined();
      expect(item.quantity).toBe(3);
      expect(item.created_at).toBeDefined();
      expect(item.updated_at).toBeDefined();
    });

    it('should create item with variant_id', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [],
        Count: 0,
        ScannedCount: 0,
        ConsumedCapacity: {},
      });

      ddbMock.on(PutCommand).resolves({});

      const item = await repository.addItem('cart-123', 200, 10, 2);

      expect(item.product_id).toBe(200);
      expect(item.variant_id).toBe(10);
      expect(item.quantity).toBe(2);
    });

    it('should update quantity if item already exists', async () => {
      const existingItem = {
        PK: 'CART#cart-123',
        SK: 'ITEM#existing-item',
        id: 'existing-item',
        cart_id: 'cart-123',
        product_id: 100,
        quantity: 2,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      };

      ddbMock.on(QueryCommand).resolves({
        Items: [existingItem],
        Count: 1,
        ScannedCount: 1,
        ConsumedCapacity: {},
      });

      ddbMock.on(UpdateCommand).resolves({
        Attributes: {
          ...existingItem,
          quantity: 5,
          updated_at: '2024-01-02T00:00:00.000Z',
        },
      });

      const item = await repository.addItem('cart-123', 100, undefined, 3);

      expect(item.id).toBe('existing-item');
      expect(item.quantity).toBe(5); // 2 + 3
    });

    it('should match items by both product_id and variant_id', async () => {
      const existingItems = [
        {
          PK: 'CART#cart-123',
          SK: 'ITEM#item-1',
          id: 'item-1',
          cart_id: 'cart-123',
          product_id: 100,
          variant_id: 5,
          quantity: 1,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
        {
          PK: 'CART#cart-123',
          SK: 'ITEM#item-2',
          id: 'item-2',
          cart_id: 'cart-123',
          product_id: 100,
          variant_id: 6,
          quantity: 2,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
      ];

      ddbMock.on(QueryCommand).resolves({
        Items: existingItems,
        Count: 2,
        ScannedCount: 2,
        ConsumedCapacity: {},
      });

      ddbMock.on(UpdateCommand).resolves({
        Attributes: {
          ...existingItems[1],
          quantity: 4,
        },
      });

      // Adding to variant 6 should update item-2
      const item = await repository.addItem('cart-123', 100, 6, 2);

      expect(item.id).toBe('item-2');
      expect(item.quantity).toBe(4);
    });
  });

  describe('updateQuantity', () => {
    it('should update item quantity atomically', async () => {
      const mockUpdatedItem = {
        PK: 'CART#cart-123',
        SK: 'ITEM#item-1',
        id: 'item-1',
        cart_id: 'cart-123',
        product_id: 100,
        quantity: 5,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-02T00:00:00.000Z',
      };

      ddbMock.on(UpdateCommand).resolves({
        Attributes: mockUpdatedItem,
      });

      const item = await repository.updateQuantity('cart-123', 'item-1', 5);

      expect(item.quantity).toBe(5);
      expect(item.updated_at).toBe('2024-01-02T00:00:00.000Z');
    });

    it('should throw error if item not found', async () => {
      ddbMock.on(UpdateCommand).rejects({
        name: 'ConditionalCheckFailedException',
      });

      await expect(
        repository.updateQuantity('cart-123', 'non-existent', 3)
      ).rejects.toThrow('Item not found');
    });

    it('should use atomic SET operation', async () => {
      ddbMock.on(UpdateCommand).resolves({
        Attributes: {
          PK: 'CART#cart-123',
          SK: 'ITEM#item-1',
          id: 'item-1',
          cart_id: 'cart-123',
          product_id: 100,
          quantity: 10,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-02T00:00:00.000Z',
        },
      });

      await repository.updateQuantity('cart-123', 'item-1', 10);

      const updateCalls = ddbMock.commandCalls(UpdateCommand);
      expect(updateCalls).toHaveLength(1);
      
      const input = updateCalls[0].args[0].input;
      expect(input.UpdateExpression).toContain('SET');
      
      // Verify quantity and updated_at are being set
      const values = input.ExpressionAttributeValues || {};
      const hasQuantity = Object.values(values).some((v: any) => v === 10);
      const hasTimestamp = Object.values(values).some((v: any) => typeof v === 'string' && v.includes('T'));
      expect(hasQuantity).toBe(true);
      expect(hasTimestamp).toBe(true);
    });
  });

  describe('removeItem', () => {
    it('should remove item from cart', async () => {
      ddbMock.on(DeleteCommand).resolves({});

      await repository.removeItem('cart-123', 'item-1');

      expect(ddbMock.commandCalls(DeleteCommand)).toHaveLength(1);
      const deleteCall = ddbMock.commandCalls(DeleteCommand)[0];
      expect(deleteCall.args[0].input).toMatchObject({
        Key: {
          PK: 'CART#cart-123',
          SK: 'ITEM#item-1',
        },
      });
    });
  });

  describe('clearCart', () => {
    it('should remove all items from cart using batch delete', async () => {
      const mockItems = [
        {
          PK: 'CART#cart-123',
          SK: 'ITEM#item-1',
          id: 'item-1',
          cart_id: 'cart-123',
          product_id: 1,
          quantity: 1,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
        {
          PK: 'CART#cart-123',
          SK: 'ITEM#item-2',
          id: 'item-2',
          cart_id: 'cart-123',
          product_id: 2,
          quantity: 2,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
      ];

      ddbMock.on(QueryCommand).resolves({
        Items: mockItems,
        Count: 2,
        ScannedCount: 2,
        ConsumedCapacity: {},
      });

      ddbMock.on(BatchWriteCommand).resolves({});

      await repository.clearCart('cart-123');

      expect(ddbMock.commandCalls(BatchWriteCommand)).toHaveLength(1);
    });

    it('should not perform batch delete if cart is empty', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [],
        Count: 0,
        ScannedCount: 0,
        ConsumedCapacity: {},
      });

      await repository.clearCart('empty-cart');

      expect(ddbMock.commandCalls(BatchWriteCommand)).toHaveLength(0);
    });
  });

  describe('findById', () => {
    it('should find item by cart ID and item ID', async () => {
      const mockItem = {
        PK: 'CART#cart-123',
        SK: 'ITEM#item-1',
        id: 'item-1',
        cart_id: 'cart-123',
        product_id: 100,
        quantity: 3,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      };

      ddbMock.on(GetCommand).resolves({
        Item: mockItem,
      });

      const item = await repository.findById('cart-123', 'item-1');

      expect(item).not.toBeNull();
      expect(item?.id).toBe('item-1');
      expect(item?.product_id).toBe(100);
    });

    it('should return null if item not found', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: undefined,
      });

      const item = await repository.findById('cart-123', 'non-existent');

      expect(item).toBeNull();
    });
  });

  describe('mergeItems', () => {
    it('should merge items from source to destination cart', async () => {
      const sourceItems = [
        {
          PK: 'CART#source-cart',
          SK: 'ITEM#item-1',
          id: 'item-1',
          cart_id: 'source-cart',
          product_id: 100,
          quantity: 2,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
        {
          PK: 'CART#source-cart',
          SK: 'ITEM#item-2',
          id: 'item-2',
          cart_id: 'source-cart',
          product_id: 200,
          quantity: 1,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
      ];

      const destItems = [
        {
          PK: 'CART#dest-cart',
          SK: 'ITEM#item-3',
          id: 'item-3',
          cart_id: 'dest-cart',
          product_id: 100,
          quantity: 3,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
      ];

      // Mock query calls in order:
      // 1. mergeItems: findByCartId(sourceCartId) - get source items
      // 2. mergeItems: findByCartId(destCartId) - get dest items
      // 3. addItem: findByCartId(destCartId) - check if item 200 exists (doesn't)
      // 4. clearCart: findByCartId(sourceCartId) - get source items to delete
      ddbMock.on(QueryCommand)
        .resolvesOnce({
          Items: sourceItems,
          Count: 2,
          ScannedCount: 2,
          ConsumedCapacity: {},
        })
        .resolvesOnce({
          Items: destItems,
          Count: 1,
          ScannedCount: 1,
          ConsumedCapacity: {},
        })
        .resolvesOnce({
          Items: destItems, // addItem checks existing items
          Count: 1,
          ScannedCount: 1,
          ConsumedCapacity: {},
        })
        .resolvesOnce({
          Items: sourceItems, // clearCart gets items to delete
          Count: 2,
          ScannedCount: 2,
          ConsumedCapacity: {},
        });

      ddbMock.on(UpdateCommand).resolves({
        Attributes: {
          ...destItems[0],
          quantity: 5,
        },
      });

      ddbMock.on(PutCommand).resolves({});
      ddbMock.on(BatchWriteCommand).resolves({});

      await repository.mergeItems('source-cart', 'dest-cart');

      // Should update existing item (product 100)
      const updateCalls = ddbMock.commandCalls(UpdateCommand);
      expect(updateCalls.length).toBeGreaterThan(0);

      // Should create new item (product 200)
      const putCalls = ddbMock.commandCalls(PutCommand);
      expect(putCalls.length).toBeGreaterThan(0);

      // Should clear source cart
      const batchCalls = ddbMock.commandCalls(BatchWriteCommand);
      expect(batchCalls).toHaveLength(1);
    });

    it('should sum quantities for matching items', async () => {
      const sourceItems = [
        {
          PK: 'CART#source-cart',
          SK: 'ITEM#item-1',
          id: 'item-1',
          cart_id: 'source-cart',
          product_id: 100,
          variant_id: 5,
          quantity: 2,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
      ];

      const destItems = [
        {
          PK: 'CART#dest-cart',
          SK: 'ITEM#item-2',
          id: 'item-2',
          cart_id: 'dest-cart',
          product_id: 100,
          variant_id: 5,
          quantity: 3,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
      ];

      ddbMock.on(QueryCommand)
        .resolvesOnce({
          Items: sourceItems,
          Count: 1,
          ScannedCount: 1,
        ConsumedCapacity: {},
        })
        .resolvesOnce({
          Items: destItems,
          Count: 1,
          ScannedCount: 1,
        ConsumedCapacity: {},
        })
        .resolvesOnce({
          Items: sourceItems,
          Count: 1,
          ScannedCount: 1,
        ConsumedCapacity: {},
        });

      ddbMock.on(UpdateCommand).resolves({
        Attributes: {
          ...destItems[0],
          quantity: 5,
        },
      });

      ddbMock.on(BatchWriteCommand).resolves({});

      await repository.mergeItems('source-cart', 'dest-cart');

      const updateCalls = ddbMock.commandCalls(UpdateCommand);
      expect(updateCalls).toHaveLength(1);
      
      const input = updateCalls[0].args[0].input;
      const values = input.ExpressionAttributeValues || {};
      // Check that quantity was set to 5 (3 + 2) - it will be in a generated key like :upd0
      const quantityValue = Object.values(values).find((v: any) => v === 5);
      expect(quantityValue).toBe(5);
    });

    it('should handle items with same product but different variants', async () => {
      const sourceItems = [
        {
          PK: 'CART#source-cart',
          SK: 'ITEM#item-1',
          id: 'item-1',
          cart_id: 'source-cart',
          product_id: 100,
          variant_id: 5,
          quantity: 2,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
      ];

      const destItems = [
        {
          PK: 'CART#dest-cart',
          SK: 'ITEM#item-2',
          id: 'item-2',
          cart_id: 'dest-cart',
          product_id: 100,
          variant_id: 6, // Different variant
          quantity: 3,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
      ];

      ddbMock.on(QueryCommand)
        .resolvesOnce({
          Items: sourceItems,
          Count: 1,
          ScannedCount: 1,
        ConsumedCapacity: {},
        })
        .resolvesOnce({
          Items: destItems,
          Count: 1,
          ScannedCount: 1,
        ConsumedCapacity: {},
        })
        .resolvesOnce({
          Items: [],
          Count: 0,
          ScannedCount: 0,
        ConsumedCapacity: {},
        })
        .resolvesOnce({
          Items: sourceItems,
          Count: 1,
          ScannedCount: 1,
        ConsumedCapacity: {},
        });

      ddbMock.on(PutCommand).resolves({});
      ddbMock.on(BatchWriteCommand).resolves({});

      await repository.mergeItems('source-cart', 'dest-cart');

      // Should create new item since variants don't match
      const putCalls = ddbMock.commandCalls(PutCommand);
      expect(putCalls.length).toBeGreaterThan(0);
    });
  });
});
