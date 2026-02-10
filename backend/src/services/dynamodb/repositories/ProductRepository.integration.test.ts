/**
 * Integration tests for ProductRepository
 * 
 * Note: These tests use mocked DynamoDB client. 
 * For full integration testing with DynamoDB Local, set up a local instance and configure the endpoint.
 */

import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, QueryCommand, PutCommand, DeleteCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBOptimized } from '../DynamoDBOptimized';
import { ProductRepository } from './ProductRepository';
import { ProductStatus, CreateProductData } from './types';

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('ProductRepository Integration Tests', () => {
  let dynamoDB: DynamoDBOptimized;
  let repository: ProductRepository;

  beforeEach(() => {
    ddbMock.reset();
    dynamoDB = new DynamoDBOptimized({
      tableName: 'art-products-test',
      region: 'us-east-1',
      // For real integration tests, uncomment and use DynamoDB Local:
      // endpoint: 'http://localhost:8000',
    });
    repository = new ProductRepository(dynamoDB);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Complete Product Lifecycle', () => {
    it('should create, update, soft-delete, and restore a product', async () => {
      // Setup mocks for create operation
      ddbMock.on(GetCommand).resolves({ Item: undefined });
      ddbMock.on(UpdateCommand).resolves({ Attributes: { value: 1 } });
      ddbMock.on(PutCommand).resolves({});

      // 1. Create product
      const createData: CreateProductData = {
        slug: 'integration-test-product',
        title: 'Integration Test Product',
        short_description: 'A product for integration testing',
        base_price: 99.99,
        currency: 'USD',
        status: ProductStatus.DRAFT,
        character_id: 42,
        character_value: 'Spider-Man',
      };

      const created = await repository.create(createData);
      
      expect(created).toBeDefined();
      expect(created.id).toBe(1);
      expect(created.slug).toBe('integration-test-product');
      expect(created.status).toBe(ProductStatus.DRAFT);
      expect(created.character_id).toBe(42);

      // 2. Find by ID - mock the get response
      ddbMock.on(GetCommand).resolves({
        Item: {
          PK: 'PRODUCT#1',
          SK: 'METADATA',
          ...created,
        },
      });

      const found = await repository.findById(created.id);
      expect(found).toBeDefined();
      expect(found?.title).toBe('Integration Test Product');

      // 3. Update product - mock the update response
      ddbMock.on(UpdateCommand).resolves({
        Attributes: {
          ...created,
          title: 'Updated Integration Test Product',
          status: ProductStatus.PUBLISHED,
          base_price: 129.99,
          updated_at: new Date().toISOString(),
        },
      });

      const updated = await repository.update(created.id, {
        title: 'Updated Integration Test Product',
        status: ProductStatus.PUBLISHED,
        base_price: 129.99,
      });

      expect(updated).toBeDefined();
      expect(updated?.title).toBe('Updated Integration Test Product');
      expect(updated?.status).toBe(ProductStatus.PUBLISHED);

      // 4. Soft delete - mock the soft delete response
      ddbMock.on(UpdateCommand).resolves({
        Attributes: {
          ...created,
          deleted_at: new Date().toISOString(),
        },
      });

      const deleted = await repository.softDelete(created.id);
      expect(deleted).toBeDefined();
      expect(deleted?.deleted_at).toBeDefined();

      // 5. Restore - mock the restore response
      ddbMock.on(GetCommand).resolves({
        Item: {
          ...created,
          deleted_at: '2024-01-01T00:00:00.000Z',
        },
      });
      ddbMock.on(PutCommand).resolves({});

      const restored = await repository.restore(created.id);
      expect(restored).toBeDefined();
      expect(restored?.deleted_at).toBeUndefined();
    });
  });

  describe('Product Categories Relationship', () => {
    it('should manage product-category relationships', async () => {
      const productId = 1;
      const categoryIds = [10, 20, 30];

      // Mock addCategory (Put operations)
      ddbMock.on(PutCommand).resolves({});
      
      // Add categories
      for (const categoryId of categoryIds) {
        const link = await repository.addCategory(productId, categoryId);
        expect(link.product_id).toBe(productId);
        expect(link.category_id).toBe(categoryId);
      }

      // Mock getCategories (Query operation)
      ddbMock.on(QueryCommand).resolves({
        Items: [
          { PK: `PRODUCT#${productId}`, SK: 'CATEGORY#10', product_id: productId, category_id: 10, created_at: '2024-01-01T00:00:00.000Z' },
          { PK: `PRODUCT#${productId}`, SK: 'CATEGORY#20', product_id: productId, category_id: 20, created_at: '2024-01-01T00:00:00.000Z' },
          { PK: `PRODUCT#${productId}`, SK: 'CATEGORY#30', product_id: productId, category_id: 30, created_at: '2024-01-01T00:00:00.000Z' },
        ],
        Count: 3,
        ScannedCount: 3,
      });

      const categories = await repository.getCategories(productId);
      expect(categories).toHaveLength(3);
      expect(categories.map(c => c.category_id)).toEqual(categoryIds);

      // Mock removeCategory (Delete operation)
      ddbMock.on(DeleteCommand).resolves({});
      await repository.removeCategory(productId, categoryIds[0]);

      // Verify the delete was called
      const calls = ddbMock.commandCalls(DeleteCommand);
      expect(calls.length).toBeGreaterThan(0);
    });
  });

  describe('Product Queries', () => {
    it('should query products by status', async () => {
      const publishedProducts = [
        {
          id: 1,
          slug: 'product-1',
          title: 'Product 1',
          status: ProductStatus.PUBLISHED,
          base_price: 29.99,
          currency: 'USD',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 2,
          slug: 'product-2',
          title: 'Product 2',
          status: ProductStatus.PUBLISHED,
          base_price: 39.99,
          currency: 'EUR',
          created_at: '2024-01-02T00:00:00.000Z',
          updated_at: '2024-01-02T00:00:00.000Z',
        },
      ];

      ddbMock.onAnyCommand().resolves({
        Items: publishedProducts,
        Count: 2,
        ScannedCount: 2,
      });

      const result = await repository.findByStatus(ProductStatus.PUBLISHED, { limit: 10 });

      expect(result.items).toHaveLength(2);
      expect(result.count).toBe(2);
      expect(result.items.every(p => p.status === ProductStatus.PUBLISHED)).toBe(true);
    });

    it('should query products by character', async () => {
      const characterProducts = [
        {
          id: 1,
          slug: 'spider-man-comic',
          title: 'Spider-Man Comic',
          status: ProductStatus.PUBLISHED,
          character_id: 42,
          base_price: 19.99,
          currency: 'USD',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
      ];

      ddbMock.onAnyCommand().resolves({
        Items: characterProducts,
        Count: 1,
        ScannedCount: 1,
      });

      const result = await repository.findByCharacter(42);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].character_id).toBe(42);
    });

    it('should search products by term', async () => {
      const searchResults = [
        {
          id: 1,
          slug: 'superman-comic',
          title: 'Superman Comic Book',
          short_description: 'Amazing Superman adventures',
          status: ProductStatus.PUBLISHED,
          base_price: 19.99,
          currency: 'USD',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
      ];

      ddbMock.onAnyCommand().resolves({
        Items: searchResults,
        Count: 1,
        ScannedCount: 10,
      });

      const result = await repository.search('superman');

      expect(result.items).toHaveLength(1);
      expect(result.items[0].title).toContain('Superman');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty search results', async () => {
      ddbMock.onAnyCommand().resolves({
        Items: [],
        Count: 0,
        ScannedCount: 0,
      });

      const result = await repository.search('nonexistent');

      expect(result.items).toHaveLength(0);
      expect(result.count).toBe(0);
    });

    it('should handle pagination correctly', async () => {
      const lastKey = { id: 10, GSI2PK: 'PRODUCT_STATUS#published' };

      ddbMock.onAnyCommand().resolves({
        Items: [{ id: 1, slug: 'test', title: 'Test', base_price: 10, currency: 'USD', status: ProductStatus.PUBLISHED, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' }],
        Count: 1,
        ScannedCount: 1,
        LastEvaluatedKey: lastKey,
      });

      const result1 = await repository.findAll({ limit: 1 });
      expect(result1.lastEvaluatedKey).toEqual(lastKey);
    });
  });
});
