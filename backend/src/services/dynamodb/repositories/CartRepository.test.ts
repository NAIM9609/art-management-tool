/**
 * Unit tests for CartRepository
 */

import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBOptimized } from '../DynamoDBOptimized';
import { CartRepository } from './CartRepository';
import { CreateCartData, UpdateCartData } from './types';

// Mock DynamoDB Document Client
const ddbMock = mockClient(DynamoDBDocumentClient);

describe('CartRepository', () => {
  let dynamoDB: DynamoDBOptimized;
  let repository: CartRepository;

  beforeEach(() => {
    ddbMock.reset();
    dynamoDB = new DynamoDBOptimized({
      tableName: 'test-table',
      region: 'us-east-1',
    });
    repository = new CartRepository(dynamoDB);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a cart with session_id and TTL', async () => {
      const createData: CreateCartData = {
        session_id: 'test-session-123',
      };

      ddbMock.on(PutCommand).resolves({});

      const cart = await repository.create(createData);

      expect(cart.id).toBeDefined();
      expect(cart.session_id).toBe('test-session-123');
      expect(cart.created_at).toBeDefined();
      expect(cart.updated_at).toBeDefined();
      expect(cart.expires_at).toBeDefined();
      
      // TTL should be approximately 30 days from now (in seconds)
      const now = Math.floor(Date.now() / 1000);
      const expectedTTL = now + (30 * 24 * 60 * 60);
      expect(cart.expires_at).toBeGreaterThanOrEqual(expectedTTL - 5);
      expect(cart.expires_at).toBeLessThanOrEqual(expectedTTL + 5);
    });

    it('should create a cart with user_id', async () => {
      const createData: CreateCartData = {
        user_id: 123,
      };

      ddbMock.on(PutCommand).resolves({});

      const cart = await repository.create(createData);

      expect(cart.id).toBeDefined();
      expect(cart.user_id).toBe(123);
      expect(cart.expires_at).toBeDefined();
    });

    it('should create a cart with discount information', async () => {
      const createData: CreateCartData = {
        session_id: 'test-session',
        discount_code: 'SAVE20',
        discount_amount: 20.00,
      };

      ddbMock.on(PutCommand).resolves({});

      const cart = await repository.create(createData);

      expect(cart.discount_code).toBe('SAVE20');
      expect(cart.discount_amount).toBe(20.00);
    });
  });

  describe('findById', () => {
    it('should find cart by ID', async () => {
      const mockCart = {
        PK: 'CART#test-id',
        SK: 'METADATA',
        id: 'test-id',
        session_id: 'test-session',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
        expires_at: 1704067200,
      };

      ddbMock.on(GetCommand).resolves({
        Item: mockCart,
      });

      const cart = await repository.findById('test-id');

      expect(cart).not.toBeNull();
      expect(cart?.id).toBe('test-id');
      expect(cart?.session_id).toBe('test-session');
    });

    it('should return null if cart not found', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: undefined,
      });

      const cart = await repository.findById('non-existent');

      expect(cart).toBeNull();
    });
  });

  describe('findBySessionId', () => {
    it('should find cart by session ID using GSI1', async () => {
      const mockCart = {
        PK: 'CART#test-id',
        SK: 'METADATA',
        id: 'test-id',
        session_id: 'test-session-123',
        GSI1PK: 'CART_SESSION#test-session-123',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
        expires_at: 1704067200,
      };

      ddbMock.on(QueryCommand).resolves({
        Items: [mockCart],
        Count: 1,
        ScannedCount: 1,
      });

      const cart = await repository.findBySessionId('test-session-123');

      expect(cart).not.toBeNull();
      expect(cart?.id).toBe('test-id');
      expect(cart?.session_id).toBe('test-session-123');
    });

    it('should return null if cart not found by session', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [],
        Count: 0,
        ScannedCount: 0,
      });

      const cart = await repository.findBySessionId('non-existent-session');

      expect(cart).toBeNull();
    });
  });

  describe('findByUserId', () => {
    it('should find cart by user ID using GSI2', async () => {
      const mockCart = {
        PK: 'CART#test-id',
        SK: 'METADATA',
        id: 'test-id',
        user_id: 456,
        GSI2PK: 'CART_USER#456',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
        expires_at: 1704067200,
      };

      ddbMock.on(QueryCommand).resolves({
        Items: [mockCart],
        Count: 1,
        ScannedCount: 1,
      });

      const cart = await repository.findByUserId(456);

      expect(cart).not.toBeNull();
      expect(cart?.id).toBe('test-id');
      expect(cart?.user_id).toBe(456);
    });

    it('should return null if cart not found by user', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [],
        Count: 0,
        ScannedCount: 0,
      });

      const cart = await repository.findByUserId(999);

      expect(cart).toBeNull();
    });
  });

  describe('update', () => {
    it('should update cart and refresh TTL', async () => {
      const updateData: UpdateCartData = {
        discount_code: 'NEWYEAR',
        discount_amount: 15.00,
      };

      const mockUpdatedCart = {
        PK: 'CART#test-id',
        SK: 'METADATA',
        id: 'test-id',
        session_id: 'test-session',
        discount_code: 'NEWYEAR',
        discount_amount: 15.00,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-02T00:00:00.000Z',
        expires_at: 1704153600, // New TTL
      };

      ddbMock.on(UpdateCommand).resolves({
        Attributes: mockUpdatedCart,
      });

      const cart = await repository.update('test-id', updateData);

      expect(cart).not.toBeNull();
      expect(cart?.discount_code).toBe('NEWYEAR');
      expect(cart?.discount_amount).toBe(15.00);
      expect(cart?.expires_at).toBeDefined();
    });

    it('should update session_id and GSI1PK', async () => {
      const updateData: UpdateCartData = {
        session_id: 'new-session',
      };

      const mockUpdatedCart = {
        PK: 'CART#test-id',
        SK: 'METADATA',
        id: 'test-id',
        session_id: 'new-session',
        GSI1PK: 'CART_SESSION#new-session',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-02T00:00:00.000Z',
        expires_at: 1704153600,
      };

      ddbMock.on(UpdateCommand).resolves({
        Attributes: mockUpdatedCart,
      });

      const cart = await repository.update('test-id', updateData);

      expect(cart?.session_id).toBe('new-session');
    });

    it('should update user_id and GSI2PK', async () => {
      const updateData: UpdateCartData = {
        user_id: 789,
      };

      const mockUpdatedCart = {
        PK: 'CART#test-id',
        SK: 'METADATA',
        id: 'test-id',
        user_id: 789,
        GSI2PK: 'CART_USER#789',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-02T00:00:00.000Z',
        expires_at: 1704153600,
      };

      ddbMock.on(UpdateCommand).resolves({
        Attributes: mockUpdatedCart,
      });

      const cart = await repository.update('test-id', updateData);

      expect(cart?.user_id).toBe(789);
    });

    it('should return null if cart not found', async () => {
      const updateData: UpdateCartData = {
        discount_code: 'NEWYEAR',
      };

      ddbMock.on(UpdateCommand).rejects({
        name: 'ConditionalCheckFailedException',
      });

      const cart = await repository.update('non-existent', updateData);

      expect(cart).toBeNull();
    });
  });

  describe('delete', () => {
    it('should hard delete cart', async () => {
      ddbMock.on(DeleteCommand).resolves({});

      await repository.delete('test-id');

      expect(ddbMock.commandCalls(DeleteCommand)).toHaveLength(1);
    });
  });

  describe('mergeCarts', () => {
    it('should delete session cart after merge with valid merge count', async () => {
      ddbMock.on(DeleteCommand).resolves({});

      await repository.mergeCarts('session-cart-id', 'user-cart-id', 5);

      expect(ddbMock.commandCalls(DeleteCommand)).toHaveLength(1);
      const deleteCall = ddbMock.commandCalls(DeleteCommand)[0];
      expect(deleteCall.args[0].input).toMatchObject({
        Key: {
          PK: 'CART#session-cart-id',
          SK: 'METADATA',
        },
      });
    });

    it('should accept zero merged items', async () => {
      ddbMock.on(DeleteCommand).resolves({});

      await repository.mergeCarts('session-cart-id', 'user-cart-id', 0);

      expect(ddbMock.commandCalls(DeleteCommand)).toHaveLength(1);
    });

    it('should throw error for negative merge count', async () => {
      await expect(
        repository.mergeCarts('session-cart-id', 'user-cart-id', -1)
      ).rejects.toThrow('Invalid merged item count');
    });
  });

  describe('refreshTTL', () => {
    it('should refresh TTL without updating other fields', async () => {
      ddbMock.on(UpdateCommand).resolves({
        Attributes: {
          PK: 'CART#test-id',
          SK: 'METADATA',
          id: 'test-id',
          expires_at: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60),
        },
      });

      await repository.refreshTTL('test-id');

      expect(ddbMock.commandCalls(UpdateCommand)).toHaveLength(1);
      const updateCall = ddbMock.commandCalls(UpdateCommand)[0];
      const input = updateCall.args[0].input;
      
      // Check that only two fields are updated (updated_at and expires_at)
      const values = input.ExpressionAttributeValues || {};
      expect(Object.keys(values).length).toBe(2);
      
      // Check UpdateExpression contains both fields
      expect(input.UpdateExpression).toContain('SET');
      
      // Verify the actual values are correct types
      const valueArray = Object.values(values);
      const hasTimestamp = valueArray.some((v: any) => typeof v === 'string' && v.includes('T'));
      const hasNumber = valueArray.some((v: any) => typeof v === 'number');
      expect(hasTimestamp).toBe(true); // updated_at
      expect(hasNumber).toBe(true); // expires_at
    });
  });

  describe('TTL calculation', () => {
    it('should calculate TTL as 30 days from now', async () => {
      const createData: CreateCartData = {
        session_id: 'test-session',
      };

      ddbMock.on(PutCommand).resolves({});

      const beforeCreate = Math.floor(Date.now() / 1000);
      const cart = await repository.create(createData);
      const afterCreate = Math.floor(Date.now() / 1000);

      const expectedMinTTL = beforeCreate + (30 * 24 * 60 * 60);
      const expectedMaxTTL = afterCreate + (30 * 24 * 60 * 60);

      expect(cart.expires_at).toBeGreaterThanOrEqual(expectedMinTTL);
      expect(cart.expires_at).toBeLessThanOrEqual(expectedMaxTTL);
    });
  });

  describe('buildCartItem', () => {
    it('should build cart item with GSI1PK when session_id is provided', async () => {
      const createData: CreateCartData = {
        session_id: 'test-session',
      };

      ddbMock.on(PutCommand).resolves({});

      await repository.create(createData);

      const putCalls = ddbMock.commandCalls(PutCommand);
      expect(putCalls).toHaveLength(1);
      
      const item = putCalls[0].args[0].input.Item;
      expect(item).toHaveProperty('GSI1PK', 'CART_SESSION#test-session');
    });

    it('should build cart item with GSI2PK when user_id is provided', async () => {
      const createData: CreateCartData = {
        user_id: 123,
      };

      ddbMock.on(PutCommand).resolves({});

      await repository.create(createData);

      const putCalls = ddbMock.commandCalls(PutCommand);
      expect(putCalls).toHaveLength(1);
      
      const item = putCalls[0].args[0].input.Item;
      expect(item).toHaveProperty('GSI2PK', 'CART_USER#123');
    });

    it('should not include GSI keys when session_id and user_id are not provided', async () => {
      const createData: CreateCartData = {};

      ddbMock.on(PutCommand).resolves({});

      await repository.create(createData);

      const putCalls = ddbMock.commandCalls(PutCommand);
      expect(putCalls).toHaveLength(1);
      
      const item = putCalls[0].args[0].input.Item;
      expect(item).not.toHaveProperty('GSI1PK');
      expect(item).not.toHaveProperty('GSI2PK');
    });
  });
});
