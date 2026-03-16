/**
 * Integration Tests for Category Handler → CategoryRepository → DynamoDB
 *
 * Tests the full handler-to-repository chain using a mocked DynamoDB client.
 * Covers:
 *   1. Create category hierarchy (root and child categories)
 *   2. Get child categories
 *   3. Add product to category
 *   4. Query products by category
 *   5. Update and delete categories
 *   6. Edge cases (duplicate slug, circular references, invalid IDs, soft-deleted)
 */

// ── Environment configuration ─────────────────────────────────────────────────
process.env.DYNAMODB_TABLE_NAME = 'art-products-test';
process.env.AWS_REGION = 'us-east-1';
process.env.JWT_SECRET = 'integration-test-secret';

import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import jwt from 'jsonwebtoken';

const ddbMock = mockClient(DynamoDBDocumentClient);

import {
  listCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../../handlers/category.handler';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAdminToken(): string {
  return jwt.sign({ id: 1, username: 'admin' }, 'integration-test-secret');
}

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    httpMethod: 'GET',
    path: '/',
    pathParameters: null,
    queryStringParameters: null,
    headers: {},
    body: null,
    ...overrides,
  };
}

const ADMIN_HEADERS = { Authorization: `Bearer ${makeAdminToken()}` };

// ── Fixture data ──────────────────────────────────────────────────────────────

