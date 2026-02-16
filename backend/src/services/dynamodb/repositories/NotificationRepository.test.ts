/**
 * Unit tests for NotificationRepository
 */

import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBOptimized } from '../DynamoDBOptimized';
import { NotificationRepository } from './NotificationRepository';
import { NotificationType, CreateNotificationData } from './types';

// Mock DynamoDB Document Client
const ddbMock = mockClient(DynamoDBDocumentClient);

describe('NotificationRepository', () => {
  let dynamoDB: DynamoDBOptimized;
  let repository: NotificationRepository;

  beforeEach(() => {
    ddbMock.reset();
    dynamoDB = new DynamoDBOptimized({
      tableName: 'test-table',
      region: 'us-east-1',
    });
    repository = new NotificationRepository(dynamoDB);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new notification with TTL set to 90 days', async () => {
      const createData: CreateNotificationData = {
        type: NotificationType.ORDER_CREATED,
        title: 'New Order',
        message: 'Order #123 has been created',
        metadata: { orderId: 123 },
      };

      let putItem: any;
      ddbMock.on(PutCommand).callsFake((input) => {
        putItem = input.Item;
        return {};
      });

      const notification = await repository.create(createData);

      expect(notification.id).toBeDefined();
      expect(notification.type).toBe(NotificationType.ORDER_CREATED);
      expect(notification.title).toBe('New Order');
      expect(notification.message).toBe('Order #123 has been created');
      expect(notification.metadata).toEqual({ orderId: 123 });
      expect(notification.is_read).toBe(false);
      expect(notification.created_at).toBeDefined();
      expect(notification.updated_at).toBeDefined();
      expect(notification.expires_at).toBeDefined();

      // Verify DynamoDB structure
      expect(putItem.PK).toBe(`NOTIFICATION#${notification.id}`);
      expect(putItem.SK).toBe('METADATA');
      expect(putItem.GSI1PK).toBe('NOTIFICATION_READ#false');
      expect(putItem.GSI1SK).toBe(notification.created_at);

      // Verify TTL is approximately 90 days from now
      const now = Math.floor(Date.now() / 1000);
      const expectedTTL = now + (90 * 24 * 60 * 60);
      expect(putItem.expires_at).toBeGreaterThan(now);
      expect(putItem.expires_at).toBeLessThanOrEqual(expectedTTL + 10); // Allow 10s variance
    });

    it('should create a notification without optional fields', async () => {
      const createData: CreateNotificationData = {
        type: NotificationType.SYSTEM,
        title: 'System Notification',
      };

      ddbMock.on(PutCommand).resolves({});

      const notification = await repository.create(createData);

      expect(notification.id).toBeDefined();
      expect(notification.type).toBe(NotificationType.SYSTEM);
      expect(notification.title).toBe('System Notification');
      expect(notification.message).toBeUndefined();
      expect(notification.metadata).toBeUndefined();
      expect(notification.is_read).toBe(false);
    });
  });

  describe('findById', () => {
    it('should find notification by ID with strongly consistent read', async () => {
      const mockItem = {
        PK: 'NOTIFICATION#test-id-123',
        SK: 'METADATA',
        id: 'test-id-123',
        type: NotificationType.ORDER_CREATED,
        title: 'Test Notification',
        message: 'Test message',
        is_read: false,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
        expires_at: 1234567890,
      };

      ddbMock.on(GetCommand).resolves({ Item: mockItem });

      const notification = await repository.findById('test-id-123');

      expect(notification).not.toBeNull();
      expect(notification?.id).toBe('test-id-123');
      expect(notification?.title).toBe('Test Notification');
      expect(notification?.type).toBe(NotificationType.ORDER_CREATED);
    });

    it('should return null if notification does not exist', async () => {
      ddbMock.on(GetCommand).resolves({ Item: undefined });

      const notification = await repository.findById('non-existent-id');

      expect(notification).toBeNull();
    });
  });

  describe('update', () => {
    it('should update notification fields', async () => {
      const mockUpdatedItem = {
        id: 'test-id-123',
        type: NotificationType.ORDER_CREATED,
        title: 'Updated Title',
        message: 'Updated message',
        metadata: { updated: true },
        is_read: false,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-02T00:00:00.000Z',
        expires_at: 1234567890,
      };

      ddbMock.on(UpdateCommand).resolves({
        Attributes: mockUpdatedItem,
      });

      const result = await repository.update('test-id-123', {
        title: 'Updated Title',
        message: 'Updated message',
        metadata: { updated: true },
      });

      expect(result).not.toBeNull();
      expect(result?.title).toBe('Updated Title');
      expect(result?.message).toBe('Updated message');
      expect(result?.metadata).toEqual({ updated: true });
    });

    it('should return null if notification does not exist', async () => {
      ddbMock.on(UpdateCommand).rejects({
        name: 'ConditionalCheckFailedException',
        message: 'The conditional request failed',
      });

      const result = await repository.update('non-existent-id', {
        title: 'Updated Title',
      });

      expect(result).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should find all unread notifications using GSI1', async () => {
      const mockItems = [
        {
          id: '1',
          type: NotificationType.ORDER_CREATED,
          title: 'Order 1',
          is_read: false,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
          expires_at: 1234567890,
          GSI1PK: 'NOTIFICATION_READ#false',
          GSI1SK: '2024-01-01T00:00:00.000Z',
        },
        {
          id: '2',
          type: NotificationType.ORDER_PAID,
          title: 'Order 2',
          is_read: false,
          created_at: '2024-01-02T00:00:00.000Z',
          updated_at: '2024-01-02T00:00:00.000Z',
          expires_at: 1234567890,
          GSI1PK: 'NOTIFICATION_READ#false',
          GSI1SK: '2024-01-02T00:00:00.000Z',
        },
      ];

      ddbMock.on(QueryCommand).resolves({
        Items: mockItems,
        Count: 2,
      });

      const result = await repository.findAll({ is_read: false });

      expect(result.items).toHaveLength(2);
      expect(result.items[0].id).toBe('1');
      expect(result.items[1].id).toBe('2');
      expect(result.count).toBe(2);
    });

    it('should find all read notifications using GSI1', async () => {
      const mockItems = [
        {
          id: '3',
          type: NotificationType.LOW_STOCK,
          title: 'Low Stock',
          is_read: true,
          read_at: '2024-01-03T00:00:00.000Z',
          created_at: '2024-01-03T00:00:00.000Z',
          updated_at: '2024-01-03T00:00:00.000Z',
          expires_at: 1234567890,
          GSI1PK: 'NOTIFICATION_READ#true',
          GSI1SK: '2024-01-03T00:00:00.000Z',
        },
      ];

      ddbMock.on(QueryCommand).resolves({
        Items: mockItems,
        Count: 1,
      });

      const result = await repository.findAll({ is_read: true });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].is_read).toBe(true);
      expect(result.items[0].read_at).toBeDefined();
    });

    it('should support pagination', async () => {
      const mockItems = [
        {
          id: '1',
          type: NotificationType.SYSTEM,
          title: 'Notification 1',
          is_read: false,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
          expires_at: 1234567890,
        },
      ];

      const lastKey = { PK: 'NOTIFICATION#1', SK: 'METADATA' };

      ddbMock.on(QueryCommand).resolves({
        Items: mockItems,
        Count: 1,
        LastEvaluatedKey: lastKey,
      });

      const result = await repository.findAll({ is_read: false }, { limit: 1 });

      expect(result.items).toHaveLength(1);
      expect(result.lastEvaluatedKey).toEqual(lastKey);
    });

    it('should find all notifications when no filter is provided', async () => {
      const mockUnreadItems = [
        {
          id: '1',
          type: NotificationType.ORDER_CREATED,
          title: 'Order 1',
          is_read: false,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
          expires_at: 1234567890,
        },
      ];

      const mockReadItems = [
        {
          id: '2',
          type: NotificationType.ORDER_PAID,
          title: 'Order 2',
          is_read: true,
          created_at: '2024-01-02T00:00:00.000Z',
          updated_at: '2024-01-02T00:00:00.000Z',
          expires_at: 1234567890,
        },
      ];

      // Mock will be called twice - once for unread, once for read
      ddbMock.on(QueryCommand)
        .resolvesOnce({
          Items: mockUnreadItems,
          Count: 1,
        })
        .resolvesOnce({
          Items: mockReadItems,
          Count: 1,
        });

      const result = await repository.findAll();

      expect(result.items).toHaveLength(2);
      expect(result.count).toBe(2);
      // Verify sorting by created_at descending (newest first)
      expect(result.items[0].id).toBe('2'); // 2024-01-02
      expect(result.items[1].id).toBe('1'); // 2024-01-01
    });
  });

  describe('markAsRead', () => {
    it('should mark a notification as read and update GSI1PK', async () => {
      const notificationId = 'test-id-123';
      const mockUpdatedItem = {
        id: notificationId,
        type: NotificationType.ORDER_CREATED,
        title: 'Test Notification',
        is_read: true,
        read_at: '2024-01-01T12:00:00.000Z',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T12:00:00.000Z',
        expires_at: 1234567890,
        GSI1PK: 'NOTIFICATION_READ#true',
      };

      ddbMock.on(UpdateCommand).resolves({
        Attributes: mockUpdatedItem,
      });

      const result = await repository.markAsRead(notificationId);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(notificationId);
      expect(result?.is_read).toBe(true);
      expect(result?.read_at).toBeDefined();
    });

    it('should return null if notification does not exist', async () => {
      const notificationId = 'non-existent-id';

      ddbMock.on(UpdateCommand).rejects({
        name: 'ConditionalCheckFailedException',
        message: 'The conditional request failed',
      });

      const result = await repository.markAsRead(notificationId);

      expect(result).toBeNull();
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all unread notifications as read', async () => {
      const mockUnreadItems = [
        { id: '1' },
        { id: '2' },
        { id: '3' },
      ];

      // Mock query to return unread notifications
      ddbMock.on(QueryCommand).resolves({
        Items: mockUnreadItems,
        Count: 3,
      });

      // Mock update commands
      ddbMock.on(UpdateCommand).resolves({});

      await repository.markAllAsRead();

      // Verify update was called for each item
      const updateCalls = ddbMock.commandCalls(UpdateCommand);
      expect(updateCalls.length).toBe(3);

      // Verify each update has correct parameters
      updateCalls.forEach((call, index) => {
        expect(call.args[0].input.Key).toEqual({
          PK: `NOTIFICATION#${mockUnreadItems[index].id}`,
          SK: 'METADATA',
        });
      });
    });

    it('should handle pagination when marking all as read', async () => {
      const firstBatch = [{ id: '1' }, { id: '2' }];
      const secondBatch = [{ id: '3' }];

      // Reset mock to ensure clean state
      ddbMock.reset();
      
      // First query call returns first batch with LastEvaluatedKey
      ddbMock.on(QueryCommand).resolvesOnce({
        Items: firstBatch,
        Count: 2,
        LastEvaluatedKey: { PK: 'NOTIFICATION#2', SK: 'METADATA' },
      })
      // Second query call returns second batch without LastEvaluatedKey
      .resolvesOnce({
        Items: secondBatch,
        Count: 1,
      });

      ddbMock.on(UpdateCommand).resolves({});

      await repository.markAllAsRead();

      // Verify update was called for all items across batches
      const updateCalls = ddbMock.commandCalls(UpdateCommand);
      expect(updateCalls.length).toBe(3);
    });

    it('should handle empty result when no unread notifications exist', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [],
        Count: 0,
      });

      await repository.markAllAsRead();

      // Verify no update commands were called
      const updateCalls = ddbMock.commandCalls(UpdateCommand);
      expect(updateCalls.length).toBe(0);
    });
  });

  describe('delete', () => {
    it('should hard delete a notification', async () => {
      const notificationId = 'test-id-123';

      ddbMock.on(DeleteCommand).resolves({});

      await repository.delete(notificationId);

      // Verify delete was called with correct key
      const deleteCalls = ddbMock.commandCalls(DeleteCommand);
      expect(deleteCalls.length).toBe(1);
      expect(deleteCalls[0].args[0].input.Key).toEqual({
        PK: `NOTIFICATION#${notificationId}`,
        SK: 'METADATA',
      });
    });
  });
});
