/**
 * Unit tests for ProductVariantRepository
 */

import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, QueryCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBOptimized } from '../DynamoDBOptimized';
import { ProductVariantRepository } from './ProductVariantRepository';
import { CreateProductVariantData, UpdateProductVariantData } from './types';

// Mock DynamoDB Document Client
const ddbMock = mockClient(DynamoDBDocumentClient);

describe('ProductVariantRepository', () => {
  let dynamoDB: DynamoDBOptimized;
  let repository: ProductVariantRepository;

  beforeEach(() => {
    ddbMock.reset();
    dynamoDB = new DynamoDBOptimized({
      tableName: 'test-table',
      region: 'us-east-1',
    });
    repository = new ProductVariantRepository(dynamoDB);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new product variant', async () => {
      const createData: CreateProductVariantData = {
        product_id: 1,
        sku: 'TEST-SKU-001',
        name: 'Small Red Variant',
        attributes: { size: 'S', color: 'red' },
        price_adjustment: 5.00,
        stock: 10,
      };

      ddbMock.on(PutCommand).resolves({});

      const variant = await repository.create(createData);

      expect(variant.id).toBeDefined();
      expect(variant.product_id).toBe(1);
      expect(variant.sku).toBe('TEST-SKU-001');
      expect(variant.name).toBe('Small Red Variant');
      expect(variant.attributes).toEqual({ size: 'S', color: 'red' });
      expect(variant.price_adjustment).toBe(5.00);
      expect(variant.stock).toBe(10);
      expect(variant.created_at).toBeDefined();
      expect(variant.updated_at).toBeDefined();
    });

    it('should set default values for optional fields', async () => {
      const createData: CreateProductVariantData = {
        product_id: 1,
        sku: 'TEST-SKU-002',
        name: 'Basic Variant',
      };

      ddbMock.on(PutCommand).resolves({});

      const variant = await repository.create(createData);

      expect(variant.price_adjustment).toBe(0);
      expect(variant.stock).toBe(0);
      expect(variant.attributes).toBeUndefined();
    });

    it('should create variant item with correct DynamoDB structure', async () => {
      const createData: CreateProductVariantData = {
        product_id: 1,
        sku: 'TEST-SKU-003',
        name: 'Test Variant',
        stock: 5,
      };

      let putItem: any;
      ddbMock.on(PutCommand).callsFake((input) => {
        putItem = input.Item;
        return {};
      });

      await repository.create(createData);

      expect(putItem.PK).toBe('PRODUCT#1');
      expect(putItem.SK).toMatch(/^VARIANT#/);
      expect(putItem.entity_type).toBe('ProductVariant');
      expect(putItem.GSI1PK).toBe('VARIANT_SKU#TEST-SKU-003');
      expect(putItem.GSI1SK).toBe('1');
    });

    it('should throw error if stock is negative', async () => {
      const createData: CreateProductVariantData = {
        product_id: 1,
        sku: 'TEST-SKU-004',
        name: 'Invalid Variant',
        stock: -5,
      };

      await expect(repository.create(createData)).rejects.toThrow('Stock cannot be negative');
    });
  });

  describe('findById', () => {
    it('should find variant by ID using GSI1 query', async () => {
      const mockItems = [{
        id: '123',
        product_id: 1,
        sku: 'TEST-SKU-001',
        name: 'Test Variant',
        price_adjustment: 0,
        stock: 10,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      }];

      ddbMock.on(QueryCommand).resolves({
        Items: mockItems,
        Count: 1,
        ScannedCount: 1,
      });

      const variant = await repository.findById('123');

      expect(variant).not.toBeNull();
      expect(variant?.id).toBe('123');
    });

    it('should return null if variant not found', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [],
        Count: 0,
        ScannedCount: 0,
      });

      const variant = await repository.findById('999');

      expect(variant).toBeNull();
    });
  });

  describe('findByIdAndProductId', () => {
    it('should find variant by ID and product ID with strongly consistent read', async () => {
      const mockItem = {
        PK: 'PRODUCT#1',
        SK: 'VARIANT#123',
        entity_type: 'ProductVariant',
        id: '123',
        product_id: 1,
        sku: 'TEST-SKU-001',
        name: 'Test Variant',
        price_adjustment: 5.00,
        stock: 10,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      };

      ddbMock.on(GetCommand).resolves({ Item: mockItem });

      const variant = await repository.findByIdAndProductId('123', 1);

      expect(variant).not.toBeNull();
      expect(variant?.id).toBe('123');
      expect(variant?.product_id).toBe(1);
      expect(variant?.sku).toBe('TEST-SKU-001');
      
      // Verify strongly consistent read was used
      const calls = ddbMock.commandCalls(GetCommand);
      expect(calls[0].args[0].input.ConsistentRead).toBe(true);
    });

    it('should return null if variant not found', async () => {
      ddbMock.on(GetCommand).resolves({ Item: undefined });

      const variant = await repository.findByIdAndProductId('999', 1);

      expect(variant).toBeNull();
    });
  });

  describe('findByProductId', () => {
    it('should find all variants for a product', async () => {
      const mockItems = [
        {
          id: '123',
          product_id: 1,
          sku: 'VAR-001',
          name: 'Variant 1',
          price_adjustment: 0,
          stock: 5,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
        {
          id: '124',
          product_id: 1,
          sku: 'VAR-002',
          name: 'Variant 2',
          price_adjustment: 10,
          stock: 3,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
      ];

      ddbMock.on(QueryCommand).resolves({
        Items: mockItems,
        Count: 2,
        ScannedCount: 2,
      });

      const variants = await repository.findByProductId(1);

      expect(variants).toHaveLength(2);
      expect(variants[0].sku).toBe('VAR-001');
      expect(variants[1].sku).toBe('VAR-002');
      
      // Verify query parameters
      const calls = ddbMock.commandCalls(QueryCommand);
      expect(calls[0].args[0].input.ConsistentRead).toBe(false);
      expect(calls[0].args[0].input.KeyConditionExpression).toContain('PK = :pk');
      expect(calls[0].args[0].input.KeyConditionExpression).toContain('begins_with(SK, :sk)');
    });

    it('should return empty array if no variants found', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [],
        Count: 0,
        ScannedCount: 0,
      });

      const variants = await repository.findByProductId(999);

      expect(variants).toHaveLength(0);
    });

    it('should exclude soft-deleted variants', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [],
        Count: 0,
        ScannedCount: 0,
      });

      await repository.findByProductId(1);

      const calls = ddbMock.commandCalls(QueryCommand);
      expect(calls[0].args[0].input.FilterExpression).toContain('attribute_not_exists(deleted_at)');
    });
  });

  describe('findBySku', () => {
    it('should find variant by SKU using GSI1', async () => {
      const mockItems = [{
        id: '123',
        product_id: 1,
        sku: 'UNIQUE-SKU-001',
        name: 'Test Variant',
        price_adjustment: 5,
        stock: 10,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      }];

      ddbMock.on(QueryCommand).resolves({
        Items: mockItems,
        Count: 1,
        ScannedCount: 1,
      });

      const variant = await repository.findBySku('UNIQUE-SKU-001');

      expect(variant).not.toBeNull();
      expect(variant?.sku).toBe('UNIQUE-SKU-001');
      
      // Verify GSI1 was used
      const calls = ddbMock.commandCalls(QueryCommand);
      expect(calls[0].args[0].input.IndexName).toBe('GSI1');
      expect(calls[0].args[0].input.ConsistentRead).toBe(false);
    });

    it('should return null if SKU not found', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [],
        Count: 0,
        ScannedCount: 0,
      });

      const variant = await repository.findBySku('NONEXISTENT-SKU');

      expect(variant).toBeNull();
    });
  });

  describe('update', () => {
    it('should update variant fields', async () => {
      const updateData: UpdateProductVariantData = {
        name: 'Updated Variant Name',
        price_adjustment: 15.00,
        stock: 20,
      };

      ddbMock.on(UpdateCommand).resolves({
        Attributes: {
          id: '123',
          product_id: 1,
          sku: 'TEST-SKU-001',
          name: 'Updated Variant Name',
          price_adjustment: 15.00,
          stock: 20,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-02T00:00:00.000Z',
        },
      });

      const variant = await repository.update('123', 1, updateData);

      expect(variant?.name).toBe('Updated Variant Name');
      expect(variant?.price_adjustment).toBe(15.00);
      expect(variant?.stock).toBe(20);
    });

    it('should update GSI1 when SKU changes', async () => {
      const updateData: UpdateProductVariantData = {
        sku: 'NEW-SKU-001',
      };

      let updateExpression: any;
      ddbMock.on(UpdateCommand).callsFake((input) => {
        updateExpression = input;
        return {
          Attributes: {
            id: '123',
            product_id: 1,
            sku: 'NEW-SKU-001',
            name: 'Test Variant',
            price_adjustment: 0,
            stock: 10,
          },
        };
      });

      await repository.update('123', 1, updateData);

      expect(Object.values(updateExpression.ExpressionAttributeValues)).toContain('VARIANT_SKU#NEW-SKU-001');
    });

    it('should return null if variant does not exist', async () => {
      ddbMock.on(UpdateCommand).rejects({ name: 'ConditionalCheckFailedException' });

      const variant = await repository.update('999', 1, { name: 'New Name' });

      expect(variant).toBeNull();
    });

    it('should not update soft-deleted variant', async () => {
      ddbMock.on(UpdateCommand).rejects({ name: 'ConditionalCheckFailedException' });

      const variant = await repository.update('123', 1, { name: 'New Name' });

      expect(variant).toBeNull();
      
      const calls = ddbMock.commandCalls(UpdateCommand);
      expect(calls[0].args[0].input.ConditionExpression).toContain('attribute_not_exists(deleted_at)');
    });

    it('should throw error if stock is negative', async () => {
      const updateData: UpdateProductVariantData = {
        stock: -10,
      };

      await expect(repository.update('123', 1, updateData)).rejects.toThrow('Stock cannot be negative');
    });
  });

  describe('softDelete', () => {
    it('should soft delete variant by setting deleted_at', async () => {
      ddbMock.on(UpdateCommand).resolves({
        Attributes: {
          id: '123',
          product_id: 1,
          sku: 'TEST-SKU-001',
          name: 'Test Variant',
          price_adjustment: 0,
          stock: 10,
          deleted_at: '2024-01-02T00:00:00.000Z',
        },
      });

      const variant = await repository.softDelete('123', 1);

      expect(variant).not.toBeNull();
      expect(variant?.deleted_at).toBeDefined();
    });

    it('should return null if variant does not exist', async () => {
      ddbMock.on(UpdateCommand).rejects({ name: 'ConditionalCheckFailedException' });

      const variant = await repository.softDelete('999', 1);

      expect(variant).toBeNull();
    });
  });

  describe('batchCreate', () => {
    it('should batch create multiple variants', async () => {
      const variants: CreateProductVariantData[] = [
        {
          product_id: 1,
          sku: 'VAR-001',
          name: 'Variant 1',
          stock: 5,
        },
        {
          product_id: 1,
          sku: 'VAR-002',
          name: 'Variant 2',
          stock: 10,
        },
        {
          product_id: 1,
          sku: 'VAR-003',
          name: 'Variant 3',
          stock: 15,
        },
      ];

      ddbMock.on(BatchWriteCommand).resolves({});

      const created = await repository.batchCreate(variants);

      expect(created).toHaveLength(3);
      expect(created[0].sku).toBe('VAR-001');
      expect(created[1].sku).toBe('VAR-002');
      expect(created[2].sku).toBe('VAR-003');
      
      // Verify batch write was called
      const calls = ddbMock.commandCalls(BatchWriteCommand);
      expect(calls).toHaveLength(1);
    });

    it('should return empty array for empty input', async () => {
      const created = await repository.batchCreate([]);

      expect(created).toHaveLength(0);
      
      // Verify batch write was not called
      const calls = ddbMock.commandCalls(BatchWriteCommand);
      expect(calls).toHaveLength(0);
    });

    it('should throw error if more than 25 variants', async () => {
      const variants: CreateProductVariantData[] = Array(26).fill(null).map((_, i) => ({
        product_id: 1,
        sku: `VAR-${i}`,
        name: `Variant ${i}`,
      }));

      await expect(repository.batchCreate(variants)).rejects.toThrow('Batch create supports up to 25 variants');
    });

    it('should create exactly 25 variants in one batch', async () => {
      const variants: CreateProductVariantData[] = Array(25).fill(null).map((_, i) => ({
        product_id: 1,
        sku: `VAR-${i}`,
        name: `Variant ${i}`,
      }));

      ddbMock.on(BatchWriteCommand).resolves({});

      const created = await repository.batchCreate(variants);

      expect(created).toHaveLength(25);
      
      const calls = ddbMock.commandCalls(BatchWriteCommand);
      expect(calls).toHaveLength(1);
    });
  });

  describe('updateStock', () => {
    it('should update stock atomically', async () => {
      ddbMock.on(UpdateCommand).resolves({
        Attributes: {
          id: '123',
          product_id: 1,
          sku: 'TEST-SKU-001',
          name: 'Test Variant',
          price_adjustment: 0,
          stock: 50,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-02T00:00:00.000Z',
        },
      });

      const variant = await repository.updateStock('123', 1, 50);

      expect(variant?.stock).toBe(50);
    });

    it('should return null if variant does not exist', async () => {
      ddbMock.on(UpdateCommand).rejects({ name: 'ConditionalCheckFailedException' });

      const variant = await repository.updateStock('999', 1, 50);

      expect(variant).toBeNull();
    });

    it('should throw error if quantity is negative', async () => {
      await expect(repository.updateStock('123', 1, -10)).rejects.toThrow('Stock quantity cannot be negative');
    });
  });

  describe('decrementStock', () => {
    it('should decrement stock atomically', async () => {
      ddbMock.on(UpdateCommand).resolves({
        Attributes: {
          id: '123',
          product_id: 1,
          sku: 'TEST-SKU-001',
          name: 'Test Variant',
          price_adjustment: 0,
          stock: 7,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-02T00:00:00.000Z',
        },
      });

      const variant = await repository.decrementStock('123', 1, 3);

      expect(variant?.stock).toBe(7);
      
      const calls = ddbMock.commandCalls(UpdateCommand);
      expect(calls[0].args[0].input.UpdateExpression).toContain('SET stock = stock - :quantity');
    });

    it('should fail if stock would go below 0', async () => {
      ddbMock.on(UpdateCommand).rejects({ name: 'ConditionalCheckFailedException' });

      const variant = await repository.decrementStock('123', 1, 100);

      expect(variant).toBeNull();
      
      const calls = ddbMock.commandCalls(UpdateCommand);
      expect(calls[0].args[0].input.ConditionExpression).toContain('stock >= :quantity');
    });

    it('should return null if variant does not exist', async () => {
      ddbMock.on(UpdateCommand).rejects({ name: 'ConditionalCheckFailedException' });

      const variant = await repository.decrementStock('999', 1, 1);

      expect(variant).toBeNull();
    });

    it('should check that variant is not deleted', async () => {
      ddbMock.on(UpdateCommand).rejects({ name: 'ConditionalCheckFailedException' });

      await repository.decrementStock('123', 1, 1);

      const calls = ddbMock.commandCalls(UpdateCommand);
      expect(calls[0].args[0].input.ConditionExpression).toContain('attribute_not_exists(deleted_at)');
    });

    it('should throw error if quantity is not positive', async () => {
      await expect(repository.decrementStock('123', 1, 0)).rejects.toThrow('Decrement quantity must be positive');
      await expect(repository.decrementStock('123', 1, -5)).rejects.toThrow('Decrement quantity must be positive');
    });
  });

  describe('incrementStock', () => {
    it('should increment stock atomically', async () => {
      ddbMock.on(UpdateCommand).resolves({
        Attributes: {
          id: '123',
          product_id: 1,
          sku: 'TEST-SKU-001',
          name: 'Test Variant',
          price_adjustment: 0,
          stock: 13,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-02T00:00:00.000Z',
        },
      });

      const variant = await repository.incrementStock('123', 1, 3);

      expect(variant?.stock).toBe(13);
      
      const calls = ddbMock.commandCalls(UpdateCommand);
      expect(calls[0].args[0].input.UpdateExpression).toContain('SET stock = stock + :quantity');
    });

    it('should return null if variant does not exist', async () => {
      ddbMock.on(UpdateCommand).rejects({ name: 'ConditionalCheckFailedException' });

      const variant = await repository.incrementStock('999', 1, 10);

      expect(variant).toBeNull();
    });

    it('should check that variant is not deleted', async () => {
      ddbMock.on(UpdateCommand).rejects({ name: 'ConditionalCheckFailedException' });

      await repository.incrementStock('123', 1, 5);

      const calls = ddbMock.commandCalls(UpdateCommand);
      expect(calls[0].args[0].input.ConditionExpression).toContain('attribute_not_exists(deleted_at)');
    });

    it('should throw error if quantity is not positive', async () => {
      await expect(repository.incrementStock('123', 1, 0)).rejects.toThrow('Increment quantity must be positive');
      await expect(repository.incrementStock('123', 1, -5)).rejects.toThrow('Increment quantity must be positive');
    });
  });

  describe('mapToVariant', () => {
    it('should map DynamoDB item to ProductVariant interface', () => {
      const item = {
        id: '123',
        product_id: 1,
        sku: 'TEST-SKU-001',
        name: 'Test Variant',
        attributes: { size: 'M' },
        price_adjustment: 5.00,
        stock: 10,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      };

      const variant = repository.mapToVariant(item);

      expect(variant.id).toBe('123');
      expect(variant.product_id).toBe(1);
      expect(variant.sku).toBe('TEST-SKU-001');
      expect(variant.name).toBe('Test Variant');
      expect(variant.attributes).toEqual({ size: 'M' });
      expect(variant.price_adjustment).toBe(5.00);
      expect(variant.stock).toBe(10);
    });
  });

  describe('buildVariantItem', () => {
    it('should build DynamoDB item with correct keys and GSIs', () => {
      const variant = {
        id: '123',
        product_id: 1,
        sku: 'TEST-SKU-001',
        name: 'Test Variant',
        price_adjustment: 5.00,
        stock: 10,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      };

      const item = repository.buildVariantItem(variant);

      expect(item.PK).toBe('PRODUCT#1');
      expect(item.SK).toBe('VARIANT#123');
      expect(item.entity_type).toBe('ProductVariant');
      expect(item.GSI1PK).toBe('VARIANT_SKU#TEST-SKU-001');
      expect(item.GSI1SK).toBe('1');
    });

    it('should include optional attributes field when present', () => {
      const variant = {
        id: '123',
        product_id: 1,
        sku: 'TEST-SKU-001',
        name: 'Test Variant',
        attributes: { size: 'L', color: 'blue' },
        price_adjustment: 0,
        stock: 5,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      };

      const item = repository.buildVariantItem(variant);

      expect(item.attributes).toEqual({ size: 'L', color: 'blue' });
    });

    it('should not include attributes field when undefined', () => {
      const variant = {
        id: '123',
        product_id: 1,
        sku: 'TEST-SKU-001',
        name: 'Test Variant',
        price_adjustment: 0,
        stock: 5,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      };

      const item = repository.buildVariantItem(variant);

      expect(item.attributes).toBeUndefined();
    });
  });
});