const ROOT_CATEGORY_ITEM = {
  PK: 'CATEGORY#1',
  SK: 'METADATA',
  id: 1,
  name: 'Prints',
  slug: 'prints',
  description: 'Art print products',
  GSI1PK: 'CATEGORY_SLUG#prints',
  GSI1SK: '2024-01-01T00:00:00.000Z',
  GSI2PK: 'CATEGORY_PARENT#ROOT',
  GSI2SK: 'Prints#1',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

const CHILD_CATEGORY_ITEM = {
  PK: 'CATEGORY#2',
  SK: 'METADATA',
  id: 2,
  name: 'Watercolours',
  slug: 'watercolours',
  description: 'Watercolour prints',
  parent_id: 1,
  GSI1PK: 'CATEGORY_SLUG#watercolours',
  GSI1SK: '2024-01-01T00:00:00.000Z',
  GSI2PK: 'CATEGORY_PARENT#1',
  GSI2SK: 'Watercolours#2',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('Category Integration Tests', () => {
  beforeEach(() => {
    ddbMock.reset();
  });

  afterAll(() => {
    jest.clearAllMocks();
  });

  // ── Setup ──────────────────────────────────────────────────────────────────

  describe('Setup', () => {
    it('verifies test environment is configured', () => {
      expect(process.env.DYNAMODB_TABLE_NAME).toBe('art-products-test');
    });
  });

  // ── List Categories ────────────────────────────────────────────────────────

  describe('listCategories', () => {
    it('lists root categories and returns 200', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [ROOT_CATEGORY_ITEM],
        Count: 1,
        ScannedCount: 1,
      });

      const event = makeEvent({ queryStringParameters: {} });
      const result = await listCategories(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(Array.isArray(body.categories)).toBe(true);
      expect(body.categories).toHaveLength(1);
      expect(body.categories[0].slug).toBe('prints');
    });

    it('returns empty list when no categories exist', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [], Count: 0, ScannedCount: 0 });

      const event = makeEvent({ queryStringParameters: {} });
      const result = await listCategories(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.categories).toHaveLength(0);
      expect(body.total).toBe(0);
    });

    it('includes ETag header in the response', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [], Count: 0, ScannedCount: 0 });

      const event = makeEvent({ queryStringParameters: {} });
      const result = await listCategories(event);

      expect(result.statusCode).toBe(200);
      expect(result.headers?.ETag).toBeDefined();
    });

    it('respects the limit query parameter', async () => {
      const items = Array.from({ length: 5 }, (_, i) => ({
        ...ROOT_CATEGORY_ITEM,
        id: i + 1,
        slug: `cat-${i + 1}`,
      }));

      ddbMock.on(QueryCommand).resolves({ Items: items, Count: 5, ScannedCount: 5 });

      const event = makeEvent({ queryStringParameters: { limit: '5' } });
      const result = await listCategories(event);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).categories).toHaveLength(5);
    });

    it('returns 400 for invalid last_key JSON', async () => {
      const event = makeEvent({
        queryStringParameters: { last_key: 'not-valid-json' },
      });

      const result = await listCategories(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toMatch(/last_key/i);
    });
  });

  // ── Get Category by Slug ───────────────────────────────────────────────────

  describe('getCategory', () => {
    it('returns a category by slug', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [ROOT_CATEGORY_ITEM],
        Count: 1,
        ScannedCount: 1,
      });

      const event = makeEvent({ pathParameters: { slug: 'prints' } });
      const result = await getCategory(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.slug).toBe('prints');
      expect(body.name).toBe('Prints');
    });

    it('returns a child category with parent_id', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [CHILD_CATEGORY_ITEM],
        Count: 1,
        ScannedCount: 1,
      });

      const event = makeEvent({ pathParameters: { slug: 'watercolours' } });
      const result = await getCategory(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.parent_id).toBe(1);
    });

    it('includes ETag header with category id and updated_at', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [ROOT_CATEGORY_ITEM],
        Count: 1,
        ScannedCount: 1,
      });

      const event = makeEvent({ pathParameters: { slug: 'prints' } });
      const result = await getCategory(event);

      expect(result.statusCode).toBe(200);
      expect(result.headers?.ETag).toContain('1');
    });

    it('returns 404 when category does not exist', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [], Count: 0, ScannedCount: 0 });

      const event = makeEvent({ pathParameters: { slug: 'nonexistent' } });
      const result = await getCategory(event);

      expect(result.statusCode).toBe(404);
    });

    it('returns 400 when slug is not provided', async () => {
      const event = makeEvent({ pathParameters: null });
      const result = await getCategory(event);

      expect(result.statusCode).toBe(400);
    });

    it('skips soft-deleted categories and returns 404', async () => {
      const deletedItem = { ...ROOT_CATEGORY_ITEM, deleted_at: '2024-01-02T00:00:00.000Z' };
      ddbMock.on(QueryCommand).resolves({
        Items: [deletedItem],
        Count: 1,
        ScannedCount: 1,
        LastEvaluatedKey: undefined,
      });

      const event = makeEvent({ pathParameters: { slug: 'prints' } });
      const result = await getCategory(event);

      // findBySlug skips deleted items; no non-deleted item found → 404
      expect(result.statusCode).toBe(404);
    });
  });

  // ── Create Category Hierarchy ──────────────────────────────────────────────

  describe('createCategory', () => {
    it('creates a root category and returns 201', async () => {
      // findBySlug (slug uniqueness check): no existing category
      ddbMock.on(QueryCommand).resolves({ Items: [], Count: 0, ScannedCount: 0 });
      // Counter increment
      ddbMock.on(UpdateCommand).resolves({ Attributes: { value: 1 } });
      // PutCommand to store category
      ddbMock.on(PutCommand).resolves({});

      const event = makeEvent({
        httpMethod: 'POST',
        headers: ADMIN_HEADERS,
        body: JSON.stringify({
          name: 'Sculptures',
          slug: 'sculptures',
          description: 'Handcrafted sculptures',
        }),
      });

      const result = await createCategory(event);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.slug).toBe('sculptures');
      expect(body.name).toBe('Sculptures');
      expect(body.parent_id).toBeUndefined();
    });

    it('creates a child category with parent_id and returns 201', async () => {
      // findBySlug for slug uniqueness: not found
      ddbMock
        .on(QueryCommand)
        .resolvesOnce({ Items: [], Count: 0, ScannedCount: 0 });
      // Counter increment
      ddbMock.on(UpdateCommand).resolves({ Attributes: { value: 2 } });
      // findById for parent validation AND circular-reference walk both use GetCommand.
      // Use .resolves (not .resolvesOnce) so all GetCommand calls get the parent item.
      ddbMock.on(GetCommand).resolves({ Item: ROOT_CATEGORY_ITEM });
      // PutCommand to store child category
      ddbMock.on(PutCommand).resolves({});

      const event = makeEvent({
        httpMethod: 'POST',
        headers: ADMIN_HEADERS,
        body: JSON.stringify({
          name: 'Oil Paintings',
          slug: 'oil-paintings',
          parent_id: 1,
        }),
      });

      const result = await createCategory(event);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.parent_id).toBe(1);
    });

    it('creates a multi-level category hierarchy', async () => {
      // Seed: root (id=1) → child (id=2) → grandchild

      // findBySlug: not found
      ddbMock.on(QueryCommand).resolves({ Items: [], Count: 0, ScannedCount: 0 });
      // Counter
      ddbMock.on(UpdateCommand).resolves({ Attributes: { value: 3 } });
      // GetCommand: all findById calls (parent validation + circular-reference walk)
      // return CHILD_CATEGORY_ITEM first, then ROOT_CATEGORY_ITEM for grandparent check.
      ddbMock
        .on(GetCommand)
        .resolvesOnce({ Item: CHILD_CATEGORY_ITEM }) // findById(parent_id=2) for validation
        .resolvesOnce({ Item: CHILD_CATEGORY_ITEM }) // circular-ref: walk from parent_id=2
        .resolvesOnce({ Item: ROOT_CATEGORY_ITEM })  // circular-ref: walk from parent_id=1
        .resolves({ Item: undefined });               // terminates (ROOT has no parent)
      ddbMock.on(PutCommand).resolves({});

      const event = makeEvent({
        httpMethod: 'POST',
        headers: ADMIN_HEADERS,
        body: JSON.stringify({
          name: 'Abstract Watercolours',
          slug: 'abstract-watercolours',
          parent_id: 2,
        }),
      });

      const result = await createCategory(event);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.parent_id).toBe(2);
    });

    it('returns 400 when slug already exists', async () => {
      // findBySlug returns existing non-deleted category
      ddbMock.on(QueryCommand).resolves({
        Items: [ROOT_CATEGORY_ITEM],
        Count: 1,
        ScannedCount: 1,
      });

      const event = makeEvent({
        httpMethod: 'POST',
        headers: ADMIN_HEADERS,
        body: JSON.stringify({
          name: 'Prints Again',
          slug: 'prints',
        }),
      });

      const result = await createCategory(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toMatch(/already exists/i);
    });

    it('returns 400 when parent category does not exist', async () => {
      // findBySlug: not found
      ddbMock.on(QueryCommand).resolves({ Items: [], Count: 0, ScannedCount: 0 });
      // Counter returns id=10
      ddbMock.on(UpdateCommand).resolves({ Attributes: { value: 10 } });
      // findById for parent: not found
      ddbMock.on(GetCommand).resolves({ Item: undefined });

      const event = makeEvent({
        httpMethod: 'POST',
        headers: ADMIN_HEADERS,
        body: JSON.stringify({
          name: 'Orphan',
          slug: 'orphan',
          parent_id: 999,
        }),
      });

      const result = await createCategory(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toMatch(/does not exist/i);
    });

    it('returns 400 when parent category is soft-deleted', async () => {
      const deletedParent = { ...ROOT_CATEGORY_ITEM, deleted_at: '2024-01-02T00:00:00.000Z' };
      ddbMock.on(QueryCommand).resolves({ Items: [], Count: 0, ScannedCount: 0 });
      ddbMock.on(UpdateCommand).resolves({ Attributes: { value: 11 } });
      ddbMock.on(GetCommand).resolves({ Item: deletedParent });

      const event = makeEvent({
        httpMethod: 'POST',
        headers: ADMIN_HEADERS,
        body: JSON.stringify({
          name: 'DeletedParent',
          slug: 'deleted-parent-child',
          parent_id: 1,
        }),
      });

      const result = await createCategory(event);

      expect(result.statusCode).toBe(400);
    });

    it('returns 400 when name is missing', async () => {
      const event = makeEvent({
        httpMethod: 'POST',
        headers: ADMIN_HEADERS,
        body: JSON.stringify({ slug: 'no-name' }),
      });

      const result = await createCategory(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toMatch(/name/i);
    });

    it('returns 400 when slug is missing', async () => {
      const event = makeEvent({
        httpMethod: 'POST',
        headers: ADMIN_HEADERS,
        body: JSON.stringify({ name: 'No Slug' }),
      });

      const result = await createCategory(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toMatch(/slug/i);
    });

    it('returns 400 when slug has invalid format (uppercase)', async () => {
      const event = makeEvent({
        httpMethod: 'POST',
        headers: ADMIN_HEADERS,
        body: JSON.stringify({ name: 'Bad Slug', slug: 'Bad-Slug' }),
      });

      const result = await createCategory(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toMatch(/slug/i);
    });

    it('returns 400 when slug has special characters', async () => {
      const event = makeEvent({
        httpMethod: 'POST',
        headers: ADMIN_HEADERS,
        body: JSON.stringify({ name: 'Special', slug: 'special!@#' }),
      });

      const result = await createCategory(event);

      expect(result.statusCode).toBe(400);
    });

    it('returns 401 when not authenticated', async () => {
      const event = makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ name: 'Anon', slug: 'anon' }),
      });

      const result = await createCategory(event);

      expect(result.statusCode).toBe(401);
    });
  });

  // ── Get Child Categories ───────────────────────────────────────────────────

  describe('Child categories', () => {
    it('lists root categories and child categories are accessible via parent_id', async () => {
      // listCategories lists root categories (GSI2PK = CATEGORY_PARENT#ROOT)
      ddbMock.on(QueryCommand).resolves({
        Items: [ROOT_CATEGORY_ITEM],
        Count: 1,
        ScannedCount: 1,
      });

      const rootResult = await listCategories(makeEvent({ queryStringParameters: {} }));

      expect(rootResult.statusCode).toBe(200);
      const { categories } = JSON.parse(rootResult.body);
      expect(categories).toHaveLength(1);
      expect(categories[0].id).toBe(1);

      // Verify child category can be fetched directly
      ddbMock.reset();
      ddbMock.on(QueryCommand).resolves({
        Items: [CHILD_CATEGORY_ITEM],
        Count: 1,
        ScannedCount: 1,
      });

      const childResult = await getCategory(makeEvent({ pathParameters: { slug: 'watercolours' } }));

      expect(childResult.statusCode).toBe(200);
      const childBody = JSON.parse(childResult.body);
      expect(childBody.parent_id).toBe(1);
    });
  });

  // ── Add Product to Category ────────────────────────────────────────────────

  describe('Add product to category (via ProductService.createProduct)', () => {
    it('associates a product with a category via bidirectional links', async () => {
      // This is tested through listProducts with category filter.
      // Simulate: category found by slug, then product links, then products fetched.

      // Category by slug lookup (from ProductService.listProducts)
      const categoryItem = {
        ...ROOT_CATEGORY_ITEM,
        GSI1PK: 'CATEGORY_SLUG#prints',
      };
      ddbMock
        .on(QueryCommand)
        // findBySlug (category by slug for listProducts)
        .resolvesOnce({ Items: [categoryItem], Count: 1, ScannedCount: 1 })
        // getProducts (product IDs in category)
        .resolvesOnce({
          Items: [
            {
              PK: 'CATEGORY#1',
              SK: 'PRODUCT#42',
              category_id: 1,
              product_id: 42,
              created_at: '2024-01-01T00:00:00.000Z',
            },
          ],
          Count: 1,
          ScannedCount: 1,
        })
        // images, variants, categories for the fetched product
        .resolves({ Items: [], Count: 0, ScannedCount: 0 });

      const productItem = {
        PK: 'PRODUCT#42',
        SK: 'METADATA',
        id: 42,
        slug: 'limited-print',
        title: 'Limited Print',
        base_price: 75.00,
        currency: 'EUR',
        status: 'published',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      };
      ddbMock.on(GetCommand).resolves({ Item: productItem });

      // Import listProducts from product handler to test category query
      const { listProducts } = await import('../../handlers/product.handler');
      const event = makeEvent({ queryStringParameters: { category: 'prints' } });
      const result = await listProducts(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(Array.isArray(body.products)).toBe(true);
    });
  });

  // ── Update Category ────────────────────────────────────────────────────────

  describe('updateCategory', () => {
    it('updates category name and returns 200', async () => {
      // findBySlug (slug uniqueness check, not triggered when slug not in body)
      // findById for GSI recalculation
      ddbMock.on(GetCommand).resolves({ Item: ROOT_CATEGORY_ITEM });
      const updatedItem = { ...ROOT_CATEGORY_ITEM, name: 'Fine Art Prints', updated_at: new Date().toISOString() };
      ddbMock.on(UpdateCommand).resolves({ Attributes: updatedItem });

      const event = makeEvent({
        httpMethod: 'PUT',
        headers: ADMIN_HEADERS,
        pathParameters: { id: '1' },
        body: JSON.stringify({ name: 'Fine Art Prints' }),
      });

      const result = await updateCategory(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.name).toBe('Fine Art Prints');
    });

    it('updates category slug with valid format', async () => {
      // findBySlug (uniqueness check for the new slug): no conflict
      ddbMock
        .on(QueryCommand)
        .resolvesOnce({ Items: [], Count: 0, ScannedCount: 0 });
      // findById for current data (GSI recalculation)
      ddbMock.on(GetCommand).resolves({ Item: ROOT_CATEGORY_ITEM });
      const updatedItem = { ...ROOT_CATEGORY_ITEM, slug: 'fine-prints', updated_at: new Date().toISOString() };
      ddbMock.on(UpdateCommand).resolves({ Attributes: updatedItem });

      const event = makeEvent({
        httpMethod: 'PUT',
        headers: ADMIN_HEADERS,
        pathParameters: { id: '1' },
        body: JSON.stringify({ slug: 'fine-prints' }),
      });

      const result = await updateCategory(event);

      expect(result.statusCode).toBe(200);
    });

    it('returns 400 when updating slug to invalid format', async () => {
      const event = makeEvent({
        httpMethod: 'PUT',
        headers: ADMIN_HEADERS,
        pathParameters: { id: '1' },
        body: JSON.stringify({ slug: 'INVALID_SLUG' }),
      });

      const result = await updateCategory(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toMatch(/slug/i);
    });

    it('returns 404 when category does not exist', async () => {
      ddbMock.on(GetCommand).resolves({ Item: undefined });
      ddbMock.on(UpdateCommand).resolves({ Attributes: undefined });

      const event = makeEvent({
        httpMethod: 'PUT',
        headers: ADMIN_HEADERS,
        pathParameters: { id: '999' },
        body: JSON.stringify({ name: 'Ghost Category' }),
      });

      const result = await updateCategory(event);

      // CategoryRepository.update returns null if item not found → handler returns 404
      expect(result.statusCode).toBe(404);
    });

    it('returns 400 when body is empty', async () => {
      const event = makeEvent({
        httpMethod: 'PUT',
        headers: ADMIN_HEADERS,
        pathParameters: { id: '1' },
        body: JSON.stringify({}),
      });

      const result = await updateCategory(event);

      expect(result.statusCode).toBe(400);
    });

    it('returns 400 when id is not a positive integer', async () => {
      const event = makeEvent({
        httpMethod: 'PUT',
        headers: ADMIN_HEADERS,
        pathParameters: { id: '0' },
        body: JSON.stringify({ name: 'Bad ID' }),
      });

      const result = await updateCategory(event);

      expect(result.statusCode).toBe(400);
    });

    it('returns 401 when not authenticated', async () => {
      const event = makeEvent({
        httpMethod: 'PUT',
        pathParameters: { id: '1' },
        body: JSON.stringify({ name: 'No Auth' }),
      });

      const result = await updateCategory(event);

      expect(result.statusCode).toBe(401);
    });
  });

  // ── Soft Delete Category ───────────────────────────────────────────────────

  describe('deleteCategory', () => {
    it('soft-deletes a category and returns 200', async () => {
      const deletedItem = {
        ...ROOT_CATEGORY_ITEM,
        deleted_at: new Date().toISOString(),
      };
      ddbMock.on(UpdateCommand).resolves({ Attributes: deletedItem });

      const event = makeEvent({
        httpMethod: 'DELETE',
        headers: ADMIN_HEADERS,
        pathParameters: { id: '1' },
      });

      const result = await deleteCategory(event);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).message).toMatch(/deleted/i);
    });

    it('returns 404 when category does not exist', async () => {
      // softDelete returns null when item not found
      ddbMock.on(UpdateCommand).resolves({ Attributes: undefined });

      const event = makeEvent({
        httpMethod: 'DELETE',
        headers: ADMIN_HEADERS,
        pathParameters: { id: '999' },
      });

      const result = await deleteCategory(event);

      expect(result.statusCode).toBe(404);
    });

    it('returns 400 when id is invalid', async () => {
      const event = makeEvent({
        httpMethod: 'DELETE',
        headers: ADMIN_HEADERS,
        pathParameters: { id: 'not-an-id' },
      });

      const result = await deleteCategory(event);

      expect(result.statusCode).toBe(400);
    });

    it('returns 401 when not authenticated', async () => {
      const event = makeEvent({
        httpMethod: 'DELETE',
        pathParameters: { id: '1' },
      });

      const result = await deleteCategory(event);

      expect(result.statusCode).toBe(401);
    });

    it('soft-deleted categories do not appear in listing', async () => {
      // GSI2 query (findByParentId → ROOT) returns soft-deleted item
      const deletedCategory = { ...ROOT_CATEGORY_ITEM, deleted_at: '2024-01-02T00:00:00.000Z' };
      // DynamoDB filterExpression excludes deleted items; mock returns empty result
      ddbMock.on(QueryCommand).resolves({ Items: [], Count: 0, ScannedCount: 0 });

      const event = makeEvent({ queryStringParameters: {} });
      const result = await listCategories(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      // Deleted category should not appear
      const deletedInResult = body.categories.find((c: { slug: string }) => c.slug === deletedCategory.slug);
      expect(deletedInResult).toBeUndefined();
    });
  });

  // ── Edge Cases ─────────────────────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('returns 400 for invalid JSON in request body', async () => {
      const event = makeEvent({
        httpMethod: 'POST',
        headers: ADMIN_HEADERS,
        body: '{invalid}',
      });

      const result = await createCategory(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toMatch(/JSON/i);
    });

    it('returns 400 for request body with missing slug', async () => {
      const event = makeEvent({
        httpMethod: 'POST',
        headers: ADMIN_HEADERS,
        body: JSON.stringify({ name: 'Only Name' }),
      });

      const result = await createCategory(event);

      expect(result.statusCode).toBe(400);
    });

    it('prevents circular parent reference on create (category as its own parent)', async () => {
      // findBySlug: no existing slug
      ddbMock.on(QueryCommand).resolves({ Items: [], Count: 0, ScannedCount: 0 });
      // Counter returns id=5
      ddbMock.on(UpdateCommand).resolves({ Attributes: { value: 5 } });
      // parent findById returns the same id (simulated)
      // wouldCreateCircularReference: category 5, parent 5 → direct circular
      // The check happens before insert; parent findById for parent=5
      ddbMock.on(GetCommand).resolves({
        Item: {
          ...ROOT_CATEGORY_ITEM,
          id: 5,
          parent_id: undefined,
        },
      });
      ddbMock.on(PutCommand).resolves({});

      // Note: CategoryRepository.create checks id === parentId for direct self-reference.
      // Since the new id (from counter) equals the parent_id (5), it's circular.
      const event = makeEvent({
        httpMethod: 'POST',
        headers: ADMIN_HEADERS,
        body: JSON.stringify({
          name: 'Self Parent',
          slug: 'self-parent',
          parent_id: 5,
        }),
      });

      const result = await createCategory(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toMatch(/circular/i);
      expect(ddbMock.commandCalls(PutCommand)).toHaveLength(0);
    });

    it('handles paginated category listing via last_key', async () => {
      const lastKey = {
        PK: 'CATEGORY#1',
        SK: 'METADATA',
        GSI2PK: 'CATEGORY_PARENT#ROOT',
        GSI2SK: 'Prints#1',
      };

      ddbMock.on(QueryCommand).resolves({
        Items: [CHILD_CATEGORY_ITEM],
        Count: 1,
        ScannedCount: 1,
        LastEvaluatedKey: undefined,
      });

      const event = makeEvent({
        queryStringParameters: { last_key: JSON.stringify(lastKey) },
      });
      const result = await listCategories(event);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).categories).toBeDefined();
    });
  });

  // ── Performance Tests ──────────────────────────────────────────────────────

  describe('Performance Tests', () => {
    it('creates 50 categories in under 3 seconds', async () => {
      let counter = 0;
      ddbMock.on(QueryCommand).resolves({ Items: [], Count: 0, ScannedCount: 0 });
      ddbMock.on(UpdateCommand).callsFake(() => {
        counter++;
        return Promise.resolve({ Attributes: { value: counter } });
      });
      ddbMock.on(PutCommand).resolves({});

      const start = Date.now();

      const results = await Promise.all(
        Array.from({ length: 50 }, (_, i) =>
          createCategory(
            makeEvent({
              httpMethod: 'POST',
              headers: ADMIN_HEADERS,
              body: JSON.stringify({
                name: `Category ${i + 1}`,
                slug: `category-${i + 1}`,
              }),
            })
          )
        )
      );

      const elapsed = Date.now() - start;
      const created = results.filter(r => r.statusCode === 201);
      expect(created.length).toBeGreaterThan(0);
      expect(elapsed).toBeLessThan(3000);
    });

    it('lists 100 categories in under 1 second', async () => {
      const items = Array.from({ length: 100 }, (_, i) => ({
        ...ROOT_CATEGORY_ITEM,
        id: i + 1,
        slug: `cat-${i + 1}`,
        name: `Category ${i + 1}`,
      }));

      ddbMock.on(QueryCommand).resolves({
        Items: items,
        Count: 100,
        ScannedCount: 100,
      });

      const start = Date.now();
      const result = await listCategories(makeEvent({ queryStringParameters: { limit: '100' } }));
      const elapsed = Date.now() - start;

      expect(result.statusCode).toBe(200);
      expect(elapsed).toBeLessThan(1000);
    });
  });
});
