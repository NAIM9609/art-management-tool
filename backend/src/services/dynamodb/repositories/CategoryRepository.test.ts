/**
 * Unit tests for CategoryRepository
 */

import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, QueryCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBOptimized } from '../DynamoDBOptimized';
import { CategoryRepository } from './CategoryRepository';
import { CreateCategoryData, UpdateCategoryData } from './types';

// Mock DynamoDB Document Client
const ddbMock = mockClient(DynamoDBDocumentClient);

describe('CategoryRepository', () => {
  let dynamoDB: DynamoDBOptimized;
  let repository: CategoryRepository;

  beforeEach(() => {
    ddbMock.reset();
    dynamoDB = new DynamoDBOptimized({
      tableName: 'test-table',
      region: 'us-east-1',
    });
    repository = new CategoryRepository(dynamoDB);
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
        Attributes: { value: 5 },
      });

      const id = await repository.getNextId();
      expect(id).toBe(5);
    });
  });

  describe('create', () => {
    it('should create a new category with auto-increment ID', async () => {
      const createData: CreateCategoryData = {
        name: 'Test Category',
        slug: 'test-category',
        description: 'A test category',
      };

      ddbMock.on(QueryCommand).resolves({ Items: [] }); // No existing slug
      ddbMock.on(UpdateCommand).resolves({ Attributes: { value: 1 } });
      ddbMock.on(PutCommand).resolves({});

      const category = await repository.create(createData);

      expect(category.id).toBe(1);
      expect(category.name).toBe('Test Category');
      expect(category.slug).toBe('test-category');
      expect(category.description).toBe('A test category');
      expect(category.created_at).toBeDefined();
      expect(category.updated_at).toBeDefined();
    });

    it('should throw error if slug already exists', async () => {
      const createData: CreateCategoryData = {
        name: 'Duplicate Category',
        slug: 'existing-slug',
      };

      ddbMock.on(QueryCommand).resolves({
        Items: [{
          id: 5,
          name: 'Existing Category',
          slug: 'existing-slug',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        }],
      });

      await expect(repository.create(createData)).rejects.toThrow(
        "Category with slug 'existing-slug' already exists"
      );
    });

    it('should create category with parent_id', async () => {
      const createData: CreateCategoryData = {
        name: 'Child Category',
        slug: 'child-category',
        parent_id: 1,
      };

      ddbMock.on(QueryCommand).resolves({ Items: [] });
      ddbMock.on(GetCommand).resolves({
        Item: {
          id: 1,
          name: 'Parent Category',
          slug: 'parent-category',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
      });
      ddbMock.on(UpdateCommand).resolves({ Attributes: { value: 2 } });
      ddbMock.on(PutCommand).resolves({});

      const category = await repository.create(createData);

      expect(category.parent_id).toBe(1);
    });

    it('should prevent circular parent reference', async () => {
      const createData: CreateCategoryData = {
        name: 'Circular Category',
        slug: 'circular-category',
        parent_id: 1,
      };

      // Mock to simulate circular reference
      ddbMock.on(QueryCommand).resolves({ Items: [] });
      ddbMock.on(UpdateCommand).resolves({ Attributes: { value: 2 } });
      ddbMock.on(GetCommand).resolves({
        Item: {
          id: 1,
          name: 'Parent Category',
          slug: 'parent-category',
          parent_id: 2, // Points back to the category being created
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
      });

      await expect(repository.create(createData)).rejects.toThrow(
        'Cannot create category: circular parent reference detected'
      );
    });

    it('should prevent self-referencing parent', async () => {
      const createData: CreateCategoryData = {
        name: 'Self Reference',
        slug: 'self-reference',
        parent_id: 1,
      };

      ddbMock.on(QueryCommand).resolves({ Items: [] });
      ddbMock.on(UpdateCommand).resolves({ Attributes: { value: 1 } });
      
      // This will detect self-reference during circular check
      await expect(repository.create(createData)).rejects.toThrow(
        'Cannot create category: circular parent reference detected'
      );
    });
  });

  describe('findById', () => {
    it('should find category by ID', async () => {
      const mockCategory = {
        id: 1,
        name: 'Test Category',
        slug: 'test-category',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      };

      ddbMock.on(GetCommand).resolves({ Item: mockCategory });

      const category = await repository.findById(1);

      expect(category).not.toBeNull();
      expect(category?.id).toBe(1);
      expect(category?.name).toBe('Test Category');
    });

    it('should return null if category not found', async () => {
      ddbMock.on(GetCommand).resolves({ Item: undefined });

      const category = await repository.findById(999);

      expect(category).toBeNull();
    });
  });

  describe('findBySlug', () => {
    it('should find category by slug', async () => {
      const mockCategory = {
        id: 1,
        name: 'Test Category',
        slug: 'test-category',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      };

      ddbMock.on(QueryCommand).resolves({ Items: [mockCategory] });

      const category = await repository.findBySlug('test-category');

      expect(category).not.toBeNull();
      expect(category?.slug).toBe('test-category');
    });

    it('should return null if category not found', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });

      const category = await repository.findBySlug('non-existent');

      expect(category).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should find all root categories', async () => {
      const mockCategories = [
        {
          id: 1,
          name: 'Category 1',
          slug: 'category-1',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 2,
          name: 'Category 2',
          slug: 'category-2',
          created_at: '2024-01-02T00:00:00.000Z',
          updated_at: '2024-01-02T00:00:00.000Z',
        },
      ];

      ddbMock.on(QueryCommand).resolves({
        Items: mockCategories,
        Count: 2,
      });

      const result = await repository.findAll();

      expect(result.items).toHaveLength(2);
      expect(result.count).toBe(2);
    });

    it('should support pagination', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [],
        Count: 0,
        LastEvaluatedKey: { PK: 'CATEGORY#10', SK: 'METADATA' },
      });

      const result = await repository.findAll({ limit: 10 });

      expect(result.lastEvaluatedKey).toBeDefined();
    });
  });

  describe('update', () => {
    it('should update category name', async () => {
      const updateData: UpdateCategoryData = {
        name: 'Updated Name',
      };

      ddbMock.on(GetCommand).resolves({
        Item: {
          id: 1,
          name: 'Old Name',
          slug: 'test-category',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
      });

      ddbMock.on(UpdateCommand).resolves({
        Attributes: {
          id: 1,
          name: 'Updated Name',
          slug: 'test-category',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-02T00:00:00.000Z',
        },
      });

      const category = await repository.update(1, updateData);

      expect(category).not.toBeNull();
      expect(category?.name).toBe('Updated Name');
    });

    it('should throw error if updating to existing slug', async () => {
      const updateData: UpdateCategoryData = {
        slug: 'existing-slug',
      };

      ddbMock.on(QueryCommand).resolves({
        Items: [{
          id: 2,
          name: 'Other Category',
          slug: 'existing-slug',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        }],
      });

      await expect(repository.update(1, updateData)).rejects.toThrow(
        "Category with slug 'existing-slug' already exists"
      );
    });

    it('should allow updating to same slug', async () => {
      const updateData: UpdateCategoryData = {
        slug: 'test-category',
        name: 'Updated Name',
      };

      ddbMock.on(QueryCommand).resolves({
        Items: [{
          id: 1,
          name: 'Test Category',
          slug: 'test-category',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        }],
      });

      ddbMock.on(GetCommand).resolves({
        Item: {
          id: 1,
          name: 'Test Category',
          slug: 'test-category',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
      });

      ddbMock.on(UpdateCommand).resolves({
        Attributes: {
          id: 1,
          name: 'Updated Name',
          slug: 'test-category',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-02T00:00:00.000Z',
        },
      });

      const category = await repository.update(1, updateData);

      expect(category).not.toBeNull();
      expect(category?.name).toBe('Updated Name');
    });

    it('should prevent circular parent reference on update', async () => {
      const updateData: UpdateCategoryData = {
        parent_id: 2,
      };

      // First call: check for circular reference (parent_id = 2)
      // Second call: get current category data for GSI update
      ddbMock.on(GetCommand)
        .resolvesOnce({
          Item: {
            id: 2,
            name: 'Category 2',
            slug: 'category-2',
            parent_id: 1, // Points back to category 1
            created_at: '2024-01-01T00:00:00.000Z',
            updated_at: '2024-01-01T00:00:00.000Z',
          },
        })
        .resolvesOnce({
          Item: {
            id: 1,
            name: 'Category 1',
            slug: 'category-1',
            created_at: '2024-01-01T00:00:00.000Z',
            updated_at: '2024-01-01T00:00:00.000Z',
          },
        });

      await expect(repository.update(1, updateData)).rejects.toThrow(
        'Cannot update category: circular parent reference detected'
      );
    });

    it('should return null if category does not exist', async () => {
      const updateData: UpdateCategoryData = {
        name: 'Updated Name',
      };

      // Mock GetCommand to return undefined (category doesn't exist)
      ddbMock.on(GetCommand).resolves({});

      ddbMock.on(UpdateCommand).rejects({
        name: 'ConditionalCheckFailedException',
        message: 'The conditional request failed',
      });

      const category = await repository.update(999, updateData);

      expect(category).toBeNull();
    });
  });

  describe('softDelete', () => {
    it('should soft delete category', async () => {
      const now = new Date().toISOString();
      ddbMock.on(UpdateCommand).resolves({
        Attributes: {
          id: 1,
          name: 'Test Category',
          slug: 'test-category',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: now,
          deleted_at: now,
        },
      });

      const category = await repository.softDelete(1);

      expect(category).not.toBeNull();
      expect(category?.deleted_at).toBeDefined();
    });

    it('should return null if category does not exist', async () => {
      ddbMock.on(UpdateCommand).rejects({
        name: 'ConditionalCheckFailedException',
        message: 'The conditional request failed',
      });

      const category = await repository.softDelete(999);

      expect(category).toBeNull();
    });
  });

  describe('findByParentId', () => {
    it('should find child categories by parent ID', async () => {
      const mockChildren = [
        {
          id: 2,
          name: 'Child 1',
          slug: 'child-1',
          parent_id: 1,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 3,
          name: 'Child 2',
          slug: 'child-2',
          parent_id: 1,
          created_at: '2024-01-02T00:00:00.000Z',
          updated_at: '2024-01-02T00:00:00.000Z',
        },
      ];

      ddbMock.on(QueryCommand).resolves({
        Items: mockChildren,
        Count: 2,
      });

      const result = await repository.findByParentId(1);

      expect(result.items).toHaveLength(2);
      expect(result.count).toBe(2);
      expect(result.items[0].parent_id).toBe(1);
    });

    it('should find root categories when parent_id is null', async () => {
      const mockRoots = [
        {
          id: 1,
          name: 'Root 1',
          slug: 'root-1',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
      ];

      ddbMock.on(QueryCommand).resolves({
        Items: mockRoots,
        Count: 1,
      });

      const result = await repository.findByParentId(null);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].parent_id).toBeUndefined();
    });
  });

  describe('getAncestors', () => {
    it('should get all ancestors of a category', async () => {
      // Setup: Category 3 -> Category 2 -> Category 1
      ddbMock.on(GetCommand)
        .resolvesOnce({
          // First call: get category 3 to get its parent_id
          Item: {
            id: 3,
            name: 'Category 3',
            slug: 'category-3',
            parent_id: 2,
            created_at: '2024-01-01T00:00:00.000Z',
            updated_at: '2024-01-01T00:00:00.000Z',
          },
        })
        .resolvesOnce({
          // Second call: get category 2 (parent of 3)
          Item: {
            id: 2,
            name: 'Category 2',
            slug: 'category-2',
            parent_id: 1,
            created_at: '2024-01-01T00:00:00.000Z',
            updated_at: '2024-01-01T00:00:00.000Z',
          },
        })
        .resolvesOnce({
          // Third call: get category 1 (parent of 2)
          Item: {
            id: 1,
            name: 'Category 1',
            slug: 'category-1',
            created_at: '2024-01-01T00:00:00.000Z',
            updated_at: '2024-01-01T00:00:00.000Z',
          },
        });

      const ancestors = await repository.getAncestors(3);

      expect(ancestors).toHaveLength(2);
      expect(ancestors[0].id).toBe(2);
      expect(ancestors[1].id).toBe(1);
    });

    it('should return empty array for root category', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: {
          id: 1,
          name: 'Root Category',
          slug: 'root-category',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
      });

      const ancestors = await repository.getAncestors(1);

      expect(ancestors).toHaveLength(0);
    });
  });

  describe('getDescendants', () => {
    it('should get all descendants recursively', async () => {
      // Setup: Category 1 has children 2 and 3, Category 2 has child 4
      ddbMock.on(QueryCommand)
        .resolvesOnce({
          Items: [
            {
              id: 2,
              name: 'Category 2',
              slug: 'category-2',
              parent_id: 1,
              created_at: '2024-01-01T00:00:00.000Z',
              updated_at: '2024-01-01T00:00:00.000Z',
            },
            {
              id: 3,
              name: 'Category 3',
              slug: 'category-3',
              parent_id: 1,
              created_at: '2024-01-01T00:00:00.000Z',
              updated_at: '2024-01-01T00:00:00.000Z',
            },
          ],
          Count: 2,
        })
        .resolvesOnce({
          Items: [
            {
              id: 4,
              name: 'Category 4',
              slug: 'category-4',
              parent_id: 2,
              created_at: '2024-01-01T00:00:00.000Z',
              updated_at: '2024-01-01T00:00:00.000Z',
            },
          ],
          Count: 1,
        })
        .resolves({
          Items: [],
          Count: 0,
        });

      const descendants = await repository.getDescendants(1);

      expect(descendants).toHaveLength(3);
      expect(descendants.map(d => d.id)).toContain(2);
      expect(descendants.map(d => d.id)).toContain(3);
      expect(descendants.map(d => d.id)).toContain(4);
    });

    it('should return empty array for category with no children', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [],
        Count: 0,
      });

      const descendants = await repository.getDescendants(1);

      expect(descendants).toHaveLength(0);
    });
  });

  describe('findRootCategories', () => {
    it('should find root categories', async () => {
      const mockRoots = [
        {
          id: 1,
          name: 'Root 1',
          slug: 'root-1',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 2,
          name: 'Root 2',
          slug: 'root-2',
          created_at: '2024-01-02T00:00:00.000Z',
          updated_at: '2024-01-02T00:00:00.000Z',
        },
      ];

      ddbMock.on(QueryCommand).resolves({
        Items: mockRoots,
        Count: 2,
      });

      const result = await repository.findRootCategories();

      expect(result.items).toHaveLength(2);
      expect(result.count).toBe(2);
    });
  });

  describe('getProducts', () => {
    it('should get all products in a category', async () => {
      const mockProducts = [
        {
          PK: 'CATEGORY#1',
          SK: 'PRODUCT#10',
          category_id: 1,
          product_id: 10,
          created_at: '2024-01-01T00:00:00.000Z',
        },
        {
          PK: 'CATEGORY#1',
          SK: 'PRODUCT#20',
          category_id: 1,
          product_id: 20,
          created_at: '2024-01-02T00:00:00.000Z',
        },
      ];

      ddbMock.on(QueryCommand).resolves({
        Items: mockProducts,
        Count: 2,
      });

      const productIds = await repository.getProducts(1);

      expect(productIds).toHaveLength(2);
      expect(productIds).toContain(10);
      expect(productIds).toContain(20);
    });

    it('should return empty array if no products', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [],
        Count: 0,
      });

      const productIds = await repository.getProducts(1);

      expect(productIds).toHaveLength(0);
    });
  });

  describe('addProduct', () => {
    it('should create bidirectional product-category link', async () => {
      ddbMock.on(BatchWriteCommand).resolves({});

      const link = await repository.addProduct(1, 10);

      expect(link.category_id).toBe(1);
      expect(link.product_id).toBe(10);
      expect(link.created_at).toBeDefined();

      // Verify BatchWriteCommand was called with both directions
      const calls = ddbMock.commandCalls(BatchWriteCommand);
      expect(calls).toHaveLength(1);
      const requestItems = calls[0].args[0].input.RequestItems;
      const writes = requestItems?.['test-table'];
      expect(writes).toHaveLength(2);
    });
  });

  describe('removeProduct', () => {
    it('should remove bidirectional product-category link', async () => {
      ddbMock.on(BatchWriteCommand).resolves({});

      await repository.removeProduct(1, 10);

      // Verify BatchWriteCommand was called with both directions
      const calls = ddbMock.commandCalls(BatchWriteCommand);
      expect(calls).toHaveLength(1);
      const requestItems = calls[0].args[0].input.RequestItems;
      const writes = requestItems?.['test-table'];
      expect(writes).toHaveLength(2);
    });
  });
});
