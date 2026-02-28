/**
 * Unit tests for AuditLogRepository
 */

import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBOptimized } from '../DynamoDBOptimized';
import { AuditLogRepository } from './AuditLogRepository';
import { CreateAuditLogData } from './types';

// Mock DynamoDB Document Client
const ddbMock = mockClient(DynamoDBDocumentClient);

describe('AuditLogRepository', () => {
  let dynamoDB: DynamoDBOptimized;
  let repository: AuditLogRepository;

  beforeEach(() => {
    ddbMock.reset();
    dynamoDB = new DynamoDBOptimized({
      tableName: 'test-table',
      region: 'us-east-1',
    });
    repository = new AuditLogRepository(dynamoDB);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new audit log entry with correct structure', async () => {
      const createData: CreateAuditLogData = {
        entity_type: 'Product',
        entity_id: '123',
        user_id: 'user-456',
        action: 'CREATE',
        changes: { title: 'New Product' },
        metadata: { ip: '192.168.1.1' },
      };

      let capturedItem: any;
      ddbMock.on(PutCommand).callsFake((input) => {
        capturedItem = input.Item;
        return {};
      });

      const auditLog = await repository.create(createData);

      expect(auditLog.id).toBeDefined();
      expect(auditLog.entity_type).toBe('Product');
      expect(auditLog.entity_id).toBe('123');
      expect(auditLog.user_id).toBe('user-456');
      expect(auditLog.action).toBe('CREATE');
      expect(auditLog.changes).toEqual({ title: 'New Product' });
      expect(auditLog.metadata).toEqual({ ip: '192.168.1.1' });
      expect(auditLog.created_at).toBeDefined();
      expect(auditLog.expires_at).toBeDefined();

      // Verify DynamoDB item structure
      expect(capturedItem.PK).toMatch(/^AUDIT#\d{4}-\d{2}-\d{2}#/);
      expect(capturedItem.SK).toBe('METADATA');
      expect(capturedItem.GSI1PK).toBe('AUDIT_ENTITY#Product#123');
      expect(capturedItem.GSI1SK).toBe(auditLog.created_at);
      expect(capturedItem.GSI2PK).toBe('AUDIT_USER#user-456');
      expect(capturedItem.GSI2SK).toBe(auditLog.created_at);
    });

    it('should set TTL to 365 days from created_at', async () => {
      const createData: CreateAuditLogData = {
        entity_type: 'Product',
        entity_id: '123',
        user_id: 'user-456',
        action: 'UPDATE',
      };

      let capturedItem: any;
      ddbMock.on(PutCommand).callsFake((input) => {
        capturedItem = input.Item;
        return {};
      });

      const auditLog = await repository.create(createData);

      // Verify TTL is approximately 365 days in the future
      const createdAtMs = new Date(auditLog.created_at).getTime();
      const expectedExpiresAtMs = createdAtMs + 365 * 24 * 60 * 60 * 1000;
      const expectedExpiresAtSec = Math.floor(expectedExpiresAtMs / 1000);

      expect(auditLog.expires_at).toBe(expectedExpiresAtSec);
      expect(capturedItem.expires_at).toBe(expectedExpiresAtSec);
    });

    it('should create audit log without optional fields', async () => {
      const createData: CreateAuditLogData = {
        entity_type: 'Product',
        entity_id: '123',
        user_id: 'user-456',
        action: 'DELETE',
      };

      ddbMock.on(PutCommand).resolves({});

      const auditLog = await repository.create(createData);

      expect(auditLog.changes).toBeUndefined();
      expect(auditLog.metadata).toBeUndefined();
    });

    it('should use date-based partitioning in PK', async () => {
      const createData: CreateAuditLogData = {
        entity_type: 'Product',
        entity_id: '123',
        user_id: 'user-456',
        action: 'CREATE',
      };

      let capturedItem: any;
      ddbMock.on(PutCommand).callsFake((input) => {
        capturedItem = input.Item;
        return {};
      });

      const auditLog = await repository.create(createData);

      const date = auditLog.created_at.split('T')[0];
      expect(capturedItem.PK).toBe(`AUDIT#${date}#${auditLog.id}`);
    });
  });

  describe('batchCreate', () => {
    it('should batch create multiple audit log entries', async () => {
      const entries: CreateAuditLogData[] = [
        {
          entity_type: 'Product',
          entity_id: '123',
          user_id: 'user-456',
          action: 'CREATE',
        },
        {
          entity_type: 'Product',
          entity_id: '456',
          user_id: 'user-789',
          action: 'UPDATE',
          changes: { price: 100 },
        },
        {
          entity_type: 'Order',
          entity_id: '789',
          user_id: 'user-456',
          action: 'DELETE',
        },
      ];

      let capturedItems: any[] = [];
      ddbMock.on(BatchWriteCommand).callsFake((input) => {
        const items = input.RequestItems!['test-table'];
        capturedItems = items.map((req: any) => req.PutRequest.Item);
        return {};
      });

      const auditLogs = await repository.batchCreate(entries);

      expect(auditLogs).toHaveLength(3);
      expect(auditLogs[0].entity_type).toBe('Product');
      expect(auditLogs[1].entity_id).toBe('456');
      expect(auditLogs[2].action).toBe('DELETE');

      // Verify all items were batched
      expect(capturedItems).toHaveLength(3);
      expect(capturedItems[0].PK).toMatch(/^AUDIT#\d{4}-\d{2}-\d{2}#/);
      expect(capturedItems[1].GSI1PK).toBe('AUDIT_ENTITY#Product#456');
      expect(capturedItems[2].GSI2PK).toBe('AUDIT_USER#user-456');
    });

    it('should return empty array when no entries provided', async () => {
      const auditLogs = await repository.batchCreate([]);
      expect(auditLogs).toEqual([]);
    });

    it('should set same created_at for all entries in batch', async () => {
      const entries: CreateAuditLogData[] = [
        {
          entity_type: 'Product',
          entity_id: '123',
          user_id: 'user-456',
          action: 'CREATE',
        },
        {
          entity_type: 'Product',
          entity_id: '456',
          user_id: 'user-789',
          action: 'UPDATE',
        },
      ];

      ddbMock.on(BatchWriteCommand).resolves({});

      const auditLogs = await repository.batchCreate(entries);

      expect(auditLogs[0].created_at).toBe(auditLogs[1].created_at);
    });
  });

  describe('findByEntity', () => {
    it('should find audit logs for a specific entity using GSI1', async () => {
      const mockItems = [
        {
          PK: 'AUDIT#2024-01-01#uuid1',
          SK: 'METADATA',
          id: 'uuid1',
          entity_type: 'Product',
          entity_id: '123',
          user_id: 'user-456',
          action: 'CREATE',
          created_at: '2024-01-01T10:00:00.000Z',
          expires_at: 1735728000,
          GSI1PK: 'AUDIT_ENTITY#Product#123',
          GSI1SK: '2024-01-01T10:00:00.000Z',
        },
        {
          PK: 'AUDIT#2024-01-01#uuid2',
          SK: 'METADATA',
          id: 'uuid2',
          entity_type: 'Product',
          entity_id: '123',
          user_id: 'user-789',
          action: 'UPDATE',
          created_at: '2024-01-01T11:00:00.000Z',
          expires_at: 1735731600,
          GSI1PK: 'AUDIT_ENTITY#Product#123',
          GSI1SK: '2024-01-01T11:00:00.000Z',
        },
      ];

      ddbMock.on(QueryCommand).resolves({
        Items: mockItems,
        Count: 2,
      });

      const result = await repository.findByEntity('Product', '123');

      expect(result.items).toHaveLength(2);
      expect(result.items[0].entity_type).toBe('Product');
      expect(result.items[0].entity_id).toBe('123');
      expect(result.items[1].action).toBe('UPDATE');
      expect(result.count).toBe(2);
    });

    it('should support pagination', async () => {
      const mockItems = [
        {
          id: 'uuid1',
          entity_type: 'Product',
          entity_id: '123',
          user_id: 'user-456',
          action: 'CREATE',
          created_at: '2024-01-01T10:00:00.000Z',
          expires_at: 1735728000,
        },
      ];

      ddbMock.on(QueryCommand).resolves({
        Items: mockItems,
        Count: 1,
        LastEvaluatedKey: { PK: 'AUDIT#2024-01-01#uuid1', SK: 'METADATA' },
      });

      const result = await repository.findByEntity('Product', '123', {
        limit: 1,
      });

      expect(result.items).toHaveLength(1);
      expect(result.lastEvaluatedKey).toBeDefined();
    });

    it('should query with correct GSI1PK', async () => {
      ddbMock.on(QueryCommand).callsFake((input) => {
        expect(input.IndexName).toBe('GSI1');
        expect(input.KeyConditionExpression).toBe('GSI1PK = :gsi1pk');
        expect(input.ExpressionAttributeValues![':gsi1pk']).toBe('AUDIT_ENTITY#Product#123');
        expect(input.ScanIndexForward).toBe(false); // Newest first
        return { Items: [], Count: 0 };
      });

      await repository.findByEntity('Product', '123');
    });
  });

  describe('findByUser', () => {
    it('should find audit logs for a specific user using GSI2', async () => {
      const mockItems = [
        {
          PK: 'AUDIT#2024-01-01#uuid1',
          SK: 'METADATA',
          id: 'uuid1',
          entity_type: 'Product',
          entity_id: '123',
          user_id: 'user-456',
          action: 'CREATE',
          created_at: '2024-01-01T10:00:00.000Z',
          expires_at: 1735728000,
          GSI2PK: 'AUDIT_USER#user-456',
          GSI2SK: '2024-01-01T10:00:00.000Z',
        },
        {
          PK: 'AUDIT#2024-01-01#uuid2',
          SK: 'METADATA',
          id: 'uuid2',
          entity_type: 'Order',
          entity_id: '789',
          user_id: 'user-456',
          action: 'UPDATE',
          created_at: '2024-01-01T11:00:00.000Z',
          expires_at: 1735731600,
          GSI2PK: 'AUDIT_USER#user-456',
          GSI2SK: '2024-01-01T11:00:00.000Z',
        },
      ];

      ddbMock.on(QueryCommand).resolves({
        Items: mockItems,
        Count: 2,
      });

      const result = await repository.findByUser('user-456');

      expect(result.items).toHaveLength(2);
      expect(result.items[0].user_id).toBe('user-456');
      expect(result.items[1].user_id).toBe('user-456');
      expect(result.count).toBe(2);
    });

    it('should query with correct GSI2PK', async () => {
      ddbMock.on(QueryCommand).callsFake((input) => {
        expect(input.IndexName).toBe('GSI2');
        expect(input.KeyConditionExpression).toBe('GSI2PK = :gsi2pk');
        expect(input.ExpressionAttributeValues![':gsi2pk']).toBe('AUDIT_USER#user-456');
        expect(input.ScanIndexForward).toBe(false); // Newest first
        return { Items: [], Count: 0 };
      });

      await repository.findByUser('user-456');
    });
  });

  describe('findByDateRange', () => {
    it('should find audit logs within a date range', async () => {
      const mockItems2024_01_01 = [
        {
          PK: 'AUDIT#2024-01-01#uuid1',
          SK: 'METADATA',
          id: 'uuid1',
          entity_type: 'Product',
          entity_id: '123',
          user_id: 'user-456',
          action: 'CREATE',
          created_at: '2024-01-01T10:00:00.000Z',
          expires_at: 1735728000,
        },
      ];

      const mockItems2024_01_02 = [
        {
          PK: 'AUDIT#2024-01-02#uuid2',
          SK: 'METADATA',
          id: 'uuid2',
          entity_type: 'Product',
          entity_id: '456',
          user_id: 'user-789',
          action: 'UPDATE',
          created_at: '2024-01-02T10:00:00.000Z',
          expires_at: 1735814400,
        },
      ];

      ddbMock.on(QueryCommand)
        .resolvesOnce({ Items: mockItems2024_01_01, Count: 1 })
        .resolvesOnce({ Items: mockItems2024_01_02, Count: 1 });

      const result = await repository.findByDateRange(
        '2024-01-01T00:00:00.000Z',
        '2024-01-02T23:59:59.999Z'
      );

      expect(result.items).toHaveLength(2);
      expect(result.items[0].created_at).toBe('2024-01-02T10:00:00.000Z'); // Newest first
      expect(result.items[1].created_at).toBe('2024-01-01T10:00:00.000Z');
      expect(result.count).toBe(2);
    });

    it('should query each date partition separately', async () => {
      let queryCount = 0;
      ddbMock.on(QueryCommand).callsFake((input) => {
        queryCount++;
        expect(input.KeyConditionExpression).toBe('begins_with(PK, :pk)');
        if (queryCount === 1) {
          expect(input.ExpressionAttributeValues![':pk']).toBe('AUDIT#2024-01-01');
        } else if (queryCount === 2) {
          expect(input.ExpressionAttributeValues![':pk']).toBe('AUDIT#2024-01-02');
        } else if (queryCount === 3) {
          expect(input.ExpressionAttributeValues![':pk']).toBe('AUDIT#2024-01-03');
        }
        return { Items: [], Count: 0 };
      });

      await repository.findByDateRange(
        '2024-01-01T00:00:00.000Z',
        '2024-01-03T23:59:59.999Z'
      );

      expect(queryCount).toBe(3); // Should query 3 date partitions
    });

    it('should filter logs to exact date range', async () => {
      const mockItems = [
        {
          id: 'uuid1',
          entity_type: 'Product',
          entity_id: '123',
          user_id: 'user-456',
          action: 'CREATE',
          created_at: '2024-01-01T09:00:00.000Z', // Before range
          expires_at: 1735724400,
        },
        {
          id: 'uuid2',
          entity_type: 'Product',
          entity_id: '456',
          user_id: 'user-789',
          action: 'UPDATE',
          created_at: '2024-01-01T11:00:00.000Z', // Within range
          expires_at: 1735731600,
        },
        {
          id: 'uuid3',
          entity_type: 'Product',
          entity_id: '789',
          user_id: 'user-456',
          action: 'DELETE',
          created_at: '2024-01-01T23:00:00.000Z', // After range
          expires_at: 1735772800,
        },
      ];

      ddbMock.on(QueryCommand).resolves({
        Items: mockItems,
        Count: 3,
      });

      const result = await repository.findByDateRange(
        '2024-01-01T10:00:00.000Z',
        '2024-01-01T22:00:00.000Z'
      );

      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('uuid2');
    });

    it('should return empty result for no matches', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [],
        Count: 0,
      });

      const result = await repository.findByDateRange(
        '2024-01-01T00:00:00.000Z',
        '2024-01-01T23:59:59.999Z'
      );

      expect(result.items).toEqual([]);
      expect(result.count).toBe(0);
    });

    it('should throw error for date range exceeding maximum', async () => {
      await expect(
        repository.findByDateRange(
          '2024-01-01T00:00:00.000Z',
          '2024-06-01T00:00:00.000Z' // 152 days, exceeds 90 day limit
        )
      ).rejects.toThrow('Date range exceeds maximum allowed');
    });

    it('should throw error for invalid start date', async () => {
      await expect(
        repository.findByDateRange(
          'invalid-date',
          '2024-01-31T00:00:00.000Z'
        )
      ).rejects.toThrow('Invalid startDate');
    });

    it('should throw error for invalid end date', async () => {
      await expect(
        repository.findByDateRange(
          '2024-01-01T00:00:00.000Z',
          'invalid-date'
        )
      ).rejects.toThrow('Invalid endDate');
    });

    it('should throw error when start date is after end date', async () => {
      await expect(
        repository.findByDateRange(
          '2024-01-31T00:00:00.000Z',
          '2024-01-01T00:00:00.000Z'
        )
      ).rejects.toThrow('startDate must be less than or equal to endDate');
    });

    it('should support pagination', async () => {
      const mockItems = Array.from({ length: 150 }, (_, i) => ({
        id: `uuid${i}`,
        entity_type: 'Product',
        entity_id: '123',
        user_id: 'user-456',
        action: 'CREATE',
        created_at: `2024-01-01T${String(i % 24).padStart(2, '0')}:00:00.000Z`,
        expires_at: 1735728000,
      }));

      ddbMock.on(QueryCommand).resolves({
        Items: mockItems,
        Count: 150,
      });

      const result = await repository.findByDateRange(
        '2024-01-01T00:00:00.000Z',
        '2024-01-01T23:59:59.999Z',
        { limit: 50 }
      );

      expect(result.items.length).toBe(50);
      expect(result.lastEvaluatedKey).toBeDefined();
      expect(result.lastEvaluatedKey?.startIndex).toBe(50);
    });
  });

  describe('date validation and formatting', () => {
    it('should validate date format in buildAuditLogItem', async () => {
      const createData: CreateAuditLogData = {
        entity_type: 'Product',
        entity_id: '123',
        user_id: 'user-456',
        action: 'CREATE',
      };

      ddbMock.on(PutCommand).resolves({});

      const auditLog = await repository.create(createData);
      
      // Should create successfully with valid ISO format
      expect(auditLog.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('calculateTTL', () => {
    it('should throw error for invalid date', () => {
      expect(() => {
        // Access private method through any type cast for testing
        (repository as any).calculateTTL('invalid-date');
      }).toThrow('Invalid createdAt date for TTL calculation');
    });

    it('should calculate valid TTL for valid date', () => {
      const createdAt = '2024-01-01T00:00:00.000Z';
      const ttl = (repository as any).calculateTTL(createdAt);

      const createdAtMs = new Date(createdAt).getTime();
      const expectedExpiresAtMs = createdAtMs + 365 * 24 * 60 * 60 * 1000;
      const expectedExpiresAtSec = Math.floor(expectedExpiresAtMs / 1000);

      expect(ttl).toBe(expectedExpiresAtSec);
      expect(Number.isFinite(ttl)).toBe(true);
    });
  });
});
