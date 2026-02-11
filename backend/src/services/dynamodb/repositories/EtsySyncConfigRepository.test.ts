/**
 * Unit tests for EtsySyncConfigRepository
 */

import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBOptimized } from '../DynamoDBOptimized';
import { EtsySyncConfigRepository } from './EtsySyncConfigRepository';
import { CreateEtsySyncConfigData, UpdateEtsySyncConfigData, EtsySyncType } from './types';

// Mock DynamoDB Document Client
const ddbMock = mockClient(DynamoDBDocumentClient);

describe('EtsySyncConfigRepository', () => {
  let dynamoDB: DynamoDBOptimized;
  let repository: EtsySyncConfigRepository;

  beforeEach(() => {
    ddbMock.reset();
    dynamoDB = new DynamoDBOptimized({
      tableName: 'test-table',
      region: 'us-east-1',
    });
    repository = new EtsySyncConfigRepository(dynamoDB);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new sync config', async () => {
      const createData: CreateEtsySyncConfigData = {
        shop_id: 'shop123',
        sync_status: 'idle',
        rate_limit_remaining: 10000,
      };

      ddbMock.on(PutCommand).resolves({});

      const result = await repository.create(createData);

      expect(result.shop_id).toBe('shop123');
      expect(result.sync_status).toBe('idle');
      expect(result.rate_limit_remaining).toBe(10000);
      expect(result.created_at).toBeDefined();
      expect(result.updated_at).toBeDefined();

      const putCalls = ddbMock.commandCalls(PutCommand);
      expect(putCalls.length).toBe(1);
      expect(putCalls[0].args[0].input.Item?.PK).toBe('ETSY_SYNC_CONFIG#shop123');
      expect(putCalls[0].args[0].input.Item?.SK).toBe('METADATA');
    });

    it('should use default values if not provided', async () => {
      const createData: CreateEtsySyncConfigData = {
        shop_id: 'shop123',
      };

      ddbMock.on(PutCommand).resolves({});

      const result = await repository.create(createData);

      expect(result.sync_status).toBe('idle');
      expect(result.rate_limit_remaining).toBe(10000);
    });
  });

  describe('findByShopId', () => {
    it('should return config when found', async () => {
      const mockConfig = {
        PK: 'ETSY_SYNC_CONFIG#shop123',
        SK: 'METADATA',
        shop_id: 'shop123',
        last_product_sync: '2026-01-01T00:00:00Z',
        last_inventory_sync: '2026-01-01T00:00:00Z',
        sync_status: 'idle',
        rate_limit_remaining: 9500,
        rate_limit_reset_at: '2026-01-01T01:00:00Z',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };

      ddbMock.on(GetCommand).resolves({
        Item: mockConfig,
      });

      const result = await repository.findByShopId('shop123');

      expect(result).not.toBeNull();
      expect(result?.shop_id).toBe('shop123');
      expect(result?.last_product_sync).toBe('2026-01-01T00:00:00Z');
      expect(result?.rate_limit_remaining).toBe(9500);
    });

    it('should return null when config not found', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: undefined,
      });

      const result = await repository.findByShopId('shop456');

      expect(result).toBeNull();
    });

    it('should use consistent read', async () => {
      ddbMock.on(GetCommand).resolves({ Item: undefined });

      await repository.findByShopId('shop123');

      const calls = ddbMock.commandCalls(GetCommand);
      expect(calls[0].args[0].input.ConsistentRead).toBe(true);
    });
  });

  describe('update', () => {
    it('should update config fields', async () => {
      const updateData: UpdateEtsySyncConfigData = {
        last_product_sync: '2026-02-01T00:00:00Z',
        sync_status: 'in_progress',
        rate_limit_remaining: 9000,
      };

      const updatedItem = {
        PK: 'ETSY_SYNC_CONFIG#shop123',
        SK: 'METADATA',
        shop_id: 'shop123',
        last_product_sync: '2026-02-01T00:00:00Z',
        sync_status: 'in_progress',
        rate_limit_remaining: 9000,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: new Date().toISOString(),
      };

      ddbMock.on(UpdateCommand).resolves({
        Attributes: updatedItem,
      });

      const result = await repository.update('shop123', updateData);

      expect(result).not.toBeNull();
      expect(result?.last_product_sync).toBe('2026-02-01T00:00:00Z');
      expect(result?.sync_status).toBe('in_progress');
      expect(result?.rate_limit_remaining).toBe(9000);
    });

    it('should return null when config does not exist', async () => {
      ddbMock.on(UpdateCommand).rejects({
        name: 'ConditionalCheckFailedException',
        message: 'The conditional request failed',
      });

      const result = await repository.update('shop999', { sync_status: 'idle' });

      expect(result).toBeNull();
    });
  });

  describe('updateLastSync', () => {
    it('should update last_product_sync when type is PRODUCT', async () => {
      const updatedItem = {
        PK: 'ETSY_SYNC_CONFIG#shop123',
        SK: 'METADATA',
        shop_id: 'shop123',
        last_product_sync: new Date().toISOString(),
        sync_status: 'idle',
        rate_limit_remaining: 10000,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: new Date().toISOString(),
      };

      ddbMock.on(UpdateCommand).resolves({
        Attributes: updatedItem,
      });

      const result = await repository.updateLastSync('shop123', EtsySyncType.PRODUCT);

      expect(result).not.toBeNull();
      expect(result?.last_product_sync).toBeDefined();
    });

    it('should update last_inventory_sync when type is INVENTORY', async () => {
      const updatedItem = {
        PK: 'ETSY_SYNC_CONFIG#shop123',
        SK: 'METADATA',
        shop_id: 'shop123',
        last_inventory_sync: new Date().toISOString(),
        sync_status: 'idle',
        rate_limit_remaining: 10000,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: new Date().toISOString(),
      };

      ddbMock.on(UpdateCommand).resolves({
        Attributes: updatedItem,
      });

      const result = await repository.updateLastSync('shop123', EtsySyncType.INVENTORY);

      expect(result).not.toBeNull();
      expect(result?.last_inventory_sync).toBeDefined();
    });

    it('should update last_receipt_sync when type is RECEIPT', async () => {
      const updatedItem = {
        PK: 'ETSY_SYNC_CONFIG#shop123',
        SK: 'METADATA',
        shop_id: 'shop123',
        last_receipt_sync: new Date().toISOString(),
        sync_status: 'idle',
        rate_limit_remaining: 10000,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: new Date().toISOString(),
      };

      ddbMock.on(UpdateCommand).resolves({
        Attributes: updatedItem,
      });

      const result = await repository.updateLastSync('shop123', EtsySyncType.RECEIPT);

      expect(result).not.toBeNull();
      expect(result?.last_receipt_sync).toBeDefined();
    });
  });

  describe('upsert', () => {
    it('should create new config when not exists', async () => {
      const updateData: UpdateEtsySyncConfigData = {
        last_product_sync: '2026-01-01T00:00:00Z',
        sync_status: 'idle',
        rate_limit_remaining: 10000,
      };

      ddbMock.on(GetCommand).resolves({ Item: undefined });
      ddbMock.on(PutCommand).resolves({});

      const result = await repository.upsert('shop123', updateData);

      expect(result.shop_id).toBe('shop123');
      expect(result.last_product_sync).toBe('2026-01-01T00:00:00Z');
      expect(result.sync_status).toBe('idle');
      expect(result.created_at).toBeDefined();
      expect(result.updated_at).toBeDefined();
    });

    it('should update existing config preserving created_at', async () => {
      const existingConfig = {
        PK: 'ETSY_SYNC_CONFIG#shop123',
        SK: 'METADATA',
        shop_id: 'shop123',
        sync_status: 'idle',
        rate_limit_remaining: 10000,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };

      const updateData: UpdateEtsySyncConfigData = {
        last_product_sync: '2026-02-01T00:00:00Z',
        sync_status: 'in_progress',
      };

      ddbMock.on(GetCommand).resolves({ Item: existingConfig });
      ddbMock.on(PutCommand).resolves({});

      const result = await repository.upsert('shop123', updateData);

      expect(result.last_product_sync).toBe('2026-02-01T00:00:00Z');
      expect(result.sync_status).toBe('in_progress');
      expect(result.created_at).toBe('2026-01-01T00:00:00Z');
      expect(result.updated_at).not.toBe('2026-01-01T00:00:00Z');
    });

    it('should use default values for undefined fields', async () => {
      const updateData: UpdateEtsySyncConfigData = {};

      ddbMock.on(GetCommand).resolves({ Item: undefined });
      ddbMock.on(PutCommand).resolves({});

      const result = await repository.upsert('shop123', updateData);

      expect(result.sync_status).toBe('idle');
      expect(result.rate_limit_remaining).toBe(10000);
    });
  });

  describe('delete', () => {
    it('should delete config by shop ID', async () => {
      ddbMock.on(DeleteCommand).resolves({});

      await repository.delete('shop123');

      const deleteCalls = ddbMock.commandCalls(DeleteCommand);
      expect(deleteCalls.length).toBe(1);
      expect(deleteCalls[0].args[0].input.Key).toEqual({
        PK: 'ETSY_SYNC_CONFIG#shop123',
        SK: 'METADATA',
      });
    });
  });
});
