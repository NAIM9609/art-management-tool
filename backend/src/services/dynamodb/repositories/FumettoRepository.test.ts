/**
 * Unit tests for FumettoRepository
 */

import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, UpdateCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBOptimized } from '../DynamoDBOptimized';
import { FumettoRepository } from './FumettoRepository';
import { CreateFumettoData, UpdateFumettoData } from './types';

// Mock DynamoDB Document Client
const ddbMock = mockClient(DynamoDBDocumentClient);

describe('FumettoRepository', () => {
  let dynamoDB: DynamoDBOptimized;
  let repository: FumettoRepository;

  beforeEach(() => {
    ddbMock.reset();
    dynamoDB = new DynamoDBOptimized({
      tableName: 'test-table',
      region: 'us-east-1',
    });
    repository = new FumettoRepository(dynamoDB);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new fumetto with auto-increment ID and order', async () => {
      const createData: CreateFumettoData = {
        title: 'Test Comic',
        description: 'A test comic description',
        coverImage: 'fumetti/cover1.jpg',
        pages: ['fumetti/page1.jpg', 'fumetti/page2.jpg'],
      };

      // Mock getNextId (counter increment)
      ddbMock.on(UpdateCommand).resolvesOnce({
        Attributes: { value: 1 },
      });

      // Mock getNextOrder (query for max order)
      ddbMock.on(QueryCommand).resolvesOnce({
        Items: [{ order: 2 }], // Highest order
        ConsumedCapacity: { CapacityUnits: 0.5 },
      });

      ddbMock.on(PutCommand).resolves({});

      const fumetto = await repository.create(createData);

      expect(fumetto.id).toBe(1);
      expect(fumetto.title).toBe('Test Comic');
      expect(fumetto.description).toBe('A test comic description');
      expect(fumetto.coverImage).toBe('fumetti/cover1.jpg');
      expect(fumetto.pages).toEqual(['fumetti/page1.jpg', 'fumetti/page2.jpg']);
      expect(fumetto.order).toBe(3); // Next order after existing
      expect(fumetto.created_at).toBeDefined();
      expect(fumetto.updated_at).toBeDefined();
    });

    it('should create fumetto with order 0 when no existing fumetti', async () => {
      const createData: CreateFumettoData = {
        title: 'First Comic',
      };

      // Mock getNextId
      ddbMock.on(UpdateCommand).resolvesOnce({
        Attributes: { value: 1 },
      });

      // Mock getNextOrder (no existing fumetti)
      ddbMock.on(QueryCommand).resolvesOnce({
        Items: [],
        ConsumedCapacity: { CapacityUnits: 0.5 },
      });

      ddbMock.on(PutCommand).resolves({});

      const fumetto = await repository.create(createData);

      expect(fumetto.order).toBe(0);
    });

    it('should create fumetto with specified order', async () => {
      const createData: CreateFumettoData = {
        title: 'Custom Order Comic',
        order: 5,
      };

      // Mock getNextId
      ddbMock.on(UpdateCommand).resolvesOnce({
        Attributes: { value: 1 },
      });

      ddbMock.on(PutCommand).resolves({});

      const fumetto = await repository.create(createData);

      expect(fumetto.order).toBe(5);
    });

    it('should handle empty pages array', async () => {
      const createData: CreateFumettoData = {
        title: 'No Pages Comic',
        pages: [],
      };

      // Mock getNextId
      ddbMock.on(UpdateCommand).resolvesOnce({
        Attributes: { value: 1 },
      });

      // Mock getNextOrder
      ddbMock.on(QueryCommand).resolvesOnce({
        Items: [],
        ConsumedCapacity: { CapacityUnits: 0.5 },
      });

      ddbMock.on(PutCommand).resolves({});

      const fumetto = await repository.create(createData);

      expect(fumetto.pages).toEqual([]);
    });
  });

  describe('findById', () => {
    it('should find fumetto by ID', async () => {
      const mockFumetto = {
        PK: 'FUMETTO#1',
        SK: 'METADATA',
        id: 1,
        title: 'Test Comic',
        description: 'Description',
        coverImage: 'cover.jpg',
        pages: ['page1.jpg', 'page2.jpg'],
        order: 0,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      };

      ddbMock.on(GetCommand).resolves({
        Item: mockFumetto,
      });

      const fumetto = await repository.findById(1);

      expect(fumetto).not.toBeNull();
      expect(fumetto?.id).toBe(1);
      expect(fumetto?.title).toBe('Test Comic');
      expect(fumetto?.pages).toEqual(['page1.jpg', 'page2.jpg']);
    });

    it('should return null when fumetto not found', async () => {
      ddbMock.on(GetCommand).resolves({});

      const fumetto = await repository.findById(999);

      expect(fumetto).toBeNull();
    });

    it('should handle fumetto without pages', async () => {
      const mockFumetto = {
        PK: 'FUMETTO#1',
        SK: 'METADATA',
        id: 1,
        title: 'Test Comic',
        order: 0,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      };

      ddbMock.on(GetCommand).resolves({
        Item: mockFumetto,
      });

      const fumetto = await repository.findById(1);

      expect(fumetto?.pages).toEqual([]);
    });
  });

  describe('findAll', () => {
    it('should find all fumetti sorted by order', async () => {
      const mockFumetti = [
        {
          id: 1,
          title: 'Comic 1',
          order: 0,
          pages: ['page1.jpg'],
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 2,
          title: 'Comic 2',
          order: 1,
          pages: [],
          created_at: '2024-01-02T00:00:00.000Z',
          updated_at: '2024-01-02T00:00:00.000Z',
        },
      ];

      ddbMock.on(QueryCommand).resolves({
        Items: mockFumetti,
        Count: 2,
      });

      const result = await repository.findAll();

      expect(result.items).toHaveLength(2);
      expect(result.items[0].id).toBe(1);
      expect(result.items[0].order).toBe(0);
      expect(result.items[1].id).toBe(2);
      expect(result.items[1].order).toBe(1);
      expect(result.count).toBe(2);
    });

    it('should exclude soft-deleted fumetti', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [],
        Count: 0,
      });

      const result = await repository.findAll();

      expect(result.items).toHaveLength(0);

      // Verify filter expression is applied
      const calls = ddbMock.commandCalls(QueryCommand);
      expect(calls[0].args[0].input.FilterExpression).toContain('attribute_not_exists(deleted_at)');
    });

    it('should support pagination', async () => {
      const mockFumetti = [
        {
          id: 1,
          title: 'Comic 1',
          order: 0,
          pages: [],
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
      ];

      ddbMock.on(QueryCommand).resolves({
        Items: mockFumetti,
        Count: 1,
        LastEvaluatedKey: { PK: 'FUMETTO#1', SK: 'METADATA' },
      });

      const result = await repository.findAll({ limit: 1 });

      expect(result.items).toHaveLength(1);
      expect(result.lastEvaluatedKey).toBeDefined();
    });
  });

  describe('update', () => {
    it('should update fumetto fields', async () => {
      const updateData: UpdateFumettoData = {
        title: 'Updated Comic',
        description: 'Updated description',
        pages: ['new-page1.jpg', 'new-page2.jpg', 'new-page3.jpg'],
      };

      ddbMock.on(UpdateCommand).resolves({
        Attributes: {
          id: 1,
          title: 'Updated Comic',
          description: 'Updated description',
          pages: ['new-page1.jpg', 'new-page2.jpg', 'new-page3.jpg'],
          order: 0,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-02T00:00:00.000Z',
        },
      });

      const fumetto = await repository.update(1, updateData);

      expect(fumetto).not.toBeNull();
      expect(fumetto?.title).toBe('Updated Comic');
      expect(fumetto?.description).toBe('Updated description');
      expect(fumetto?.pages).toHaveLength(3);
    });

    it('should update order and GSI attributes', async () => {
      const updateData: UpdateFumettoData = {
        order: 5,
      };

      ddbMock.on(UpdateCommand).resolves({
        Attributes: {
          id: 1,
          title: 'Comic',
          order: 5,
          pages: [],
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-02T00:00:00.000Z',
        },
      });

      const fumetto = await repository.update(1, updateData);

      expect(fumetto?.order).toBe(5);

      // Verify update was called with correct key
      const updateCalls = ddbMock.commandCalls(UpdateCommand);
      expect(updateCalls.length).toBeGreaterThan(0);
      const updateInput = updateCalls[0].args[0].input;
      expect(updateInput.Key).toEqual({
        PK: 'FUMETTO#1',
        SK: 'METADATA',
      });
      // Verify the expression attribute values contain the order value
      const values = updateInput.ExpressionAttributeValues || {};
      expect(Object.values(values)).toContain(5);
      expect(Object.values(values)).toContain('FUMETTO_ORDER#0000000005');
      expect(Object.values(values)).toContain('FUMETTO#1');
    });

    it('should update pages array correctly', async () => {
      const updateData: UpdateFumettoData = {
        pages: ['page1.jpg', 'page2.jpg'],
      };

      ddbMock.on(UpdateCommand).resolves({
        Attributes: {
          id: 1,
          title: 'Comic',
          pages: ['page1.jpg', 'page2.jpg'],
          order: 0,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-02T00:00:00.000Z',
        },
      });

      const fumetto = await repository.update(1, updateData);

      expect(fumetto?.pages).toEqual(['page1.jpg', 'page2.jpg']);
    });

    it('should return null when fumetto not found', async () => {
      ddbMock.on(UpdateCommand).rejects({
        name: 'ConditionalCheckFailedException',
      });

      const fumetto = await repository.update(999, { title: 'Test' });

      expect(fumetto).toBeNull();
    });
  });

  describe('softDelete', () => {
    it('should soft delete fumetto', async () => {
      ddbMock.on(UpdateCommand).resolves({
        Attributes: {
          id: 1,
          title: 'Comic',
          order: 0,
          pages: [],
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-02T00:00:00.000Z',
          deleted_at: '2024-01-02T00:00:00.000Z',
        },
      });

      const fumetto = await repository.softDelete(1);

      expect(fumetto).not.toBeNull();
      expect(fumetto?.deleted_at).toBeDefined();

      const calls = ddbMock.commandCalls(UpdateCommand);
      expect(calls.length).toBeGreaterThan(0);
      const updateInput = calls[0].args[0].input;
      
      // Verify the key is correct
      expect(updateInput.Key).toEqual({
        PK: 'FUMETTO#1',
        SK: 'METADATA',
      });
    });

    it('should return null when fumetto not found', async () => {
      ddbMock.on(UpdateCommand).rejects({
        name: 'ConditionalCheckFailedException',
      });

      const fumetto = await repository.softDelete(999);

      expect(fumetto).toBeNull();
    });
  });

  describe('restore', () => {
    it('should restore soft-deleted fumetto', async () => {
      // Mock findById to return a deleted fumetto
      ddbMock.on(GetCommand).resolvesOnce({
        Item: {
          id: 1,
          title: 'Restored Comic',
          order: 0,
          pages: [],
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-02T00:00:00.000Z',
          deleted_at: '2024-01-02T00:00:00.000Z',
        },
      });

      ddbMock.on(UpdateCommand).resolves({
        Attributes: {
          id: 1,
          title: 'Restored Comic',
          order: 0,
          pages: [],
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-02T00:00:00.000Z',
        },
      });

      const fumetto = await repository.restore(1);

      expect(fumetto).not.toBeNull();
      expect(fumetto?.deleted_at).toBeUndefined();

      // Verify UpdateExpression contains REMOVE deleted_at
      const updateCalls = ddbMock.commandCalls(UpdateCommand);
      const updateInput = updateCalls[0].args[0].input;
      expect(updateInput.UpdateExpression).toContain('REMOVE deleted_at');
      expect(updateInput.ConditionExpression).toContain('attribute_exists(deleted_at)');
    });

    it('should return null when fumetto not found', async () => {
      ddbMock.on(GetCommand).resolves({});

      const fumetto = await repository.restore(999);

      expect(fumetto).toBeNull();
    });

    it('should return null when fumetto is not deleted', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: {
          id: 1,
          title: 'Comic',
          order: 0,
          pages: [],
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
      });

      const fumetto = await repository.restore(1);

      expect(fumetto).toBeNull();
    });

    it('should return null on ConditionalCheckFailedException', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: {
          id: 1,
          title: 'Comic',
          order: 0,
          pages: [],
          deleted_at: '2024-01-02T00:00:00.000Z',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-02T00:00:00.000Z',
        },
      });

      ddbMock.on(UpdateCommand).rejects({
        name: 'ConditionalCheckFailedException',
      });

      const fumetto = await repository.restore(1);

      expect(fumetto).toBeNull();
    });
  });

  describe('reorder', () => {
    it('should reorder fumetti atomically', async () => {
      // Mock findById for each fumetto (only once per fumetto now)
      ddbMock.on(GetCommand).resolvesOnce({
        Item: {
          id: 3,
          title: 'Comic 3',
          order: 2,
          pages: [],
          created_at: '2024-01-03T00:00:00.000Z',
          updated_at: '2024-01-03T00:00:00.000Z',
        },
      }).resolvesOnce({
        Item: {
          id: 1,
          title: 'Comic 1',
          order: 0,
          pages: [],
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
      }).resolvesOnce({
        Item: {
          id: 2,
          title: 'Comic 2',
          order: 1,
          pages: [],
          created_at: '2024-01-02T00:00:00.000Z',
          updated_at: '2024-01-02T00:00:00.000Z',
        },
      });

      ddbMock.on(TransactWriteCommand).resolves({});

      const reordered = await repository.reorder([3, 1, 2]);

      expect(reordered).toHaveLength(3);
      expect(reordered[0].id).toBe(3);
      expect(reordered[0].order).toBe(0);
      expect(reordered[1].id).toBe(1);
      expect(reordered[1].order).toBe(1);
      expect(reordered[2].id).toBe(2);
      expect(reordered[2].order).toBe(2);
    });

    it('should throw error when fumetto not found during reorder', async () => {
      ddbMock.on(GetCommand).resolves({});

      await expect(repository.reorder([1, 999])).rejects.toThrow(
        'Fumetto 1 not found'
      );
    });

    it('should throw error when reordering more than 25 fumetti', async () => {
      const manyIds = Array.from({ length: 26 }, (_, i) => i + 1);

      await expect(repository.reorder(manyIds)).rejects.toThrow(
        'Reorder supports up to 25 fumetti at a time'
      );
    });

    it('should return empty array when no fumetti to reorder', async () => {
      const reordered = await repository.reorder([]);

      expect(reordered).toHaveLength(0);
    });

    it('should skip fumetti that already have correct order', async () => {
      // Mock fumetti that are already in correct order
      ddbMock.on(GetCommand).resolvesOnce({
        Item: {
          id: 1,
          title: 'Comic 1',
          order: 0,
          pages: [],
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
      }).resolvesOnce({
        Item: {
          id: 2,
          title: 'Comic 2',
          order: 1,
          pages: [],
          created_at: '2024-01-02T00:00:00.000Z',
          updated_at: '2024-01-02T00:00:00.000Z',
        },
      })
      // Return same after reorder
      .resolvesOnce({
        Item: {
          id: 1,
          title: 'Comic 1',
          order: 0,
          pages: [],
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
      }).resolvesOnce({
        Item: {
          id: 2,
          title: 'Comic 2',
          order: 1,
          pages: [],
          created_at: '2024-01-02T00:00:00.000Z',
          updated_at: '2024-01-02T00:00:00.000Z',
        },
      });

      const reordered = await repository.reorder([1, 2]);

      expect(reordered).toHaveLength(2);

      // Verify no transaction was executed since order didn't change
      const transactCalls = ddbMock.commandCalls(TransactWriteCommand);
      expect(transactCalls).toHaveLength(0);
    });
  });

  describe('JSON field handling', () => {
    it('should correctly store and retrieve pages array', async () => {
      const pages = [
        'fumetti/comic1/page1.jpg',
        'fumetti/comic1/page2.jpg',
        'fumetti/comic1/page3.jpg',
      ];

      const createData: CreateFumettoData = {
        title: 'Multi-page Comic',
        pages,
      };

      // Mock getNextId
      ddbMock.on(UpdateCommand).resolvesOnce({
        Attributes: { value: 1 },
      });

      // Mock getNextOrder
      ddbMock.on(QueryCommand).resolvesOnce({
        Items: [],
        ConsumedCapacity: { CapacityUnits: 0.5 },
      });

      ddbMock.on(PutCommand).resolves({});

      const fumetto = await repository.create(createData);

      expect(fumetto.pages).toEqual(pages);
      expect(Array.isArray(fumetto.pages)).toBe(true);
    });

    it('should handle empty pages array', async () => {
      const createData: CreateFumettoData = {
        title: 'Empty Pages Comic',
        pages: [],
      };

      // Mock getNextId
      ddbMock.on(UpdateCommand).resolvesOnce({
        Attributes: { value: 1 },
      });

      // Mock getNextOrder
      ddbMock.on(QueryCommand).resolvesOnce({
        Items: [],
        ConsumedCapacity: { CapacityUnits: 0.5 },
      });

      ddbMock.on(PutCommand).resolves({});

      const fumetto = await repository.create(createData);

      expect(fumetto.pages).toEqual([]);
      expect(Array.isArray(fumetto.pages)).toBe(true);
    });

    it('should update pages array correctly', async () => {
      const newPages = ['page1.jpg', 'page2.jpg', 'page3.jpg', 'page4.jpg'];
      const updateData: UpdateFumettoData = {
        pages: newPages,
      };

      ddbMock.on(UpdateCommand).resolves({
        Attributes: {
          id: 1,
          title: 'Comic',
          pages: newPages,
          order: 0,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-02T00:00:00.000Z',
        },
      });

      const fumetto = await repository.update(1, updateData);

      expect(fumetto?.pages).toEqual(newPages);
      expect(fumetto?.pages?.length).toBe(4);
    });
  });
});
