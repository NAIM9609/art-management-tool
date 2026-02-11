/**
 * Unit tests for EtsyOAuthTokenRepository
 */

import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBOptimized } from '../DynamoDBOptimized';
import { EtsyOAuthTokenRepository } from './EtsyOAuthTokenRepository';
import { UpsertEtsyOAuthTokenData } from './types';

// Mock DynamoDB Document Client
const ddbMock = mockClient(DynamoDBDocumentClient);

describe('EtsyOAuthTokenRepository', () => {
  let dynamoDB: DynamoDBOptimized;
  let repository: EtsyOAuthTokenRepository;

  beforeEach(() => {
    ddbMock.reset();
    dynamoDB = new DynamoDBOptimized({
      tableName: 'test-table',
      region: 'us-east-1',
    });
    repository = new EtsyOAuthTokenRepository(dynamoDB);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findByShopId', () => {
    it('should return token when found', async () => {
      const mockToken = {
        PK: 'ETSY_TOKEN#shop123',
        SK: 'METADATA',
        shop_id: 'shop123',
        access_token: 'access_token_value',
        refresh_token: 'refresh_token_value',
        token_type: 'Bearer',
        expires_at: '2026-12-31T23:59:59Z',
        scope: 'transactions_r transactions_w',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };

      ddbMock.on(GetCommand).resolves({
        Item: mockToken,
      });

      const result = await repository.findByShopId('shop123');

      expect(result).not.toBeNull();
      expect(result?.shop_id).toBe('shop123');
      expect(result?.access_token).toBe('access_token_value');
      expect(result?.refresh_token).toBe('refresh_token_value');
      expect(result?.token_type).toBe('Bearer');
      expect(result?.expires_at).toBe('2026-12-31T23:59:59Z');
      expect(result?.scope).toBe('transactions_r transactions_w');
    });

    it('should return null when token not found', async () => {
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

  describe('upsert', () => {
    it('should create new token when not exists', async () => {
      const upsertData: UpsertEtsyOAuthTokenData = {
        shop_id: 'shop123',
        access_token: 'new_access_token',
        refresh_token: 'new_refresh_token',
        token_type: 'Bearer',
        expires_at: '2026-12-31T23:59:59Z',
        scope: 'transactions_r',
      };

      ddbMock.on(GetCommand).resolves({ Item: undefined });
      ddbMock.on(PutCommand).resolves({});

      const result = await repository.upsert(upsertData);

      expect(result.shop_id).toBe('shop123');
      expect(result.access_token).toBe('new_access_token');
      expect(result.refresh_token).toBe('new_refresh_token');
      expect(result.created_at).toBeDefined();
      expect(result.updated_at).toBeDefined();

      const putCalls = ddbMock.commandCalls(PutCommand);
      expect(putCalls.length).toBe(1);
      expect(putCalls[0].args[0].input.Item?.PK).toBe('ETSY_TOKEN#shop123');
      expect(putCalls[0].args[0].input.Item?.SK).toBe('METADATA');
    });

    it('should update existing token preserving created_at', async () => {
      const existingToken = {
        PK: 'ETSY_TOKEN#shop123',
        SK: 'METADATA',
        shop_id: 'shop123',
        access_token: 'old_access_token',
        refresh_token: 'old_refresh_token',
        token_type: 'Bearer',
        expires_at: '2026-06-30T23:59:59Z',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };

      const upsertData: UpsertEtsyOAuthTokenData = {
        shop_id: 'shop123',
        access_token: 'updated_access_token',
        refresh_token: 'updated_refresh_token',
        expires_at: '2026-12-31T23:59:59Z',
      };

      ddbMock.on(GetCommand).resolves({ Item: existingToken });
      ddbMock.on(PutCommand).resolves({});

      const result = await repository.upsert(upsertData);

      expect(result.access_token).toBe('updated_access_token');
      expect(result.refresh_token).toBe('updated_refresh_token');
      expect(result.created_at).toBe('2026-01-01T00:00:00Z');
      expect(result.updated_at).not.toBe('2026-01-01T00:00:00Z');
    });

    it('should use default token_type if not provided', async () => {
      const upsertData: UpsertEtsyOAuthTokenData = {
        shop_id: 'shop123',
        access_token: 'access_token',
        refresh_token: 'refresh_token',
        expires_at: '2026-12-31T23:59:59Z',
      };

      ddbMock.on(GetCommand).resolves({ Item: undefined });
      ddbMock.on(PutCommand).resolves({});

      const result = await repository.upsert(upsertData);

      expect(result.token_type).toBe('Bearer');
    });
  });

  describe('isExpired', () => {
    it('should return true if token does not exist', async () => {
      ddbMock.on(GetCommand).resolves({ Item: undefined });

      const result = await repository.isExpired('shop123');

      expect(result).toBe(true);
    });

    it('should return true if token is expired', async () => {
      const expiredToken = {
        PK: 'ETSY_TOKEN#shop123',
        SK: 'METADATA',
        shop_id: 'shop123',
        access_token: 'access_token',
        refresh_token: 'refresh_token',
        token_type: 'Bearer',
        expires_at: '2020-01-01T00:00:00Z', // Expired
        created_at: '2020-01-01T00:00:00Z',
        updated_at: '2020-01-01T00:00:00Z',
      };

      ddbMock.on(GetCommand).resolves({ Item: expiredToken });

      const result = await repository.isExpired('shop123');

      expect(result).toBe(true);
    });

    it('should return true if token expires within 5 minutes (buffer)', async () => {
      const now = new Date();
      const almostExpired = new Date(now.getTime() + 3 * 60 * 1000); // 3 minutes from now

      const token = {
        PK: 'ETSY_TOKEN#shop123',
        SK: 'METADATA',
        shop_id: 'shop123',
        access_token: 'access_token',
        refresh_token: 'refresh_token',
        token_type: 'Bearer',
        expires_at: almostExpired.toISOString(),
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };

      ddbMock.on(GetCommand).resolves({ Item: token });

      const result = await repository.isExpired('shop123');

      expect(result).toBe(true);
    });

    it('should return false if token is valid and not expiring soon', async () => {
      const now = new Date();
      const futureExpiry = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour from now

      const token = {
        PK: 'ETSY_TOKEN#shop123',
        SK: 'METADATA',
        shop_id: 'shop123',
        access_token: 'access_token',
        refresh_token: 'refresh_token',
        token_type: 'Bearer',
        expires_at: futureExpiry.toISOString(),
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };

      ddbMock.on(GetCommand).resolves({ Item: token });

      const result = await repository.isExpired('shop123');

      expect(result).toBe(false);
    });
  });

  describe('delete', () => {
    it('should delete token by shop ID', async () => {
      ddbMock.on(DeleteCommand).resolves({});

      await repository.delete('shop123');

      const deleteCalls = ddbMock.commandCalls(DeleteCommand);
      expect(deleteCalls.length).toBe(1);
      expect(deleteCalls[0].args[0].input.Key).toEqual({
        PK: 'ETSY_TOKEN#shop123',
        SK: 'METADATA',
      });
    });
  });
});
