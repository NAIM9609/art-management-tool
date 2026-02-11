/**
 * Unit tests for EtsyProductRepository
 */

import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBOptimized } from '../DynamoDBOptimized';
import { EtsyProductRepository } from './EtsyProductRepository';
import { CreateEtsyProductData, UpdateEtsyProductData } from './types';

// Mock DynamoDB Document Client
const ddbMock = mockClient(DynamoDBDocumentClient);

describe('EtsyProductRepository', () => {
  let dynamoDB: DynamoDBOptimized;
  let repository: EtsyProductRepository;

  beforeEach(() => {
    ddbMock.reset();
    dynamoDB = new DynamoDBOptimized({
      tableName: 'test-table',
      region: 'us-east-1',
    });
    repository = new EtsyProductRepository(dynamoDB);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new Etsy product', async () => {
      const createData: CreateEtsyProductData = {
        local_product_id: 1,
        etsy_listing_id: 123456,
        title: 'Test Product',
        description: 'Test description',
        price: 29.99,
        quantity: 10,
        sku: 'TEST-SKU-001',
        state: 'active',
        url: 'https://etsy.com/listing/123456',
      };

      ddbMock.on(PutCommand).resolves({});

      const result = await repository.create(createData);

      expect(result.local_product_id).toBe(1);
      expect(result.etsy_listing_id).toBe(123456);
      expect(result.title).toBe('Test Product');
      expect(result.sync_status).toBe('pending');
      expect(result.created_at).toBeDefined();
      expect(result.updated_at).toBeDefined();

      const putCalls = ddbMock.commandCalls(PutCommand);
      expect(putCalls.length).toBe(1);
      expect(putCalls[0].args[0].input.Item?.PK).toBe('ETSY_PRODUCT#1');
      expect(putCalls[0].args[0].input.Item?.SK).toBe('METADATA');
      expect(putCalls[0].args[0].input.Item?.GSI1PK).toBe('ETSY_LISTING#123456');
      expect(putCalls[0].args[0].input.Item?.GSI1SK).toBe('METADATA');
    });

    it('should use default sync_status if not provided', async () => {
      const createData: CreateEtsyProductData = {
        local_product_id: 1,
        etsy_listing_id: 123456,
        title: 'Test Product',
      };

      ddbMock.on(PutCommand).resolves({});

      const result = await repository.create(createData);

      expect(result.sync_status).toBe('pending');
      expect(result.quantity).toBe(0);
    });
  });

  describe('findByLocalProductId', () => {
    it('should return product when found', async () => {
      const mockProduct = {
        PK: 'ETSY_PRODUCT#1',
        SK: 'METADATA',
        local_product_id: 1,
        etsy_listing_id: 123456,
        title: 'Test Product',
        quantity: 10,
        sync_status: 'synced',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };

      ddbMock.on(GetCommand).resolves({
        Item: mockProduct,
      });

      const result = await repository.findByLocalProductId(1);

      expect(result).not.toBeNull();
      expect(result?.local_product_id).toBe(1);
      expect(result?.etsy_listing_id).toBe(123456);
      expect(result?.title).toBe('Test Product');
    });

    it('should return null when product not found', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: undefined,
      });

      const result = await repository.findByLocalProductId(999);

      expect(result).toBeNull();
    });

    it('should use consistent read', async () => {
      ddbMock.on(GetCommand).resolves({ Item: undefined });

      await repository.findByLocalProductId(1);

      const calls = ddbMock.commandCalls(GetCommand);
      expect(calls[0].args[0].input.ConsistentRead).toBe(true);
    });
  });

  describe('findByEtsyListingId', () => {
    it('should return product when found using GSI1', async () => {
      const mockProduct = {
        PK: 'ETSY_PRODUCT#1',
        SK: 'METADATA',
        GSI1PK: 'ETSY_LISTING#123456',
        GSI1SK: 'METADATA',
        local_product_id: 1,
        etsy_listing_id: 123456,
        title: 'Test Product',
        quantity: 10,
        sync_status: 'synced',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };

      ddbMock.on(QueryCommand).resolves({
        Items: [mockProduct],
        Count: 1,
      });

      const result = await repository.findByEtsyListingId(123456);

      expect(result).not.toBeNull();
      expect(result?.etsy_listing_id).toBe(123456);

      const queryCalls = ddbMock.commandCalls(QueryCommand);
      expect(queryCalls[0].args[0].input.IndexName).toBe('GSI1');
    });

    it('should return null when product not found', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [],
        Count: 0,
      });

      const result = await repository.findByEtsyListingId(999999);

      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('should update product fields', async () => {
      const updateData: UpdateEtsyProductData = {
        title: 'Updated Title',
        price: 39.99,
        quantity: 15,
        sync_status: 'synced',
      };

      const updatedItem = {
        PK: 'ETSY_PRODUCT#1',
        SK: 'METADATA',
        local_product_id: 1,
        etsy_listing_id: 123456,
        title: 'Updated Title',
        price: 39.99,
        quantity: 15,
        sync_status: 'synced',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: new Date().toISOString(),
      };

      ddbMock.on(UpdateCommand).resolves({
        Attributes: updatedItem,
      });

      const result = await repository.update(1, updateData);

      expect(result).not.toBeNull();
      expect(result?.title).toBe('Updated Title');
      expect(result?.price).toBe(39.99);
      expect(result?.quantity).toBe(15);
    });

    it('should return null when product does not exist', async () => {
      ddbMock.on(UpdateCommand).rejects({
        name: 'ConditionalCheckFailedException',
        message: 'The conditional request failed',
      });

      const result = await repository.update(999, { title: 'Test' });

      expect(result).toBeNull();
    });
  });

  describe('updateSyncStatus', () => {
    it('should update sync status and timestamp', async () => {
      const updatedItem = {
        PK: 'ETSY_PRODUCT#1',
        SK: 'METADATA',
        local_product_id: 1,
        etsy_listing_id: 123456,
        title: 'Test Product',
        quantity: 10,
        sync_status: 'synced',
        last_synced_at: new Date().toISOString(),
        created_at: '2026-01-01T00:00:00Z',
        updated_at: new Date().toISOString(),
      };

      ddbMock.on(UpdateCommand).resolves({
        Attributes: updatedItem,
      });

      const result = await repository.updateSyncStatus(1, 'synced');

      expect(result).not.toBeNull();
      expect(result?.sync_status).toBe('synced');
      expect(result?.last_synced_at).toBeDefined();
    });

    it('should use provided timestamp if given', async () => {
      const customTimestamp = '2026-06-01T12:00:00Z';

      const updatedItem = {
        PK: 'ETSY_PRODUCT#1',
        SK: 'METADATA',
        local_product_id: 1,
        etsy_listing_id: 123456,
        title: 'Test Product',
        quantity: 10,
        sync_status: 'synced',
        last_synced_at: customTimestamp,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: new Date().toISOString(),
      };

      ddbMock.on(UpdateCommand).resolves({
        Attributes: updatedItem,
      });

      const result = await repository.updateSyncStatus(1, 'synced', customTimestamp);

      expect(result?.last_synced_at).toBe(customTimestamp);
    });
  });

  describe('delete', () => {
    it('should delete product by local product ID', async () => {
      ddbMock.on(DeleteCommand).resolves({});

      await repository.delete(1);

      const deleteCalls = ddbMock.commandCalls(DeleteCommand);
      expect(deleteCalls.length).toBe(1);
      expect(deleteCalls[0].args[0].input.Key).toEqual({
        PK: 'ETSY_PRODUCT#1',
        SK: 'METADATA',
      });
    });
  });
});
