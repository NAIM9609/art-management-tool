/**
 * Unit tests for EtsyReceiptRepository
 */

import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand, UpdateCommandInput } from '@aws-sdk/lib-dynamodb';
import { DynamoDBOptimized } from '../DynamoDBOptimized';
import { EtsyReceiptRepository } from './EtsyReceiptRepository';
import { CreateEtsyReceiptData, UpdateEtsyReceiptData } from './types';

// Mock DynamoDB Document Client
const ddbMock = mockClient(DynamoDBDocumentClient);

describe('EtsyReceiptRepository', () => {
  let dynamoDB: DynamoDBOptimized;
  let repository: EtsyReceiptRepository;

  beforeEach(() => {
    ddbMock.reset();
    dynamoDB = new DynamoDBOptimized({
      tableName: 'test-table',
      region: 'us-east-1',
    });
    repository = new EtsyReceiptRepository(dynamoDB);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new Etsy receipt', async () => {
      const createData: CreateEtsyReceiptData = {
        etsy_receipt_id: 987654,
        local_order_id: 1,
        shop_id: 'shop123',
        buyer_email: 'buyer@example.com',
        buyer_name: 'John Doe',
        status: 'paid',
        is_paid: true,
        is_shipped: false,
        grand_total: 99.99,
        subtotal: 89.99,
        total_shipping_cost: 10.00,
        currency: 'USD',
        etsy_created_at: '2026-01-01T00:00:00Z',
        etsy_updated_at: '2026-01-01T00:00:00Z',
      };

      ddbMock.on(PutCommand).resolves({});

      const result = await repository.create(createData);

      expect(result.etsy_receipt_id).toBe(987654);
      expect(result.local_order_id).toBe(1);
      expect(result.shop_id).toBe('shop123');
      expect(result.is_paid).toBe(true);
      expect(result.is_shipped).toBe(false);
      expect(result.sync_status).toBe('pending');
      expect(result.created_at).toBeDefined();
      expect(result.updated_at).toBeDefined();

      const putCalls = ddbMock.commandCalls(PutCommand);
      expect(putCalls.length).toBe(1);
      expect(putCalls[0].args[0].input.Item?.PK).toBe('ETSY_RECEIPT#987654');
      expect(putCalls[0].args[0].input.Item?.SK).toBe('METADATA');
      expect(putCalls[0].args[0].input.Item?.GSI1PK).toBe('ETSY_ORDER#1');
      expect(putCalls[0].args[0].input.Item?.GSI1SK).toBe('METADATA');
    });

    it('should use default values for optional fields', async () => {
      const createData: CreateEtsyReceiptData = {
        etsy_receipt_id: 987654,
        shop_id: 'shop123',
        etsy_created_at: '2026-01-01T00:00:00Z',
        etsy_updated_at: '2026-01-01T00:00:00Z',
      };

      ddbMock.on(PutCommand).resolves({});

      const result = await repository.create(createData);

      expect(result.is_paid).toBe(false);
      expect(result.is_shipped).toBe(false);
      expect(result.sync_status).toBe('pending');
    });

    it('should not create GSI1 if local_order_id is not provided', async () => {
      const createData: CreateEtsyReceiptData = {
        etsy_receipt_id: 987654,
        shop_id: 'shop123',
        etsy_created_at: '2026-01-01T00:00:00Z',
        etsy_updated_at: '2026-01-01T00:00:00Z',
      };

      ddbMock.on(PutCommand).resolves({});

      await repository.create(createData);

      const putCalls = ddbMock.commandCalls(PutCommand);
      expect(putCalls[0].args[0].input.Item?.GSI1PK).toBeUndefined();
      expect(putCalls[0].args[0].input.Item?.GSI1SK).toBeUndefined();
    });

    it('should persist all optional fields when provided', async () => {
      const createData: CreateEtsyReceiptData = {
        etsy_receipt_id: 111222,
        shop_id: 'shop456',
        etsy_created_at: '2026-01-01T00:00:00Z',
        etsy_updated_at: '2026-01-01T00:00:00Z',
        total_tax_cost: 5.5,
        payment_method: 'credit_card',
        shipping_address: '123 Main St',
        message_from_buyer: 'Please gift-wrap',
      };

      ddbMock.on(PutCommand).resolves({});

      const result = await repository.create(createData);

      expect(result.total_tax_cost).toBe(5.5);
      expect(result.payment_method).toBe('credit_card');
      expect(result.shipping_address).toBe('123 Main St');
      expect(result.message_from_buyer).toBe('Please gift-wrap');

      const putCalls = ddbMock.commandCalls(PutCommand);
      expect(putCalls[0].args[0].input.Item?.total_tax_cost).toBe(5.5);
      expect(putCalls[0].args[0].input.Item?.payment_method).toBe('credit_card');
      expect(putCalls[0].args[0].input.Item?.shipping_address).toBe('123 Main St');
      expect(putCalls[0].args[0].input.Item?.message_from_buyer).toBe('Please gift-wrap');
    });
  });

  describe('findByEtsyReceiptId', () => {
    it('should return receipt when found', async () => {
      const mockReceipt = {
        PK: 'ETSY_RECEIPT#987654',
        SK: 'METADATA',
        etsy_receipt_id: 987654,
        local_order_id: 1,
        shop_id: 'shop123',
        is_paid: true,
        is_shipped: false,
        etsy_created_at: '2026-01-01T00:00:00Z',
        etsy_updated_at: '2026-01-01T00:00:00Z',
        sync_status: 'synced',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };

      ddbMock.on(GetCommand).resolves({
        Item: mockReceipt,
      });

      const result = await repository.findByEtsyReceiptId(987654);

      expect(result).not.toBeNull();
      expect(result?.etsy_receipt_id).toBe(987654);
      expect(result?.is_paid).toBe(true);
      expect(result?.is_shipped).toBe(false);
    });

    it('should return null when receipt not found', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: undefined,
      });

      const result = await repository.findByEtsyReceiptId(999999);

      expect(result).toBeNull();
    });

    it('should use consistent read', async () => {
      ddbMock.on(GetCommand).resolves({ Item: undefined });

      await repository.findByEtsyReceiptId(987654);

      const calls = ddbMock.commandCalls(GetCommand);
      expect(calls[0].args[0].input.ConsistentRead).toBe(true);
    });
  });

  describe('findByLocalOrderId', () => {
    it('should return receipt when found using GSI1', async () => {
      const mockReceipt = {
        PK: 'ETSY_RECEIPT#987654',
        SK: 'METADATA',
        GSI1PK: 'ETSY_ORDER#1',
        GSI1SK: 'METADATA',
        etsy_receipt_id: 987654,
        local_order_id: 1,
        shop_id: 'shop123',
        is_paid: true,
        is_shipped: false,
        etsy_created_at: '2026-01-01T00:00:00Z',
        etsy_updated_at: '2026-01-01T00:00:00Z',
        sync_status: 'synced',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };

      ddbMock.on(QueryCommand).resolves({
        Items: [mockReceipt],
        Count: 1,
      });

      const result = await repository.findByLocalOrderId(1);

      expect(result).not.toBeNull();
      expect(result?.local_order_id).toBe(1);
      expect(result?.etsy_receipt_id).toBe(987654);

      const queryCalls = ddbMock.commandCalls(QueryCommand);
      expect(queryCalls[0].args[0].input.IndexName).toBe('GSI1');
    });

    it('should return null when receipt not found', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [],
        Count: 0,
      });

      const result = await repository.findByLocalOrderId(999);

      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('should update receipt fields', async () => {
      const updateData: UpdateEtsyReceiptData = {
        is_paid: true,
        is_shipped: true,
        status: 'completed',
      };

      const updatedItem = {
        PK: 'ETSY_RECEIPT#987654',
        SK: 'METADATA',
        etsy_receipt_id: 987654,
        shop_id: 'shop123',
        is_paid: true,
        is_shipped: true,
        status: 'completed',
        etsy_created_at: '2026-01-01T00:00:00Z',
        etsy_updated_at: '2026-01-01T00:00:00Z',
        sync_status: 'synced',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: new Date().toISOString(),
      };

      ddbMock.on(UpdateCommand).resolves({
        Attributes: updatedItem,
      });

      const result = await repository.update(987654, updateData);

      expect(result).not.toBeNull();
      expect(result?.is_paid).toBe(true);
      expect(result?.is_shipped).toBe(true);
      expect(result?.status).toBe('completed');
    });

    it('should update GSI1 when local_order_id is updated', async () => {
      const updateData: UpdateEtsyReceiptData = {
        local_order_id: 2,
      };

      const updatedItem = {
        PK: 'ETSY_RECEIPT#987654',
        SK: 'METADATA',
        GSI1PK: 'ETSY_ORDER#2',
        GSI1SK: 'METADATA',
        etsy_receipt_id: 987654,
        local_order_id: 2,
        shop_id: 'shop123',
        is_paid: false,
        is_shipped: false,
        etsy_created_at: '2026-01-01T00:00:00Z',
        etsy_updated_at: '2026-01-01T00:00:00Z',
        sync_status: 'pending',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: new Date().toISOString(),
      };

      ddbMock.on(UpdateCommand).resolves({
        Attributes: updatedItem,
      });

      const result = await repository.update(987654, updateData);

      expect(result).not.toBeNull();
      expect(result?.local_order_id).toBe(2);
    });

    it('should remove GSI1 when local_order_id is set to null', async () => {
      const updateData: UpdateEtsyReceiptData = {
        local_order_id: null,
      };

      const updatedItem = {
        PK: 'ETSY_RECEIPT#987654',
        SK: 'METADATA',
        etsy_receipt_id: 987654,
        shop_id: 'shop123',
        is_paid: false,
        is_shipped: false,
        etsy_created_at: '2026-01-01T00:00:00Z',
        etsy_updated_at: '2026-01-01T00:00:00Z',
        sync_status: 'pending',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: new Date().toISOString(),
        // Note: local_order_id, GSI1PK, and GSI1SK should be removed
      };

      ddbMock.on(UpdateCommand).resolves({
        Attributes: updatedItem,
      });

      const result = await repository.update(987654, updateData);

      expect(result).not.toBeNull();
      expect(result?.local_order_id).toBeUndefined();

      // Verify that the UpdateCommand was called with the correct REMOVE expression
      const calls = ddbMock.commandCalls(UpdateCommand);
      expect(calls.length).toBe(1);
      const input = calls[0].args[0].input as UpdateCommandInput;

      expect(input.UpdateExpression).toContain('REMOVE');
      expect(input.UpdateExpression).toMatch(/#local_order_id/);
      expect(input.UpdateExpression).toMatch(/GSI1PK/);
      expect(input.UpdateExpression).toMatch(/GSI1SK/);

      expect(input.ExpressionAttributeNames?.['#local_order_id']).toBe('local_order_id');
    });

    it('should return null when receipt does not exist', async () => {
      ddbMock.on(UpdateCommand).rejects({
        name: 'ConditionalCheckFailedException',
        message: 'The conditional request failed',
      });

      const result = await repository.update(999999, { is_paid: true });

      expect(result).toBeNull();
    });

    it('should build SET clause for extra fields alongside REMOVE when local_order_id is null', async () => {
      const updateData: UpdateEtsyReceiptData = {
        local_order_id: null,
        buyer_email: 'extra@example.com',
      };

      const updatedItem = {
        PK: 'ETSY_RECEIPT#987654',
        SK: 'METADATA',
        etsy_receipt_id: 987654,
        shop_id: 'shop123',
        buyer_email: 'extra@example.com',
        is_paid: false,
        is_shipped: false,
        etsy_created_at: '2026-01-01T00:00:00Z',
        etsy_updated_at: '2026-01-01T00:00:00Z',
        sync_status: 'pending',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: new Date().toISOString(),
      };

      ddbMock.on(UpdateCommand).resolves({ Attributes: updatedItem });

      const result = await repository.update(987654, updateData);

      expect(result).not.toBeNull();
      expect(result?.buyer_email).toBe('extra@example.com');
      expect(result?.local_order_id).toBeUndefined();

      const calls = ddbMock.commandCalls(UpdateCommand);
      const input = calls[0].args[0].input as UpdateCommandInput;
      expect(input.UpdateExpression).toContain('SET');
      expect(input.UpdateExpression).toContain('REMOVE');
    });

    it('should return null when Attributes absent in null local_order_id path', async () => {
      ddbMock.on(UpdateCommand).resolves({});

      const result = await repository.update(987654, { local_order_id: null });

      expect(result).toBeNull();
    });

    it('should return null when error.code is ConditionalCheckFailedException in null local_order_id path', async () => {
      ddbMock.on(UpdateCommand).rejects(
        Object.assign(new Error('The conditional request failed'), { code: 'ConditionalCheckFailedException' })
      );

      const result = await repository.update(987654, { local_order_id: null });

      expect(result).toBeNull();
    });

    it('should return null when UpdateCommand returns no Attributes in normal update path', async () => {
      ddbMock.on(UpdateCommand).resolves({});

      const result = await repository.update(987654, { is_paid: true });

      expect(result).toBeNull();
    });

    it('should return null when error.code is ConditionalCheckFailedException in normal update path', async () => {
      ddbMock.on(UpdateCommand).rejects(
        Object.assign(new Error('The conditional request failed'), { code: 'ConditionalCheckFailedException' })
      );

      const result = await repository.update(987654, { is_paid: true });

      expect(result).toBeNull();
    });

    it('should rethrow non-ConditionalCheck errors in null local_order_id path', async () => {
      ddbMock.on(UpdateCommand).rejects(new Error('Service unavailable'));

      await expect(repository.update(987654, { local_order_id: null })).rejects.toThrow('Service unavailable');
    });

    it('should rethrow non-ConditionalCheck errors in normal update path', async () => {
      ddbMock.on(UpdateCommand).rejects(new Error('Service unavailable'));

      await expect(repository.update(987654, { is_paid: true })).rejects.toThrow('Service unavailable');
    });

    it('should update all optional fields in normal update path', async () => {
      const updateData: UpdateEtsyReceiptData = {
        local_order_id: 42,
        grand_total: 150.0,
        subtotal: 130.0,
        total_shipping_cost: 10.0,
        total_tax_cost: 10.0,
        currency: 'EUR',
        payment_method: 'paypal',
        shipping_address: '456 Elm St',
        message_from_buyer: 'No rush',
        etsy_updated_at: '2026-06-01T00:00:00Z',
        last_synced_at: '2026-06-01T01:00:00Z',
        sync_status: 'synced',
      };

      const updatedItem = {
        PK: 'ETSY_RECEIPT#987654',
        SK: 'METADATA',
        etsy_receipt_id: 987654,
        shop_id: 'shop123',
        local_order_id: 42,
        GSI1PK: 'ETSY_ORDER#42',
        GSI1SK: 'METADATA',
        grand_total: 150.0,
        subtotal: 130.0,
        total_shipping_cost: 10.0,
        total_tax_cost: 10.0,
        currency: 'EUR',
        payment_method: 'paypal',
        shipping_address: '456 Elm St',
        message_from_buyer: 'No rush',
        etsy_created_at: '2026-01-01T00:00:00Z',
        etsy_updated_at: '2026-06-01T00:00:00Z',
        last_synced_at: '2026-06-01T01:00:00Z',
        sync_status: 'synced',
        is_paid: false,
        is_shipped: false,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: new Date().toISOString(),
      };

      ddbMock.on(UpdateCommand).resolves({ Attributes: updatedItem });

      const result = await repository.update(987654, updateData);

      expect(result).not.toBeNull();
      expect(result?.local_order_id).toBe(42);
      expect(result?.grand_total).toBe(150.0);
      expect(result?.currency).toBe('EUR');
      expect(result?.sync_status).toBe('synced');
    });
  });

  describe('updatePaymentStatus', () => {
    it('should update payment status to paid', async () => {
      const updatedItem = {
        PK: 'ETSY_RECEIPT#987654',
        SK: 'METADATA',
        etsy_receipt_id: 987654,
        shop_id: 'shop123',
        is_paid: true,
        is_shipped: false,
        etsy_created_at: '2026-01-01T00:00:00Z',
        etsy_updated_at: '2026-01-01T00:00:00Z',
        sync_status: 'synced',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: new Date().toISOString(),
      };

      ddbMock.on(UpdateCommand).resolves({
        Attributes: updatedItem,
      });

      const result = await repository.updatePaymentStatus(987654, true);

      expect(result).not.toBeNull();
      expect(result?.is_paid).toBe(true);
    });
  });

  describe('updateShippingStatus', () => {
    it('should update shipping status to shipped', async () => {
      const updatedItem = {
        PK: 'ETSY_RECEIPT#987654',
        SK: 'METADATA',
        etsy_receipt_id: 987654,
        shop_id: 'shop123',
        is_paid: true,
        is_shipped: true,
        etsy_created_at: '2026-01-01T00:00:00Z',
        etsy_updated_at: '2026-01-01T00:00:00Z',
        sync_status: 'synced',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: new Date().toISOString(),
      };

      ddbMock.on(UpdateCommand).resolves({
        Attributes: updatedItem,
      });

      const result = await repository.updateShippingStatus(987654, true);

      expect(result).not.toBeNull();
      expect(result?.is_shipped).toBe(true);
    });
  });

  describe('delete', () => {
    it('should delete receipt by Etsy receipt ID', async () => {
      ddbMock.on(DeleteCommand).resolves({});

      await repository.delete(987654);

      const deleteCalls = ddbMock.commandCalls(DeleteCommand);
      expect(deleteCalls.length).toBe(1);
      expect(deleteCalls[0].args[0].input.Key).toEqual({
        PK: 'ETSY_RECEIPT#987654',
        SK: 'METADATA',
      });
    });
  });
});
