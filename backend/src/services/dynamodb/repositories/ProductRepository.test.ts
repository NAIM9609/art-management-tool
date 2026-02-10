/**
 * Unit tests for ProductRepository
 */

import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBOptimized } from '../DynamoDBOptimized';
import { ProductRepository } from './ProductRepository';
import { ProductStatus, CreateProductData, UpdateProductData } from './types';

// Mock DynamoDB Document Client
const ddbMock = mockClient(DynamoDBDocumentClient);

describe('ProductRepository', () => {
  let dynamoDB: DynamoDBOptimized;
  let repository: ProductRepository;

  beforeEach(() => {
    ddbMock.reset();
    dynamoDB = new DynamoDBOptimized({
      tableName: 'test-table',
      region: 'us-east-1',
    });
    repository = new ProductRepository(dynamoDB);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getNextId', () => {
    it('should return next ID starting from 1', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: undefined,
      });

      ddbMock.on(UpdateCommand).resolves({
        Attributes: { value: 1 },
      });

      const id = await repository.getNextId();
      expect(id).toBe(1);
    });

    it('should increment existing counter', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: { PK: 'COUNTER', SK: 'PRODUCT_ID', value: 5 },
      });

      ddbMock.on(UpdateCommand).resolves({
        Attributes: { value: 6 },
      });

      const id = await repository.getNextId();
      expect(id).toBe(6);
    });
  });

  describe('create', () => {
    it('should create a new product with auto-increment ID', async () => {
      const createData: CreateProductData = {
        slug: 'test-product',
        title: 'Test Product',
        short_description: 'A test product',
        base_price: 29.99,
        currency: 'USD',
        status: ProductStatus.PUBLISHED,
      };

      ddbMock.on(GetCommand).resolves({ Item: undefined });
      ddbMock.on(UpdateCommand).resolves({ Attributes: { value: 1 } });
      ddbMock.on(PutCommand).resolves({});

      const product = await repository.create(createData);

      expect(product.id).toBe(1);
      expect(product.slug).toBe('test-product');
      expect(product.title).toBe('Test Product');
      expect(product.base_price).toBe(29.99);
      expect(product.status).toBe(ProductStatus.PUBLISHED);
      expect(product.created_at).toBeDefined();
      expect(product.updated_at).toBeDefined();
    });

    it('should set default status to DRAFT if not provided', async () => {
      const createData: CreateProductData = {
        slug: 'draft-product',
        title: 'Draft Product',
        base_price: 19.99,
      };

      ddbMock.on(GetCommand).resolves({ Item: undefined });
      ddbMock.on(UpdateCommand).resolves({ Attributes: { value: 2 } });
      ddbMock.on(PutCommand).resolves({});

      const product = await repository.create(createData);

      expect(product.status).toBe(ProductStatus.DRAFT);
      expect(product.currency).toBe('EUR'); // Default currency
    });

    it('should include character_id in GSI3 when provided', async () => {
      const createData: CreateProductData = {
        slug: 'character-product',
        title: 'Character Product',
        base_price: 39.99,
        character_id: 123,
        character_value: 'Superman',
      };

      ddbMock.on(GetCommand).resolves({ Item: undefined });
      ddbMock.on(UpdateCommand).resolves({ Attributes: { value: 3 } });
      
      let putItem: any;
      ddbMock.on(PutCommand).callsFake((input) => {
        putItem = input.Item;
        return {};
      });

      const product = await repository.create(createData);

      expect(product.character_id).toBe(123);
      expect(putItem.GSI3PK).toBe('CHARACTER#123');
      expect(putItem.GSI3SK).toBeDefined();
    });
  });

  describe('findById', () => {
    it('should find product by ID with strongly consistent read', async () => {
      const mockItem = {
        PK: 'PRODUCT#1',
        SK: 'METADATA',
        id: 1,
        slug: 'test-product',
        title: 'Test Product',
        base_price: 29.99,
        currency: 'USD',
        status: ProductStatus.PUBLISHED,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      };

      ddbMock.on(GetCommand).resolves({ Item: mockItem });

      const product = await repository.findById(1);

      expect(product).not.toBeNull();
      expect(product?.id).toBe(1);
      expect(product?.title).toBe('Test Product');
      
      // Verify strongly consistent read was used
      const calls = ddbMock.commandCalls(GetCommand);
      expect(calls[0].args[0].input.ConsistentRead).toBe(true);
    });

    it('should return null if product not found', async () => {
      ddbMock.on(GetCommand).resolves({ Item: undefined });

      const product = await repository.findById(999);

      expect(product).toBeNull();
    });
  });

  describe('findBySlug', () => {
    it('should find product by slug using GSI1', async () => {
      const mockItems = [{
        id: 1,
        slug: 'test-product',
        title: 'Test Product',
        base_price: 29.99,
        currency: 'USD',
        status: ProductStatus.PUBLISHED,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      }];

      ddbMock.on(QueryCommand).resolves({
        Items: mockItems,
        Count: 1,
        ScannedCount: 1,
      });

      const product = await repository.findBySlug('test-product');

      expect(product).not.toBeNull();
      expect(product?.slug).toBe('test-product');
      
      // Verify GSI1 was used
      const calls = ddbMock.commandCalls(QueryCommand);
      expect(calls[0].args[0].input.IndexName).toBe('GSI1');
      expect(calls[0].args[0].input.ConsistentRead).toBe(false);
    });

    it('should return null if slug not found', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [],
        Count: 0,
        ScannedCount: 0,
      });

      const product = await repository.findBySlug('nonexistent');

      expect(product).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should find all published products with pagination', async () => {
      const mockItems = [
        {
          id: 1,
          slug: 'product-1',
          title: 'Product 1',
          base_price: 29.99,
          currency: 'USD',
          status: ProductStatus.PUBLISHED,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 2,
          slug: 'product-2',
          title: 'Product 2',
          base_price: 39.99,
          currency: 'EUR',
          status: ProductStatus.PUBLISHED,
          created_at: '2024-01-02T00:00:00.000Z',
          updated_at: '2024-01-02T00:00:00.000Z',
        },
      ];

      ddbMock.on(QueryCommand).resolves({
        Items: mockItems,
        Count: 2,
        ScannedCount: 2,
        LastEvaluatedKey: { id: 2 },
      });

      const result = await repository.findAll({ limit: 10 });

      expect(result.items).toHaveLength(2);
      expect(result.count).toBe(2);
      expect(result.lastEvaluatedKey).toEqual({ id: 2 });
      
      // Verify GSI2 was used with projection
      const calls = ddbMock.commandCalls(QueryCommand);
      expect(calls[0].args[0].input.IndexName).toBe('GSI2');
      expect(calls[0].args[0].input.ProjectionExpression).toBeDefined();
    });

    it('should use default limit of 30', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [],
        Count: 0,
        ScannedCount: 0,
      });

      await repository.findAll();

      const calls = ddbMock.commandCalls(QueryCommand);
      expect(calls[0].args[0].input.Limit).toBe(30);
    });
  });

  describe('update', () => {
    it('should update product fields', async () => {
      const updateData: UpdateProductData = {
        title: 'Updated Title',
        base_price: 49.99,
        status: ProductStatus.ARCHIVED,
      };

      ddbMock.on(GetCommand).resolves({
        Item: {
          id: 1,
          slug: 'test-product',
          title: 'Old Title',
          base_price: 29.99,
          currency: 'USD',
          status: ProductStatus.PUBLISHED,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
      });

      ddbMock.on(UpdateCommand).resolves({
        Attributes: {
          id: 1,
          slug: 'test-product',
          title: 'Updated Title',
          base_price: 49.99,
          currency: 'USD',
          status: ProductStatus.ARCHIVED,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-02T00:00:00.000Z',
        },
      });

      const product = await repository.update(1, updateData);

      expect(product?.title).toBe('Updated Title');
      expect(product?.base_price).toBe(49.99);
      expect(product?.status).toBe(ProductStatus.ARCHIVED);
    });

    it('should update GSI2 when status or title changes', async () => {
      const updateData: UpdateProductData = {
        status: ProductStatus.ARCHIVED,
      };

      ddbMock.on(GetCommand).resolves({
        Item: {
          id: 1,
          slug: 'test-product',
          title: 'Test Title',
          status: ProductStatus.PUBLISHED,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
      });

      let updateExpression: any;
      ddbMock.on(UpdateCommand).callsFake((input) => {
        updateExpression = input;
        return {
          Attributes: {
            id: 1,
            status: ProductStatus.ARCHIVED,
          },
        };
      });

      await repository.update(1, updateData);

      expect(updateExpression.ExpressionAttributeValues[':upd2']).toBe('PRODUCT_STATUS#archived');
    });

    it('should return null if product does not exist', async () => {
      ddbMock.on(GetCommand).resolves({ Item: undefined });
      ddbMock.on(UpdateCommand).rejects({ name: 'ConditionalCheckFailedException' });

      const product = await repository.update(999, { title: 'New Title' });

      expect(product).toBeNull();
    });
  });

  describe('softDelete', () => {
    it('should soft delete product by setting deleted_at', async () => {
      ddbMock.on(UpdateCommand).resolves({
        Attributes: {
          id: 1,
          slug: 'test-product',
          title: 'Test Product',
          status: ProductStatus.PUBLISHED,
          deleted_at: '2024-01-02T00:00:00.000Z',
        },
      });

      const product = await repository.softDelete(1);

      expect(product).not.toBeNull();
      expect(product?.deleted_at).toBeDefined();
    });

    it('should return null if product does not exist', async () => {
      ddbMock.on(UpdateCommand).rejects({ name: 'ConditionalCheckFailedException' });

      const product = await repository.softDelete(999);

      expect(product).toBeNull();
    });
  });

  describe('restore', () => {
    it('should restore soft-deleted product', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: {
          id: 1,
          slug: 'test-product',
          title: 'Test Product',
          status: ProductStatus.PUBLISHED,
          deleted_at: '2024-01-02T00:00:00.000Z',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
      });

      ddbMock.on(PutCommand).resolves({});

      const product = await repository.restore(1);

      expect(product).not.toBeNull();
      expect(product?.deleted_at).toBeUndefined();
    });

    it('should return null if product is not deleted', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: {
          id: 1,
          slug: 'test-product',
          title: 'Test Product',
          status: ProductStatus.PUBLISHED,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
      });

      const product = await repository.restore(1);

      expect(product).toBeNull();
    });

    it('should return null if product does not exist', async () => {
      ddbMock.on(GetCommand).resolves({ Item: undefined });

      const product = await repository.restore(999);

      expect(product).toBeNull();
    });
  });

  describe('getCategories', () => {
    it('should get all categories for a product', async () => {
      const mockItems = [
        {
          PK: 'PRODUCT#1',
          SK: 'CATEGORY#10',
          product_id: 1,
          category_id: 10,
          created_at: '2024-01-01T00:00:00.000Z',
        },
        {
          PK: 'PRODUCT#1',
          SK: 'CATEGORY#20',
          product_id: 1,
          category_id: 20,
          created_at: '2024-01-01T00:00:00.000Z',
        },
      ];

      ddbMock.on(QueryCommand).resolves({
        Items: mockItems,
        Count: 2,
        ScannedCount: 2,
      });

      const categories = await repository.getCategories(1);

      expect(categories).toHaveLength(2);
      expect(categories[0].category_id).toBe(10);
      expect(categories[1].category_id).toBe(20);
    });

    it('should return empty array if no categories', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [],
        Count: 0,
        ScannedCount: 0,
      });

      const categories = await repository.getCategories(1);

      expect(categories).toHaveLength(0);
    });
  });

  describe('addCategory', () => {
    it('should add category to product', async () => {
      ddbMock.on(PutCommand).resolves({});

      const link = await repository.addCategory(1, 10);

      expect(link.product_id).toBe(1);
      expect(link.category_id).toBe(10);
      expect(link.created_at).toBeDefined();
    });
  });

  describe('removeCategory', () => {
    it('should remove category from product', async () => {
      ddbMock.on(DeleteCommand).resolves({});

      await repository.removeCategory(1, 10);

      const calls = ddbMock.commandCalls(DeleteCommand);
      expect(calls).toHaveLength(1);
      expect(calls[0].args[0].input.Key).toEqual({
        PK: 'PRODUCT#1',
        SK: 'CATEGORY#10',
      });
    });
  });

  describe('findByStatus', () => {
    it('should find products by status using GSI2', async () => {
      const mockItems = [
        {
          id: 1,
          slug: 'draft-1',
          title: 'Draft 1',
          status: ProductStatus.DRAFT,
          base_price: 29.99,
          currency: 'USD',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
      ];

      ddbMock.on(QueryCommand).resolves({
        Items: mockItems,
        Count: 1,
        ScannedCount: 1,
      });

      const result = await repository.findByStatus(ProductStatus.DRAFT);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].status).toBe(ProductStatus.DRAFT);
      
      const calls = ddbMock.commandCalls(QueryCommand);
      expect(calls[0].args[0].input.IndexName).toBe('GSI2');
    });
  });

  describe('findByCharacter', () => {
    it('should find products by character using GSI3', async () => {
      const mockItems = [
        {
          id: 1,
          slug: 'superman-product',
          title: 'Superman Product',
          status: ProductStatus.PUBLISHED,
          character_id: 123,
          base_price: 39.99,
          currency: 'USD',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
      ];

      ddbMock.on(QueryCommand).resolves({
        Items: mockItems,
        Count: 1,
        ScannedCount: 1,
      });

      const result = await repository.findByCharacter(123);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].character_id).toBe(123);
      
      const calls = ddbMock.commandCalls(QueryCommand);
      expect(calls[0].args[0].input.IndexName).toBe('GSI3');
    });
  });

  describe('search', () => {
    it('should search products by term in title and description', async () => {
      const mockItems = [
        {
          id: 1,
          slug: 'superman-comic',
          title: 'Superman Comic Book',
          short_description: 'A great comic about Superman',
          status: ProductStatus.PUBLISHED,
          base_price: 19.99,
          currency: 'USD',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
      ];

      ddbMock.on(QueryCommand).resolves({
        Items: mockItems,
        Count: 1,
        ScannedCount: 5,
      });

      const result = await repository.search('superman');

      expect(result.items).toHaveLength(1);
      expect(result.items[0].title).toContain('Superman');
      
      const calls = ddbMock.commandCalls(QueryCommand);
      expect(calls[0].args[0].input.FilterExpression).toContain('contains');
    });
  });

  describe('mapToProduct', () => {
    it('should map DynamoDB item to Product interface', () => {
      const item = {
        id: 1,
        slug: 'test-product',
        title: 'Test Product',
        short_description: 'A test',
        base_price: 29.99,
        currency: 'USD',
        status: ProductStatus.PUBLISHED,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      };

      const product = repository.mapToProduct(item);

      expect(product.id).toBe(1);
      expect(product.slug).toBe('test-product');
      expect(product.title).toBe('Test Product');
    });
  });

  describe('buildProductItem', () => {
    it('should build DynamoDB item with correct keys and GSIs', () => {
      const product = {
        id: 1,
        slug: 'test-product',
        title: 'Test Product',
        base_price: 29.99,
        currency: 'USD',
        status: ProductStatus.PUBLISHED,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      };

      const item = repository.buildProductItem(product);

      expect(item.PK).toBe('PRODUCT#1');
      expect(item.SK).toBe('METADATA');
      expect(item.GSI1PK).toBe('PRODUCT_SLUG#test-product');
      expect(item.GSI2PK).toBe('PRODUCT_STATUS#published');
      expect(item.GSI2SK).toBe('Test Product#1');
    });

    it('should include GSI3 when character_id is present', () => {
      const product = {
        id: 1,
        slug: 'test-product',
        title: 'Test Product',
        base_price: 29.99,
        currency: 'USD',
        status: ProductStatus.PUBLISHED,
        character_id: 123,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      };

      const item = repository.buildProductItem(product);

      expect(item.GSI3PK).toBe('CHARACTER#123');
      expect(item.GSI3SK).toBe(product.created_at);
    });

    it('should not include GSI3 when character_id is not present', () => {
      const product = {
        id: 1,
        slug: 'test-product',
        title: 'Test Product',
        base_price: 29.99,
        currency: 'USD',
        status: ProductStatus.PUBLISHED,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      };

      const item = repository.buildProductItem(product);

      expect(item.GSI3PK).toBeUndefined();
      expect(item.GSI3SK).toBeUndefined();
    });
  });
});
