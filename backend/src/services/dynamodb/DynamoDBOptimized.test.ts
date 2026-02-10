/**
 * Unit tests for DynamoDBOptimized
 */

import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, QueryCommand, GetCommand, PutCommand, UpdateCommand, DeleteCommand, BatchGetCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBOptimized } from './DynamoDBOptimized';
import {
  QueryEventuallyConsistentParams,
  BatchGetParams,
  BatchWriteParams,
  CreateGSIAttributesParams,
  BuildProjectionParams,
  UpdateParams,
  SoftDeleteParams,
  GetParams,
  PutParams,
  DeleteParams,
} from './types';

// Mock DynamoDB Document Client
const ddbMock = mockClient(DynamoDBDocumentClient);

describe('DynamoDBOptimized', () => {
  let dynamoDB: DynamoDBOptimized;

  beforeEach(() => {
    ddbMock.reset();
    dynamoDB = new DynamoDBOptimized({
      tableName: 'test-table',
      region: 'us-east-1',
      maxRetries: 3,
      retryDelay: 10,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('queryEventuallyConsistent', () => {
    it('should query with eventually consistent reads', async () => {
      const mockItems = [
        { id: '1', name: 'Item 1' },
        { id: '2', name: 'Item 2' },
      ];

      ddbMock.on(QueryCommand).resolves({
        Items: mockItems,
        Count: 2,
        ScannedCount: 2,
        ConsumedCapacity: {
          TableName: 'test-table',
          CapacityUnits: 1.0,
          ReadCapacityUnits: 1.0,
        },
      });

      const params: QueryEventuallyConsistentParams = {
        keyConditionExpression: 'pk = :pk',
        expressionAttributeValues: { ':pk': 'test' },
      };

      const result = await dynamoDB.queryEventuallyConsistent(params);

      expect(result.data).toEqual(mockItems);
      expect(result.count).toBe(2);
      expect(result.scannedCount).toBe(2);
      expect(result.consumedCapacity).toBeDefined();
      expect(result.consumedCapacity?.capacityUnits).toBe(1.0);
    });

    it('should handle pagination with lastEvaluatedKey', async () => {
      const mockLastKey = { id: '2' };

      ddbMock.on(QueryCommand).resolves({
        Items: [{ id: '1', name: 'Item 1' }],
        Count: 1,
        ScannedCount: 1,
        LastEvaluatedKey: mockLastKey,
        ConsumedCapacity: {
          TableName: 'test-table',
          CapacityUnits: 0.5,
        },
      });

      const params: QueryEventuallyConsistentParams = {
        keyConditionExpression: 'pk = :pk',
        expressionAttributeValues: { ':pk': 'test' },
        limit: 1,
      };

      const result = await dynamoDB.queryEventuallyConsistent(params);

      expect(result.lastEvaluatedKey).toEqual(mockLastKey);
    });

    it('should include projection expression and filter', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [{ id: '1', name: 'Item 1' }],
        Count: 1,
        ScannedCount: 2,
        ConsumedCapacity: {
          TableName: 'test-table',
          CapacityUnits: 0.5,
        },
      });

      const params: QueryEventuallyConsistentParams = {
        keyConditionExpression: 'pk = :pk',
        expressionAttributeValues: { ':pk': 'test', ':status': 'active' },
        filterExpression: 'status = :status',
        projectionExpression: 'id, name',
      };

      const result = await dynamoDB.queryEventuallyConsistent(params);

      expect(result.data).toHaveLength(1);
      expect(result.scannedCount).toBe(2);
    });
  });

  describe('batchGetOptimized', () => {
    it('should batch get items', async () => {
      const mockItems = [
        { id: '1', name: 'Item 1' },
        { id: '2', name: 'Item 2' },
      ];

      ddbMock.on(BatchGetCommand).resolves({
        Responses: {
          'test-table': mockItems,
        },
        ConsumedCapacity: [{
          TableName: 'test-table',
          CapacityUnits: 2.0,
          ReadCapacityUnits: 2.0,
        }],
      });

      const params: BatchGetParams = {
        keys: [{ id: '1' }, { id: '2' }],
      };

      const result = await dynamoDB.batchGetOptimized(params);

      expect(result.data).toEqual(mockItems);
      expect(result.consumedCapacity?.capacityUnits).toBe(2.0);
    });

    it('should split large batches (>100 items)', async () => {
      const keys = Array.from({ length: 150 }, (_, i) => ({ id: `${i}` }));
      const mockItems = keys.map(k => ({ ...k, name: `Item ${k.id}` }));

      // Reset mock to clear previous calls
      ddbMock.reset();

      // Mock will be called twice - once for each batch
      let callCount = 0;
      ddbMock.on(BatchGetCommand).callsFake(() => {
        callCount++;
        if (callCount === 1) {
          // First batch (items 0-99)
          return {
            Responses: {
              'test-table': mockItems.slice(0, 100),
            },
            ConsumedCapacity: [{
              TableName: 'test-table',
              CapacityUnits: 50.0,
            }],
          };
        } else {
          // Second batch (items 100-149)
          return {
            Responses: {
              'test-table': mockItems.slice(100, 150),
            },
            ConsumedCapacity: [{
              TableName: 'test-table',
              CapacityUnits: 25.0,
            }],
          };
        }
      });

      const params: BatchGetParams = { keys };

      const result = await dynamoDB.batchGetOptimized(params);

      expect(result.data).toHaveLength(150);
      expect(result.consumedCapacity?.capacityUnits).toBe(75.0);
    });

    it('should handle unprocessed keys', async () => {
      const unprocessedKey = { id: '3' };

      ddbMock.on(BatchGetCommand).resolves({
        Responses: {
          'test-table': [{ id: '1', name: 'Item 1' }],
        },
        UnprocessedKeys: {
          'test-table': {
            Keys: [unprocessedKey],
          },
        },
        ConsumedCapacity: [{
          TableName: 'test-table',
          CapacityUnits: 1.0,
        }],
      });

      const params: BatchGetParams = {
        keys: [{ id: '1' }, { id: '3' }],
      };

      const result = await dynamoDB.batchGetOptimized(params);

      expect(result.unprocessedKeys).toEqual([unprocessedKey]);
    });
  });

  describe('batchWriteOptimized', () => {
    it('should batch write items', async () => {
      ddbMock.on(BatchWriteCommand).resolves({
        ConsumedCapacity: [{
          TableName: 'test-table',
          CapacityUnits: 2.0,
          WriteCapacityUnits: 2.0,
        }],
      });

      const params: BatchWriteParams = {
        items: [
          { type: 'put', item: { id: '1', name: 'Item 1' } },
          { type: 'delete', key: { id: '2' } },
        ],
      };

      const result = await dynamoDB.batchWriteOptimized(params);

      expect(result.consumedCapacity?.capacityUnits).toBe(2.0);
    });

    it('should split large batches (>25 items)', async () => {
      const items = Array.from({ length: 30 }, (_, i) => ({
        type: 'put' as const,
        item: { id: `${i}`, name: `Item ${i}` },
      }));

      // Reset mock to clear previous calls
      ddbMock.reset();

      // Mock will be called twice - once for each batch
      let callCount = 0;
      ddbMock.on(BatchWriteCommand).callsFake(() => {
        callCount++;
        if (callCount === 1) {
          // First batch (25 items)
          return {
            ConsumedCapacity: [{
              TableName: 'test-table',
              CapacityUnits: 25.0,
            }],
          };
        } else {
          // Second batch (5 items)
          return {
            ConsumedCapacity: [{
              TableName: 'test-table',
              CapacityUnits: 5.0,
            }],
          };
        }
      });

      const params: BatchWriteParams = { items };

      const result = await dynamoDB.batchWriteOptimized(params);

      expect(result.consumedCapacity?.capacityUnits).toBe(30.0);
    });

    it('should handle unprocessed items', async () => {
      ddbMock.on(BatchWriteCommand).resolves({
        UnprocessedItems: {
          'test-table': [
            { PutRequest: { Item: { id: '3', name: 'Item 3' } } },
          ],
        },
        ConsumedCapacity: [{
          TableName: 'test-table',
          CapacityUnits: 1.0,
        }],
      });

      const params: BatchWriteParams = {
        items: [
          { type: 'put', item: { id: '1', name: 'Item 1' } },
          { type: 'put', item: { id: '3', name: 'Item 3' } },
        ],
      };

      const result = await dynamoDB.batchWriteOptimized(params);

      expect(result.unprocessedItems).toHaveLength(1);
      expect(result.unprocessedItems?.[0].type).toBe('put');
    });
  });

  describe('createGSIAttributesConditionally', () => {
    it('should add GSI attributes when condition is met', () => {
      const item = {
        id: '1',
        status: 'active',
        category: 'electronics',
      };

      const params: CreateGSIAttributesParams = {
        item,
        gsiConfig: [
          {
            gsiName: 'status-index',
            partitionKey: 'gsi_status',
            sortKey: 'gsi_category',
            condition: (item) => item.status === 'active',
            partitionKeyValue: (item) => item.status,
            sortKeyValue: (item) => item.category,
          },
        ],
      };

      const result = dynamoDB.createGSIAttributesConditionally(params);

      expect(result.gsi_status).toBe('active');
      expect(result.gsi_category).toBe('electronics');
    });

    it('should add GSI partition key without sort key', () => {
      const item = {
        id: '1',
        featured: true,
      };

      const params: CreateGSIAttributesParams = {
        item,
        gsiConfig: [
          {
            gsiName: 'featured-index',
            partitionKey: 'gsi_featured',
            condition: (item) => item.featured === true,
            partitionKeyValue: () => 'yes',
          },
        ],
      };

      const result = dynamoDB.createGSIAttributesConditionally(params);

      expect(result.gsi_featured).toBe('yes');
    });

    it('should not add GSI attributes when condition is not met', () => {
      const item = {
        id: '1',
        status: 'inactive',
        category: 'electronics',
      };

      const params: CreateGSIAttributesParams = {
        item,
        gsiConfig: [
          {
            gsiName: 'status-index',
            partitionKey: 'gsi_status',
            condition: (item) => item.status === 'active',
            partitionKeyValue: (item) => item.status,
          },
        ],
      };

      const result = dynamoDB.createGSIAttributesConditionally(params);

      expect(result.gsi_status).toBeUndefined();
    });

    it('should handle multiple GSI configs', () => {
      const item = {
        id: '1',
        status: 'active',
        featured: true,
      };

      const params: CreateGSIAttributesParams = {
        item,
        gsiConfig: [
          {
            gsiName: 'status-index',
            partitionKey: 'gsi_status',
            condition: (item) => item.status === 'active',
            partitionKeyValue: (item) => item.status,
          },
          {
            gsiName: 'featured-index',
            partitionKey: 'gsi_featured',
            condition: (item) => item.featured === true,
            partitionKeyValue: () => 'featured',
          },
        ],
      };

      const result = dynamoDB.createGSIAttributesConditionally(params);

      expect(result.gsi_status).toBe('active');
      expect(result.gsi_featured).toBe('featured');
    });
  });

  describe('buildProjectionExpression', () => {
    it('should build projection expression', () => {
      const params: BuildProjectionParams = {
        attributes: ['id', 'name', 'email'],
      };

      const result = dynamoDB.buildProjectionExpression(params);

      expect(result.projectionExpression).toBe('#attr0, #attr1, #attr2');
      expect(result.expressionAttributeNames).toEqual({
        '#attr0': 'id',
        '#attr1': 'name',
        '#attr2': 'email',
      });
    });

    it('should handle single attribute', () => {
      const params: BuildProjectionParams = {
        attributes: ['id'],
      };

      const result = dynamoDB.buildProjectionExpression(params);

      expect(result.projectionExpression).toBe('#attr0');
      expect(result.expressionAttributeNames).toEqual({
        '#attr0': 'id',
      });
    });
  });

  describe('update', () => {
    it('should update item', async () => {
      const updatedItem = { id: '1', name: 'Updated Item', status: 'active' };

      ddbMock.on(UpdateCommand).resolves({
        Attributes: updatedItem,
        ConsumedCapacity: {
          TableName: 'test-table',
          CapacityUnits: 1.0,
          WriteCapacityUnits: 1.0,
        },
      });

      const params: UpdateParams = {
        key: { id: '1' },
        updates: { name: 'Updated Item', status: 'active' },
      };

      const result = await dynamoDB.update(params);

      expect(result.data).toEqual(updatedItem);
      expect(result.consumedCapacity?.capacityUnits).toBe(1.0);
    });

    it('should support condition expressions', async () => {
      ddbMock.on(UpdateCommand).resolves({
        Attributes: { id: '1', name: 'Updated' },
        ConsumedCapacity: {
          TableName: 'test-table',
          CapacityUnits: 1.0,
        },
      });

      const params: UpdateParams = {
        key: { id: '1' },
        updates: { name: 'Updated' },
        conditionExpression: 'attribute_exists(id)',
      };

      const result = await dynamoDB.update(params);

      expect(result.data).toBeDefined();
    });
  });

  describe('softDelete', () => {
    it('should soft delete item with default fields', async () => {
      const deletedItem = {
        id: '1',
        name: 'Item 1',
        deletedAt: expect.any(String),
      };

      ddbMock.on(UpdateCommand).resolves({
        Attributes: deletedItem,
        ConsumedCapacity: {
          TableName: 'test-table',
          CapacityUnits: 1.0,
        },
      });

      const params: SoftDeleteParams = {
        key: { id: '1' },
      };

      const result = await dynamoDB.softDelete(params);

      expect(result.data).toBeDefined();
      expect(result.data.deletedAt).toBeDefined();
    });

    it('should soft delete with custom fields and deletedBy', async () => {
      ddbMock.on(UpdateCommand).resolves({
        Attributes: {
          id: '1',
          removed: expect.any(String),
          removedBy: 'admin',
        },
        ConsumedCapacity: {
          TableName: 'test-table',
          CapacityUnits: 1.0,
        },
      });

      const params: SoftDeleteParams = {
        key: { id: '1' },
        deletedAtField: 'removed',
        deletedByField: 'removedBy',
        deletedBy: 'admin',
      };

      const result = await dynamoDB.softDelete(params);

      expect(result.data.removed).toBeDefined();
      expect(result.data.removedBy).toBe('admin');
    });
  });

  describe('get', () => {
    it('should get item', async () => {
      const mockItem = { id: '1', name: 'Item 1' };

      ddbMock.on(GetCommand).resolves({
        Item: mockItem,
        ConsumedCapacity: {
          TableName: 'test-table',
          CapacityUnits: 0.5,
          ReadCapacityUnits: 0.5,
        },
      });

      const params: GetParams = {
        key: { id: '1' },
      };

      const result = await dynamoDB.get(params);

      expect(result.data).toEqual(mockItem);
      expect(result.consumedCapacity?.capacityUnits).toBe(0.5);
    });

    it('should return null for non-existent item', async () => {
      ddbMock.on(GetCommand).resolves({
        ConsumedCapacity: {
          TableName: 'test-table',
          CapacityUnits: 0.5,
        },
      });

      const params: GetParams = {
        key: { id: 'non-existent' },
      };

      const result = await dynamoDB.get(params);

      expect(result.data).toBeNull();
    });

    it('should support projection expression', async () => {
      const mockItem = { id: '1', name: 'Item 1' };

      ddbMock.on(GetCommand).resolves({
        Item: mockItem,
        ConsumedCapacity: {
          TableName: 'test-table',
          CapacityUnits: 0.5,
        },
      });

      const params: GetParams = {
        key: { id: '1' },
        projectionExpression: 'id, name',
      };

      const result = await dynamoDB.get(params);

      expect(result.data).toEqual(mockItem);
    });
  });

  describe('put', () => {
    it('should put item', async () => {
      ddbMock.on(PutCommand).resolves({
        ConsumedCapacity: {
          TableName: 'test-table',
          CapacityUnits: 1.0,
          WriteCapacityUnits: 1.0,
        },
      });

      const params: PutParams = {
        item: { id: '1', name: 'Item 1' },
      };

      const result = await dynamoDB.put(params);

      expect(result.consumedCapacity?.capacityUnits).toBe(1.0);
    });

    it('should return old attributes when requested', async () => {
      const oldItem = { id: '1', name: 'Old Item' };

      ddbMock.on(PutCommand).resolves({
        Attributes: oldItem,
        ConsumedCapacity: {
          TableName: 'test-table',
          CapacityUnits: 1.0,
        },
      });

      const params: PutParams = {
        item: { id: '1', name: 'New Item' },
        returnValues: 'ALL_OLD',
      };

      const result = await dynamoDB.put(params);

      expect(result.data).toEqual(oldItem);
    });

    it('should support condition expressions', async () => {
      ddbMock.on(PutCommand).resolves({
        ConsumedCapacity: {
          TableName: 'test-table',
          CapacityUnits: 1.0,
        },
      });

      const params: PutParams = {
        item: { id: '1', name: 'Item 1' },
        conditionExpression: 'attribute_not_exists(id)',
      };

      const result = await dynamoDB.put(params);

      expect(result.consumedCapacity).toBeDefined();
    });
  });

  describe('delete', () => {
    it('should delete item', async () => {
      ddbMock.on(DeleteCommand).resolves({
        ConsumedCapacity: {
          TableName: 'test-table',
          CapacityUnits: 1.0,
          WriteCapacityUnits: 1.0,
        },
      });

      const params: DeleteParams = {
        key: { id: '1' },
      };

      const result = await dynamoDB.delete(params);

      expect(result.consumedCapacity?.capacityUnits).toBe(1.0);
    });

    it('should return old attributes when requested', async () => {
      const deletedItem = { id: '1', name: 'Deleted Item' };

      ddbMock.on(DeleteCommand).resolves({
        Attributes: deletedItem,
        ConsumedCapacity: {
          TableName: 'test-table',
          CapacityUnits: 1.0,
        },
      });

      const params: DeleteParams = {
        key: { id: '1' },
        returnValues: 'ALL_OLD',
      };

      const result = await dynamoDB.delete(params);

      expect(result.data).toEqual(deletedItem);
    });

    it('should support condition expressions', async () => {
      ddbMock.on(DeleteCommand).resolves({
        ConsumedCapacity: {
          TableName: 'test-table',
          CapacityUnits: 1.0,
        },
      });

      const params: DeleteParams = {
        key: { id: '1' },
        conditionExpression: 'attribute_exists(id)',
      };

      const result = await dynamoDB.delete(params);

      expect(result.consumedCapacity).toBeDefined();
    });
  });

  describe('Error handling and retries', () => {
    it('should retry on throttling errors', async () => {
      const throttleError = new Error('Throttling');
      throttleError.name = 'ThrottlingException';

      const mockItem = { id: '1', name: 'Item 1' };

      // Fail twice, then succeed
      ddbMock.on(GetCommand)
        .rejectsOnce(throttleError)
        .rejectsOnce(throttleError)
        .resolvesOnce({
          Item: mockItem,
          ConsumedCapacity: {
            TableName: 'test-table',
            CapacityUnits: 0.5,
          },
        });

      const params: GetParams = {
        key: { id: '1' },
      };

      const result = await dynamoDB.get(params);

      expect(result.data).toEqual(mockItem);
    });

    it('should fail after max retries', async () => {
      const throttleError = new Error('Throttling');
      throttleError.name = 'ThrottlingException';

      ddbMock.on(GetCommand).rejects(throttleError);

      const params: GetParams = {
        key: { id: '1' },
      };

      await expect(dynamoDB.get(params)).rejects.toThrow();
    });

    it('should not retry on non-retryable errors', async () => {
      const validationError = new Error('Validation error');
      validationError.name = 'ValidationException';

      ddbMock.on(GetCommand).rejects(validationError);

      const params: GetParams = {
        key: { id: '1' },
      };

      await expect(dynamoDB.get(params)).rejects.toThrow();
    });

    it('should handle errors with metadata', async () => {
      const awsError: any = new Error('AWS Error');
      awsError.name = 'AccessDeniedException';
      awsError.$metadata = {
        httpStatusCode: 403,
      };

      ddbMock.on(GetCommand).rejects(awsError);

      const params: GetParams = {
        key: { id: '1' },
      };

      try {
        await dynamoDB.get(params);
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.name).toBe('AccessDeniedException');
        expect(error.statusCode).toBe(403);
      }
    });
  });

  describe('Additional edge cases', () => {
    it('should handle empty batch get results', async () => {
      ddbMock.on(BatchGetCommand).resolves({
        ConsumedCapacity: [{
          TableName: 'test-table',
          CapacityUnits: 0,
        }],
      });

      const params: BatchGetParams = {
        keys: [{ id: '1' }],
      };

      const result = await dynamoDB.batchGetOptimized(params);

      expect(result.data).toEqual([]);
    });

    it('should handle query with index name', async () => {
      const mockItems = [{ id: '1', status: 'active' }];

      ddbMock.on(QueryCommand).resolves({
        Items: mockItems,
        Count: 1,
        ScannedCount: 1,
        ConsumedCapacity: {
          TableName: 'test-table',
          CapacityUnits: 0.5,
        },
      });

      const params: QueryEventuallyConsistentParams = {
        indexName: 'status-index',
        keyConditionExpression: 'status = :status',
        expressionAttributeValues: { ':status': 'active' },
      };

      const result = await dynamoDB.queryEventuallyConsistent(params);

      expect(result.data).toEqual(mockItems);
    });

    it('should handle missing consumed capacity in responses', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: { id: '1', name: 'Test' },
      });

      const params: GetParams = {
        key: { id: '1' },
      };

      const result = await dynamoDB.get(params);

      expect(result.data).toEqual({ id: '1', name: 'Test' });
      expect(result.consumedCapacity).toBeUndefined();
    });
  });
});
