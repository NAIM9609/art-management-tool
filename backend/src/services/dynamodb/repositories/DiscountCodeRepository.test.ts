/**
 * Unit tests for DiscountCodeRepository
 */

import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBOptimized } from '../DynamoDBOptimized';
import { DiscountCodeRepository } from './DiscountCodeRepository';
import { DiscountType, CreateDiscountCodeData, UpdateDiscountCodeData } from './types';

// Mock DynamoDB Document Client
const ddbMock = mockClient(DynamoDBDocumentClient);

describe('DiscountCodeRepository', () => {
  let dynamoDB: DynamoDBOptimized;
  let repository: DiscountCodeRepository;

  beforeEach(() => {
    ddbMock.reset();
    dynamoDB = new DynamoDBOptimized({
      tableName: 'test-table',
      region: 'us-east-1',
    });
    repository = new DiscountCodeRepository(dynamoDB);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getNextId', () => {
    it('should return next ID starting from 1', async () => {
      ddbMock.on(UpdateCommand).resolves({
        Attributes: { value: 1 },
      });

      const id = await repository.getNextId();
      expect(id).toBe(1);
    });

    it('should increment existing counter', async () => {
      ddbMock.on(UpdateCommand).resolves({
        Attributes: { value: 6 },
      });

      const id = await repository.getNextId();
      expect(id).toBe(6);
    });
  });

  describe('create', () => {
    it('should create a new discount code with auto-increment ID', async () => {
      const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
      const createData: CreateDiscountCodeData = {
        code: 'SAVE20',
        description: '20% off',
        discount_type: DiscountType.PERCENTAGE,
        discount_value: 20,
        valid_until: futureDate,
      };

      // Mock getNextId
      ddbMock.on(UpdateCommand).resolves({ Attributes: { value: 1 } });
      
      // Mock put
      ddbMock.on(PutCommand).resolves({});

      const discountCode = await repository.create(createData);

      expect(discountCode.id).toBe(1);
      expect(discountCode.code).toBe('SAVE20');
      expect(discountCode.discount_type).toBe(DiscountType.PERCENTAGE);
      expect(discountCode.discount_value).toBe(20);
      expect(discountCode.times_used).toBe(0);
      expect(discountCode.is_active).toBe(true);
      expect(discountCode.created_at).toBeDefined();
      expect(discountCode.updated_at).toBeDefined();
    });

    it('should throw error if code already exists', async () => {
      const createData: CreateDiscountCodeData = {
        code: 'DUPLICATE',
        discount_type: DiscountType.FIXED,
        discount_value: 10,
      };

      // Mock getNextId
      ddbMock.on(UpdateCommand).resolves({ Attributes: { value: 1 } });

      // Mock PutCommand to fail with conditional check
      ddbMock.on(PutCommand).rejects({
        name: 'ConditionalCheckFailedException',
      });
      
      // Mock findByCode to return existing code (called after failure)
      ddbMock.on(QueryCommand).resolves({
        Items: [{
          id: 1,
          code: 'DUPLICATE',
          discount_type: DiscountType.FIXED,
          discount_value: 10,
          times_used: 0,
          is_active: true,
          valid_from: '2026-01-01T00:00:00.000Z',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        }],
        Count: 1,
      });

      await expect(repository.create(createData)).rejects.toThrow("Discount code 'DUPLICATE' already exists");
    });

    it('should set default values for optional fields', async () => {
      const createData: CreateDiscountCodeData = {
        code: 'BASIC',
        discount_type: DiscountType.PERCENTAGE,
        discount_value: 10,
      };

      ddbMock.on(UpdateCommand).resolves({ Attributes: { value: 2 } });
      ddbMock.on(PutCommand).resolves({});

      const discountCode = await repository.create(createData);

      expect(discountCode.is_active).toBe(true);
      expect(discountCode.times_used).toBe(0);
      expect(discountCode.valid_from).toBeDefined();
    });

    it('should build correct DynamoDB item with GSI keys', async () => {
      const futureDate = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();
      const createData: CreateDiscountCodeData = {
        code: 'SUMMER2024',
        discount_type: DiscountType.PERCENTAGE,
        discount_value: 15,
        valid_until: futureDate,
        is_active: true,
      };

      ddbMock.on(UpdateCommand).resolves({ Attributes: { value: 3 } });

      let putItem: any;
      ddbMock.on(PutCommand).callsFake((input) => {
        putItem = input.Item;
        return {};
      });

      await repository.create(createData);

      expect(putItem.PK).toBe('DISCOUNT#3');
      expect(putItem.SK).toBe('METADATA');
      expect(putItem.GSI1PK).toBe('DISCOUNT_CODE#SUMMER2024');
      expect(putItem.GSI2PK).toBe('DISCOUNT_ACTIVE#true');
      expect(putItem.GSI2SK).toBe(futureDate);
    });

    it('should use 9999-12-31 for GSI2SK when valid_until is not provided', async () => {
      const createData: CreateDiscountCodeData = {
        code: 'NOEXPIRY',
        discount_type: DiscountType.FIXED,
        discount_value: 5,
      };

      ddbMock.on(UpdateCommand).resolves({ Attributes: { value: 4 } });

      let putItem: any;
      ddbMock.on(PutCommand).callsFake((input) => {
        putItem = input.Item;
        return {};
      });

      await repository.create(createData);

      expect(putItem.GSI2SK).toBe('9999-12-31');
    });

    it('should validate code format and reject invalid codes', async () => {
      const createData: CreateDiscountCodeData = {
        code: 'ab', // Too short
        discount_type: DiscountType.PERCENTAGE,
        discount_value: 10,
      };

      await expect(repository.create(createData)).rejects.toThrow('Discount code must be 3-50 alphanumeric characters');
    });

    it('should validate percentage discount value is between 0-100', async () => {
      const createData: CreateDiscountCodeData = {
        code: 'INVALID',
        discount_type: DiscountType.PERCENTAGE,
        discount_value: 150, // Too high
      };

      await expect(repository.create(createData)).rejects.toThrow('Percentage discount value must be between 0 and 100');
    });

    it('should validate discount value is positive', async () => {
      const createData: CreateDiscountCodeData = {
        code: 'NEGATIVE',
        discount_type: DiscountType.FIXED,
        discount_value: -10,
      };

      await expect(repository.create(createData)).rejects.toThrow('Discount value must be positive');
    });

    it('should validate valid_from is before valid_until', async () => {
      const createData: CreateDiscountCodeData = {
        code: 'INVALID_DATES',
        discount_type: DiscountType.PERCENTAGE,
        discount_value: 10,
        valid_from: '2027-12-31T00:00:00.000Z',
        valid_until: '2027-01-01T00:00:00.000Z', // Before valid_from
      };

      await expect(repository.create(createData)).rejects.toThrow('valid_from must be before valid_until');
    });
  });

  describe('findByCode', () => {
    it('should find discount code by code using GSI1', async () => {
      const mockItems = [{
        id: 1,
        code: 'TEST20',
        discount_type: DiscountType.PERCENTAGE,
        discount_value: 20,
        times_used: 5,
        is_active: true,
        valid_from: '2026-01-01T00:00:00.000Z',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      }];

      ddbMock.on(QueryCommand).resolves({
        Items: mockItems,
        Count: 1,
      });

      const discountCode = await repository.findByCode('TEST20');

      expect(discountCode).not.toBeNull();
      expect(discountCode?.code).toBe('TEST20');
      expect(discountCode?.times_used).toBe(5);

      // Verify GSI1 was used
      const calls = ddbMock.commandCalls(QueryCommand);
      expect(calls[0].args[0].input.IndexName).toBe('GSI1');
    });

    it('should return null if code not found', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [],
        Count: 0,
      });

      const discountCode = await repository.findByCode('NONEXISTENT');

      expect(discountCode).toBeNull();
    });

    it('should filter out soft-deleted discount codes', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [],
        Count: 0,
      });

      const discountCode = await repository.findByCode('DELETED');

      expect(discountCode).toBeNull();
      
      // Verify filter expression excludes soft-deleted codes
      const calls = ddbMock.commandCalls(QueryCommand);
      expect(calls[0].args[0].input.FilterExpression).toContain('attribute_not_exists(deleted_at)');
    });
  });

  describe('findById', () => {
    it('should find discount code by ID with strongly consistent read', async () => {
      const mockItem = {
        PK: 'DISCOUNT#1',
        SK: 'METADATA',
        id: 1,
        code: 'SAVE10',
        discount_type: DiscountType.FIXED,
        discount_value: 10,
        times_used: 0,
        is_active: true,
        valid_from: '2024-01-01T00:00:00.000Z',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      };

      ddbMock.on(GetCommand).resolves({ Item: mockItem });

      const discountCode = await repository.findById(1);

      expect(discountCode).not.toBeNull();
      expect(discountCode?.id).toBe(1);
      expect(discountCode?.code).toBe('SAVE10');

      // Verify strongly consistent read was used
      const calls = ddbMock.commandCalls(GetCommand);
      expect(calls[0].args[0].input.ConsistentRead).toBe(true);
    });

    it('should return null if discount code not found', async () => {
      ddbMock.on(GetCommand).resolves({ Item: undefined });

      const discountCode = await repository.findById(999);

      expect(discountCode).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should find all active discount codes when filtering by is_active=true', async () => {
      const mockItems = [
        {
          id: 1,
          code: 'ACTIVE1',
          discount_type: DiscountType.PERCENTAGE,
          discount_value: 10,
          times_used: 0,
          is_active: true,
          valid_from: '2024-01-01T00:00:00.000Z',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 2,
          code: 'ACTIVE2',
          discount_type: DiscountType.FIXED,
          discount_value: 5,
          times_used: 10,
          is_active: true,
          valid_from: '2024-01-01T00:00:00.000Z',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
      ];

      ddbMock.on(QueryCommand).resolves({
        Items: mockItems,
        Count: 2,
      });

      const result = await repository.findAll({ is_active: true }, { limit: 10 });

      expect(result.items).toHaveLength(2);
      expect(result.count).toBe(2);

      // Verify GSI2 was used
      const calls = ddbMock.commandCalls(QueryCommand);
      expect(calls[0].args[0].input.IndexName).toBe('GSI2');
      expect(calls[0].args[0].input.ExpressionAttributeValues?.[':gsi2pk']).toBe('DISCOUNT_ACTIVE#true');
    });

    it('should exclude soft-deleted codes', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [],
        Count: 0,
      });

      await repository.findAll({ is_active: true });

      const calls = ddbMock.commandCalls(QueryCommand);
      expect(calls[0].args[0].input.FilterExpression).toContain('attribute_not_exists(deleted_at)');
    });

    it('should default to querying active codes when no filter provided', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [],
        Count: 0,
      });

      await repository.findAll();

      const calls = ddbMock.commandCalls(QueryCommand);
      expect(calls[0].args[0].input.ExpressionAttributeValues?.[':gsi2pk']).toBe('DISCOUNT_ACTIVE#true');
    });
  });

  describe('update', () => {
    it('should update discount code by ID', async () => {
      const updateData: UpdateDiscountCodeData = {
        discount_value: 25,
        description: 'Updated description',
      };

      ddbMock.on(UpdateCommand).resolves({
        Attributes: {
          id: 1,
          code: 'SAVE20',
          description: 'Updated description',
          discount_type: DiscountType.PERCENTAGE,
          discount_value: 25,
          times_used: 0,
          is_active: true,
          valid_from: '2024-01-01T00:00:00.000Z',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: new Date().toISOString(),
        },
      });

      const updated = await repository.update(1, updateData);

      expect(updated).not.toBeNull();
      expect(updated?.discount_value).toBe(25);
      expect(updated?.description).toBe('Updated description');
    });

    it('should throw error when updating code to existing code', async () => {
      const updateData: UpdateDiscountCodeData = {
        code: 'EXISTING',
      };

      // Mock findByCode to return existing code with different ID
      ddbMock.on(QueryCommand).resolves({
        Items: [{
          id: 2,
          code: 'EXISTING',
          discount_type: DiscountType.FIXED,
          discount_value: 10,
          times_used: 0,
          is_active: true,
          valid_from: '2024-01-01T00:00:00.000Z',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        }],
        Count: 1,
      });

      await expect(repository.update(1, updateData)).rejects.toThrow("Discount code 'EXISTING' already exists");
    });

    it('should allow updating code to same value', async () => {
      const updateData: UpdateDiscountCodeData = {
        code: 'SAME',
      };

      // Mock findByCode to return the same discount code
      ddbMock.on(QueryCommand).resolves({
        Items: [{
          id: 1,
          code: 'SAME',
          discount_type: DiscountType.FIXED,
          discount_value: 10,
          times_used: 0,
          is_active: true,
          valid_from: '2024-01-01T00:00:00.000Z',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        }],
        Count: 1,
      });

      ddbMock.on(UpdateCommand).resolves({
        Attributes: {
          id: 1,
          code: 'SAME',
          discount_type: DiscountType.FIXED,
          discount_value: 10,
          times_used: 0,
          is_active: true,
          valid_from: '2024-01-01T00:00:00.000Z',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: new Date().toISOString(),
        },
      });

      const updated = await repository.update(1, updateData);

      expect(updated).not.toBeNull();
      expect(updated?.code).toBe('SAME');
    });

    it('should update GSI2 when is_active changes', async () => {
      const updateData: UpdateDiscountCodeData = {
        is_active: false,
      };

      // Mock findById for GSI2 update
      ddbMock.on(GetCommand).resolves({
        Item: {
          id: 1,
          code: 'TEST',
          discount_type: DiscountType.PERCENTAGE,
          discount_value: 10,
          times_used: 0,
          is_active: true,
          valid_from: '2024-01-01T00:00:00.000Z',
          valid_until: '2024-12-31T23:59:59.999Z',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
      });

      ddbMock.on(UpdateCommand).resolves({
        Attributes: {
          id: 1,
          code: 'TEST',
          discount_type: DiscountType.PERCENTAGE,
          discount_value: 10,
          times_used: 0,
          is_active: false,
          valid_from: '2024-01-01T00:00:00.000Z',
          valid_until: '2024-12-31T23:59:59.999Z',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: new Date().toISOString(),
        },
      });

      const updated = await repository.update(1, updateData);

      expect(updated).not.toBeNull();
      expect(updated?.is_active).toBe(false);
    });

    it('should return null if discount code not found', async () => {
      const updateData: UpdateDiscountCodeData = {
        discount_value: 30,
      };

      ddbMock.on(UpdateCommand).rejects({
        name: 'ConditionalCheckFailedException',
      });

      const updated = await repository.update(999, updateData);

      expect(updated).toBeNull();
    });

    it('should prevent updating soft-deleted discount codes', async () => {
      const updateData: UpdateDiscountCodeData = {
        discount_value: 30,
      };

      // Capture the command that was sent before rejecting
      let capturedCondition: string | undefined;
      ddbMock.on(UpdateCommand).callsFake((input) => {
        if (input.UpdateExpression && !input.UpdateExpression.includes('if_not_exists')) {
          capturedCondition = input.ConditionExpression;
        }
        throw { name: 'ConditionalCheckFailedException' };
      });

      const updated = await repository.update(1, updateData);

      expect(updated).toBeNull();
      expect(capturedCondition).toContain('attribute_not_exists(deleted_at)');
    });

    it('should validate input data during update', async () => {
      const updateData: UpdateDiscountCodeData = {
        discount_value: -10, // Invalid
      };

      await expect(repository.update(1, updateData)).rejects.toThrow('Discount value must be positive');
    });
  });

  describe('softDelete', () => {
    it('should soft delete discount code', async () => {
      const now = new Date().toISOString();
      
      ddbMock.on(UpdateCommand).resolves({
        Attributes: {
          id: 1,
          code: 'DELETE_ME',
          discount_type: DiscountType.PERCENTAGE,
          discount_value: 10,
          times_used: 0,
          is_active: true,
          valid_from: '2024-01-01T00:00:00.000Z',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: now,
          deleted_at: now,
        },
      });

      const deleted = await repository.softDelete(1);

      expect(deleted).not.toBeNull();
      expect(deleted?.deleted_at).toBeDefined();
    });

    it('should return null if discount code not found', async () => {
      ddbMock.on(UpdateCommand).rejects({
        name: 'ConditionalCheckFailedException',
      });

      const deleted = await repository.softDelete(999);

      expect(deleted).toBeNull();
    });
  });

  describe('isValid', () => {
    it('should return true for valid active code', async () => {
      const now = new Date();
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      ddbMock.on(QueryCommand).resolves({
        Items: [{
          id: 1,
          code: 'VALID',
          discount_type: DiscountType.PERCENTAGE,
          discount_value: 10,
          times_used: 0,
          is_active: true,
          valid_from: now.toISOString(),
          valid_until: tomorrow.toISOString(),
          max_uses: 100,
          created_at: now.toISOString(),
          updated_at: now.toISOString(),
        }],
        Count: 1,
      });

      const isValid = await repository.isValid('VALID');

      expect(isValid).toBe(true);
    });

    it('should return false for inactive code', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [{
          id: 1,
          code: 'INACTIVE',
          discount_type: DiscountType.PERCENTAGE,
          discount_value: 10,
          times_used: 0,
          is_active: false,
          valid_from: '2024-01-01T00:00:00.000Z',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        }],
        Count: 1,
      });

      const isValid = await repository.isValid('INACTIVE');

      expect(isValid).toBe(false);
    });

    it('should return false for expired code', async () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

      ddbMock.on(QueryCommand).resolves({
        Items: [{
          id: 1,
          code: 'EXPIRED',
          discount_type: DiscountType.PERCENTAGE,
          discount_value: 10,
          times_used: 0,
          is_active: true,
          valid_from: '2024-01-01T00:00:00.000Z',
          valid_until: yesterday.toISOString(),
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        }],
        Count: 1,
      });

      const isValid = await repository.isValid('EXPIRED');

      expect(isValid).toBe(false);
    });

    it('should return false for code that reached max uses', async () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);

      ddbMock.on(QueryCommand).resolves({
        Items: [{
          id: 1,
          code: 'MAXED',
          discount_type: DiscountType.PERCENTAGE,
          discount_value: 10,
          times_used: 100,
          is_active: true,
          valid_from: '2024-01-01T00:00:00.000Z',
          valid_until: tomorrow.toISOString(),
          max_uses: 100,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        }],
        Count: 1,
      });

      const isValid = await repository.isValid('MAXED');

      expect(isValid).toBe(false);
    });

    it('should return false for soft-deleted code', async () => {
      const now = new Date().toISOString();

      ddbMock.on(QueryCommand).resolves({
        Items: [{
          id: 1,
          code: 'DELETED',
          discount_type: DiscountType.PERCENTAGE,
          discount_value: 10,
          times_used: 0,
          is_active: true,
          valid_from: '2024-01-01T00:00:00.000Z',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: now,
          deleted_at: now,
        }],
        Count: 1,
      });

      const isValid = await repository.isValid('DELETED');

      expect(isValid).toBe(false);
    });

    it('should return false for non-existent code', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [],
        Count: 0,
      });

      const isValid = await repository.isValid('NONEXISTENT');

      expect(isValid).toBe(false);
    });

    it('should return false for code not yet valid', async () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      ddbMock.on(QueryCommand).resolves({
        Items: [{
          id: 1,
          code: 'FUTURE',
          discount_type: DiscountType.PERCENTAGE,
          discount_value: 10,
          times_used: 0,
          is_active: true,
          valid_from: tomorrow.toISOString(),
          valid_until: nextWeek.toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }],
        Count: 1,
      });

      const isValid = await repository.isValid('FUTURE');

      expect(isValid).toBe(false);
    });
  });

  describe('incrementUsage', () => {
    it('should increment usage counter atomically for valid code', async () => {
      const now = new Date();
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      // Mock isValid check (findByCode)
      ddbMock.on(QueryCommand).resolves({
        Items: [{
          id: 1,
          code: 'USE_ME',
          discount_type: DiscountType.PERCENTAGE,
          discount_value: 10,
          times_used: 5,
          is_active: true,
          valid_from: now.toISOString(),
          valid_until: tomorrow.toISOString(),
          max_uses: 100,
          created_at: now.toISOString(),
          updated_at: now.toISOString(),
        }],
        Count: 1,
      });

      // Mock atomic increment
      ddbMock.on(UpdateCommand).resolves({
        Attributes: {
          id: 1,
          code: 'USE_ME',
          discount_type: DiscountType.PERCENTAGE,
          discount_value: 10,
          times_used: 6,
          is_active: true,
          valid_from: now.toISOString(),
          valid_until: tomorrow.toISOString(),
          max_uses: 100,
          created_at: now.toISOString(),
          updated_at: new Date().toISOString(),
        },
      });

      const updated = await repository.incrementUsage('USE_ME');

      expect(updated).not.toBeNull();
      expect(updated?.times_used).toBe(6);

      // Verify atomic ADD operation was used
      const updateCalls = ddbMock.commandCalls(UpdateCommand);
      expect(updateCalls.some(call => 
        call.args[0].input.UpdateExpression?.includes('ADD times_used')
      )).toBe(true);
    });

    it('should return null for invalid code', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [{
          id: 1,
          code: 'INVALID',
          discount_type: DiscountType.PERCENTAGE,
          discount_value: 10,
          times_used: 0,
          is_active: false,
          valid_from: '2026-01-01T00:00:00.000Z',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        }],
        Count: 1,
      });

      // Atomic update will fail due to is_active = false
      ddbMock.on(UpdateCommand).rejects({
        name: 'ConditionalCheckFailedException',
      });

      const updated = await repository.incrementUsage('INVALID');

      expect(updated).toBeNull();
    });

    it('should return null when max uses reached', async () => {
      const now = new Date();
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      ddbMock.on(QueryCommand).resolves({
        Items: [{
          id: 1,
          code: 'MAXED',
          discount_type: DiscountType.PERCENTAGE,
          discount_value: 10,
          times_used: 100,
          is_active: true,
          valid_from: now.toISOString(),
          valid_until: tomorrow.toISOString(),
          max_uses: 100,
          created_at: now.toISOString(),
          updated_at: now.toISOString(),
        }],
        Count: 1,
      });

      // Atomic update will fail due to times_used >= max_uses
      ddbMock.on(UpdateCommand).rejects({
        name: 'ConditionalCheckFailedException',
      });

      const updated = await repository.incrementUsage('MAXED');

      expect(updated).toBeNull();
    });

    it('should handle conditional check failure gracefully', async () => {
      const now = new Date();
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      ddbMock.on(QueryCommand).resolves({
        Items: [{
          id: 1,
          code: 'CONDITIONAL',
          discount_type: DiscountType.PERCENTAGE,
          discount_value: 10,
          times_used: 99,
          is_active: true,
          valid_from: now.toISOString(),
          valid_until: tomorrow.toISOString(),
          max_uses: 100,
          created_at: now.toISOString(),
          updated_at: now.toISOString(),
        }],
        Count: 1,
      });

      ddbMock.on(UpdateCommand).rejects({
        name: 'ConditionalCheckFailedException',
      });

      const updated = await repository.incrementUsage('CONDITIONAL');

      expect(updated).toBeNull();
    });

    it('should validate is_active, expiration, and deleted_at atomically in conditional expression', async () => {
      const now = new Date();
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      ddbMock.on(QueryCommand).resolves({
        Items: [{
          id: 1,
          code: 'ATOMIC_CHECK',
          discount_type: DiscountType.PERCENTAGE,
          discount_value: 10,
          times_used: 5,
          is_active: true,
          valid_from: now.toISOString(),
          valid_until: tomorrow.toISOString(),
          max_uses: 100,
          created_at: now.toISOString(),
          updated_at: now.toISOString(),
        }],
        Count: 1,
      });

      ddbMock.on(UpdateCommand).resolves({
        Attributes: {
          id: 1,
          code: 'ATOMIC_CHECK',
          discount_type: DiscountType.PERCENTAGE,
          discount_value: 10,
          times_used: 6,
          is_active: true,
          valid_from: now.toISOString(),
          valid_until: tomorrow.toISOString(),
          max_uses: 100,
          created_at: now.toISOString(),
          updated_at: new Date().toISOString(),
        },
      });

      await repository.incrementUsage('ATOMIC_CHECK');

      // Verify comprehensive conditional expression
      const updateCalls = ddbMock.commandCalls(UpdateCommand);
      const incrementCall = updateCalls.find(call => 
        call.args[0].input.UpdateExpression?.includes('ADD times_used')
      );
      
      expect(incrementCall?.args[0].input.ConditionExpression).toContain('is_active = :true');
      expect(incrementCall?.args[0].input.ConditionExpression).toContain('attribute_not_exists(deleted_at)');
      expect(incrementCall?.args[0].input.ConditionExpression).toContain('times_used < :max_uses');
    });
  });

  describe('getStats', () => {
    it('should return usage statistics for existing code', async () => {
      const now = new Date();
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      ddbMock.on(QueryCommand).resolves({
        Items: [{
          id: 1,
          code: 'STATS',
          discount_type: DiscountType.PERCENTAGE,
          discount_value: 10,
          times_used: 25,
          is_active: true,
          valid_from: now.toISOString(),
          valid_until: tomorrow.toISOString(),
          max_uses: 100,
          created_at: now.toISOString(),
          updated_at: now.toISOString(),
        }],
        Count: 1,
      });

      const stats = await repository.getStats('STATS');

      expect(stats).not.toBeNull();
      expect(stats?.code).toBe('STATS');
      expect(stats?.times_used).toBe(25);
      expect(stats?.max_uses).toBe(100);
      expect(stats?.usage_percentage).toBe(25);
      expect(stats?.is_active).toBe(true);
      expect(stats?.is_expired).toBe(false);
      expect(stats?.is_max_uses_reached).toBe(false);
    });

    it('should indicate expired code in stats', async () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

      ddbMock.on(QueryCommand).resolves({
        Items: [{
          id: 1,
          code: 'EXPIRED_STATS',
          discount_type: DiscountType.PERCENTAGE,
          discount_value: 10,
          times_used: 10,
          is_active: true,
          valid_from: '2024-01-01T00:00:00.000Z',
          valid_until: yesterday.toISOString(),
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        }],
        Count: 1,
      });

      const stats = await repository.getStats('EXPIRED_STATS');

      expect(stats?.is_expired).toBe(true);
    });

    it('should indicate max uses reached in stats', async () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);

      ddbMock.on(QueryCommand).resolves({
        Items: [{
          id: 1,
          code: 'FULL',
          discount_type: DiscountType.PERCENTAGE,
          discount_value: 10,
          times_used: 50,
          is_active: true,
          valid_from: '2024-01-01T00:00:00.000Z',
          valid_until: tomorrow.toISOString(),
          max_uses: 50,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        }],
        Count: 1,
      });

      const stats = await repository.getStats('FULL');

      expect(stats?.is_max_uses_reached).toBe(true);
      expect(stats?.usage_percentage).toBe(100);
    });

    it('should return undefined usage_percentage when max_uses is not set', async () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);

      ddbMock.on(QueryCommand).resolves({
        Items: [{
          id: 1,
          code: 'UNLIMITED',
          discount_type: DiscountType.PERCENTAGE,
          discount_value: 10,
          times_used: 1000,
          is_active: true,
          valid_from: '2024-01-01T00:00:00.000Z',
          valid_until: tomorrow.toISOString(),
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        }],
        Count: 1,
      });

      const stats = await repository.getStats('UNLIMITED');

      expect(stats?.usage_percentage).toBeUndefined();
      expect(stats?.is_max_uses_reached).toBe(false);
    });

    it('should return null for non-existent code', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [],
        Count: 0,
      });

      const stats = await repository.getStats('NONEXISTENT');

      expect(stats).toBeNull();
    });
  });
});
