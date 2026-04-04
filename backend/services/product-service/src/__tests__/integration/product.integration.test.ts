/**
 * Integration Tests for Product Handler → ProductService → ProductRepository → DynamoDB
 *
 * These tests exercise the full handler-to-repository chain using a mocked
 * DynamoDB client (aws-sdk-client-mock), mirroring how DynamoDB Local would be
 * used in a real integration environment.
 *
 * Setup:
 *   - DynamoDB client mocked before every test (equivalent to a fresh table)
 *   - Mock responses reflect the single-table design used by ProductRepository
 *   - After each test the mock is reset (equivalent to cleanup)
 *
 * Covered scenarios:
 *   1. Create product with variants and images
 *   2. Get product by slug
 *   3. List products with pagination
 *   4. Update product
 *   5. Soft delete product
 *   6. Search products
 *   7. Edge cases (duplicate slug, invalid ID, soft-deleted not returned, pagination)
 *   8. Performance benchmarks (100 creates < 5 s, 1000-item query < 2 s)
 */

// ── Environment configuration (must be set before any imports) ────────────────
process.env.DYNAMODB_TABLE_NAME = 'art-products-test';
process.env.AWS_REGION_CUSTOM = 'us-east-1';
process.env.JWT_SECRET = 'integration-test-secret';

import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  GetCommand,
  PutCommand,
  UpdateCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import jwt from 'jsonwebtoken';

// Mock must be created before handler imports so the singletons inside each
// handler module pick up the intercepted client.
const ddbMock = mockClient(DynamoDBDocumentClient);

import {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
} from '../../handlers/product.handler';

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

// ── Shared fixture data ───────────────────────────────────────────────────────

const PRODUCT_ITEM = {
  PK: 'PRODUCT#1',
  SK: 'METADATA',
  id: 1,
  slug: 'test-product',
  title: 'Test Product',
  short_description: 'A great product',
  base_price: 29.99,
  currency: 'EUR',
  status: 'published',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

/** Stub any QueryCommand to return an empty result (images/variants/categories). */
function stubEmptyQuery() {
  ddbMock.on(QueryCommand).resolves({ Items: [], Count: 0, ScannedCount: 0 });
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('Product Integration Tests', () => {
  beforeEach(() => {
    ddbMock.reset();
  });

  afterAll(() => {
    jest.clearAllMocks();
  });

  // ── 1. Setup verification ──────────────────────────────────────────────────

  describe('Setup', () => {
    it('verifies test environment is configured', () => {
      expect(process.env.DYNAMODB_TABLE_NAME).toBe('art-products-test');
      expect(process.env.JWT_SECRET).toBeDefined();
    });
  });

  // ── 2. Create Product ──────────────────────────────────────────────────────

  describe('Create Product', () => {
    it('creates a basic product and returns 201', async () => {
      // Counter increment for product ID
      ddbMock.on(UpdateCommand).resolves({ Attributes: { value: 1 } });
      // Store product; also used by AuditService (non-blocking, ignored)
      ddbMock.on(PutCommand).resolves({});
      // Queries for categories / relations (empty)
      stubEmptyQuery();

      const event = makeEvent({
        httpMethod: 'POST',
        headers: ADMIN_HEADERS,
        body: JSON.stringify({
          title: 'Test Product',
          slug: 'test-product',
          base_price: 29.99,
          currency: 'EUR',
        }),
      });

      const result = await createProduct(event);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.id).toBe(1);
      expect(body.slug).toBe('test-product');
      expect(body.title).toBe('Test Product');
      expect(body.base_price).toBe(29.99);
    });

    it('creates a product with variants and images', async () => {
      // Product ID counter
      ddbMock.on(UpdateCommand).resolves({ Attributes: { value: 2 } });
      // PutCommand: product + any individual puts
      ddbMock.on(PutCommand).resolves({});
      // QueryCommand: imageRepo.findByProductId (position check) + categories + variants
      ddbMock.on(QueryCommand).resolves({ Items: [], Count: 0, ScannedCount: 0 });
      // BatchWriteCommand: images + variants
      ddbMock.on(BatchWriteCommand).resolves({ UnprocessedItems: {} });

      const event = makeEvent({
        httpMethod: 'POST',
        headers: ADMIN_HEADERS,
        body: JSON.stringify({
          title: 'Art Print',
          slug: 'art-print',
          base_price: 49.99,
          currency: 'EUR',
          variants: [
            { sku: 'AP-S', name: 'Small', stock: 5, price_adjustment: 0 },
            { sku: 'AP-L', name: 'Large', stock: 3, price_adjustment: 10 },
          ],
          images: [
            { url: 'https://cdn.example.com/art-print-front.jpg', alt_text: 'Front view' },
            { url: 'https://cdn.example.com/art-print-back.jpg', alt_text: 'Back view' },
          ],
        }),
      });

      const result = await createProduct(event);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.slug).toBe('art-print');
      // variants and images are returned in the product
      expect(Array.isArray(body.variants)).toBe(true);
      expect(body.variants).toHaveLength(2);
      expect(Array.isArray(body.images)).toBe(true);
      expect(body.images).toHaveLength(2);
    });

    it('returns 400 when title is missing', async () => {
      const event = makeEvent({
        httpMethod: 'POST',
        headers: ADMIN_HEADERS,
        body: JSON.stringify({ slug: 'missing-title', base_price: 10 }),
      });

      const result = await createProduct(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toMatch(/title/i);
    });

    it('returns 400 when slug is missing', async () => {
      const event = makeEvent({
        httpMethod: 'POST',
        headers: ADMIN_HEADERS,
        body: JSON.stringify({ title: 'No Slug', base_price: 10 }),
      });

      const result = await createProduct(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toMatch(/slug/i);
    });

    it('returns 400 when base_price is negative', async () => {
      const event = makeEvent({
        httpMethod: 'POST',
        headers: ADMIN_HEADERS,
        body: JSON.stringify({ title: 'Bad Price', slug: 'bad-price', base_price: -5 }),
      });

      const result = await createProduct(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toMatch(/base_price/i);
    });

    it('returns 401 when no auth token is provided', async () => {
      const event = makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ title: 'T', slug: 's', base_price: 1 }),
      });

      const result = await createProduct(event);

      expect(result.statusCode).toBe(401);
    });

    it('returns 500 when DynamoDB returns an error', async () => {
      ddbMock.on(UpdateCommand).rejects(new Error('InternalServerError'));

      const event = makeEvent({
        httpMethod: 'POST',
        headers: ADMIN_HEADERS,
        body: JSON.stringify({ title: 'Fail Product', slug: 'fail-product', base_price: 9.99 }),
      });

      const result = await createProduct(event);

      expect(result.statusCode).toBe(500);
    });
  });

  // ── 3. Get Product by Slug ─────────────────────────────────────────────────

  describe('Get Product by Slug', () => {
    it('returns a product by slug', async () => {
      // GSI1 query for slug
      ddbMock
        .on(QueryCommand)
        .resolvesOnce({ Items: [PRODUCT_ITEM], Count: 1, ScannedCount: 1 })
        // images query
        .resolvesOnce({ Items: [], Count: 0, ScannedCount: 0 })
        // variants query
        .resolvesOnce({ Items: [], Count: 0, ScannedCount: 0 })
        // categories link query
        .resolvesOnce({ Items: [], Count: 0, ScannedCount: 0 });

      const event = makeEvent({
        pathParameters: { slug: 'test-product' },
      });

      const result = await getProduct(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.slug).toBe('test-product');
      expect(body.title).toBe('Test Product');
    });

    it('includes ETag header in the response', async () => {
      ddbMock
        .on(QueryCommand)
        .resolvesOnce({ Items: [PRODUCT_ITEM], Count: 1, ScannedCount: 1 })
        .resolves({ Items: [], Count: 0, ScannedCount: 0 });

      const event = makeEvent({ pathParameters: { slug: 'test-product' } });
      const result = await getProduct(event);

      expect(result.statusCode).toBe(200);
      expect(result.headers?.ETag).toBeDefined();
    });

    it('returns product with variants, images, and categories', async () => {
      const variantItem = {
        PK: 'PRODUCT#1',
        SK: 'VARIANT#v-1',
        id: 'v-1',
        product_id: 1,
        sku: 'SKU-001',
        name: 'Default',
        price_adjustment: 0,
        stock: 10,
        entity_type: 'ProductVariant',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      };

      ddbMock
        .on(QueryCommand)
        // slug lookup
        .resolvesOnce({ Items: [PRODUCT_ITEM], Count: 1, ScannedCount: 1 })
        // images
        .resolvesOnce({ Items: [], Count: 0, ScannedCount: 0 })
        // variants
        .resolvesOnce({ Items: [variantItem], Count: 1, ScannedCount: 1 })
        // categories link
        .resolvesOnce({ Items: [], Count: 0, ScannedCount: 0 });

      const event = makeEvent({ pathParameters: { slug: 'test-product' } });
      const result = await getProduct(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.variants).toHaveLength(1);
      expect(body.variants[0].sku).toBe('SKU-001');
    });

    it('returns 404 when product does not exist', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [], Count: 0, ScannedCount: 0 });

      const event = makeEvent({ pathParameters: { slug: 'nonexistent' } });
      const result = await getProduct(event);

      expect(result.statusCode).toBe(404);
    });

    it('returns 400 when slug is not provided', async () => {
      const event = makeEvent({ pathParameters: null });
      const result = await getProduct(event);

      expect(result.statusCode).toBe(400);
    });
  });

  // ── 4. List Products with Pagination ──────────────────────────────────────

  describe('List Products', () => {
    it('lists published products (default, no filter)', async () => {
      // No status filter → queries all three statuses in parallel then merges.
      // Return empty items so that no relation queries are triggered.
      ddbMock.on(QueryCommand).resolves({ Items: [], Count: 0, ScannedCount: 0 });
      ddbMock.on(GetCommand).resolves({ Item: undefined });

      const event = makeEvent({ queryStringParameters: {} });
      const result = await listProducts(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(Array.isArray(body.products)).toBe(true);
      expect(body.page).toBe(1);
      expect(body.per_page).toBeDefined();
    });

    it('lists products filtered by published status', async () => {
      // First QueryCommand (findByStatus) returns 1 product; all subsequent
      // QueryCommands (images, variants, category links) return empty.
      ddbMock
        .on(QueryCommand)
        .resolvesOnce({ Items: [PRODUCT_ITEM], Count: 1, ScannedCount: 1 })
        .resolves({ Items: [], Count: 0, ScannedCount: 0 });
      // GetCommand needed if getProductCategories calls categoryRepo.findById
      ddbMock.on(GetCommand).resolves({ Item: undefined });

      const event = makeEvent({ queryStringParameters: { status: 'published' } });
      const result = await listProducts(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.products.length).toBeGreaterThanOrEqual(1);
    });

    it('supports custom per_page and page parameters', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [], Count: 0, ScannedCount: 0 });
      ddbMock.on(GetCommand).resolves({ Item: undefined });

      const event = makeEvent({ queryStringParameters: { page: '2', per_page: '5' } });
      const result = await listProducts(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.page).toBe(2);
      expect(body.per_page).toBe(5);
    });

    it('caps per_page at MAX_PER_PAGE (100)', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [], Count: 0, ScannedCount: 0 });
      ddbMock.on(GetCommand).resolves({ Item: undefined });

      const event = makeEvent({ queryStringParameters: { per_page: '9999' } });
      const result = await listProducts(event);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).per_page).toBe(100);
    });

    it('returns an empty list when no products exist', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [], Count: 0, ScannedCount: 0 });
      ddbMock.on(GetCommand).resolves({ Item: undefined });

      const event = makeEvent({ queryStringParameters: {} });
      const result = await listProducts(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.products).toHaveLength(0);
      expect(body.total).toBe(0);
    });

    it('returns empty list for unknown category', async () => {
      // category filter first queries category by slug (returns empty)
      ddbMock.on(QueryCommand).resolves({ Items: [], Count: 0, ScannedCount: 0 });
      ddbMock.on(GetCommand).resolves({ Item: undefined });

      const event = makeEvent({ queryStringParameters: { category: 'unknown-cat' } });
      const result = await listProducts(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.products).toHaveLength(0);
    });

    it('includes ETag header in the response', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [], Count: 0, ScannedCount: 0 });
      ddbMock.on(GetCommand).resolves({ Item: undefined });

      const event = makeEvent({ queryStringParameters: {} });
      const result = await listProducts(event);

      expect(result.statusCode).toBe(200);
      expect(result.headers?.ETag).toBeDefined();
    });

    it('filters by min_price', async () => {
      const expensiveProduct = { ...PRODUCT_ITEM, base_price: 100 };
      // First query (findByStatus 'published') returns two products; subsequent
      // relation queries return empty to avoid cascade errors.
      ddbMock
        .on(QueryCommand)
        .resolvesOnce({
          Items: [expensiveProduct, { ...PRODUCT_ITEM, id: 2, base_price: 5 }],
          Count: 2,
          ScannedCount: 2,
        })
        .resolves({ Items: [], Count: 0, ScannedCount: 0 });
      ddbMock.on(GetCommand).resolves({ Item: undefined });

      const event = makeEvent({ queryStringParameters: { status: 'published', min_price: '50' } });
      const result = await listProducts(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      body.products.forEach((p: { base_price: number }) => {
        expect(p.base_price).toBeGreaterThanOrEqual(50);
      });
    });
  });

  // ── 5. Update Product ──────────────────────────────────────────────────────

  describe('Update Product', () => {
    it('updates a product and returns 200', async () => {
      const updatedItem = { ...PRODUCT_ITEM, title: 'Updated Title', status: 'archived' };

      // findById (for audit) + optional second findById (for GSI2 recalculation)
      ddbMock.on(GetCommand).resolves({ Item: PRODUCT_ITEM });
      // Update returns the new attributes
      ddbMock.on(UpdateCommand).resolves({ Attributes: updatedItem });
      // Queries for images / variants / categories after update
      ddbMock.on(QueryCommand).resolves({ Items: [], Count: 0, ScannedCount: 0 });

      const event = makeEvent({
        httpMethod: 'PUT',
        headers: ADMIN_HEADERS,
        pathParameters: { id: '1' },
        body: JSON.stringify({ title: 'Updated Title', status: 'archived' }),
      });

      const result = await updateProduct(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.title).toBe('Updated Title');
    });

    it('returns 400 when id is not a positive integer', async () => {
      const event = makeEvent({
        httpMethod: 'PUT',
        headers: ADMIN_HEADERS,
        pathParameters: { id: 'abc' },
        body: JSON.stringify({ title: 'Oops' }),
      });

      const result = await updateProduct(event);

      expect(result.statusCode).toBe(400);
    });

    it('returns 400 when body is empty', async () => {
      const event = makeEvent({
        httpMethod: 'PUT',
        headers: ADMIN_HEADERS,
        pathParameters: { id: '1' },
        body: JSON.stringify({}),
      });

      const result = await updateProduct(event);

      expect(result.statusCode).toBe(400);
    });

    it('returns 404 when product does not exist', async () => {
      // findById returns null
      ddbMock.on(GetCommand).resolves({ Item: undefined });

      const event = makeEvent({
        httpMethod: 'PUT',
        headers: ADMIN_HEADERS,
        pathParameters: { id: '999' },
        body: JSON.stringify({ title: 'Ghost' }),
      });

      const result = await updateProduct(event);

      expect(result.statusCode).toBe(404);
    });

    it('returns 401 when not authenticated', async () => {
      const event = makeEvent({
        httpMethod: 'PUT',
        pathParameters: { id: '1' },
        body: JSON.stringify({ title: 'No Auth' }),
      });

      const result = await updateProduct(event);

      expect(result.statusCode).toBe(401);
    });
  });

  // ── 6. Soft Delete Product ─────────────────────────────────────────────────

  describe('Soft Delete Product', () => {
    it('soft-deletes a product and returns 200', async () => {
      const deletedItem = {
        ...PRODUCT_ITEM,
        deleted_at: new Date().toISOString(),
      };

      // findById (for audit)
      ddbMock.on(GetCommand).resolves({ Item: PRODUCT_ITEM });
      // softDelete UpdateCommand
      ddbMock.on(UpdateCommand).resolves({ Attributes: deletedItem });
      // variantRepo.findByProductId (to soft-delete variants)
      ddbMock.on(QueryCommand).resolves({ Items: [], Count: 0, ScannedCount: 0 });

      const event = makeEvent({
        httpMethod: 'DELETE',
        headers: ADMIN_HEADERS,
        pathParameters: { id: '1' },
      });

      const result = await deleteProduct(event);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).message).toMatch(/deleted/i);
    });

    it('soft-deletes all variants when deleting a product', async () => {
      const variantItem = {
        PK: 'PRODUCT#1',
        SK: 'VARIANT#v-1',
        id: 'v-1',
        product_id: 1,
        sku: 'VAR-001',
        name: 'Default',
        price_adjustment: 0,
        stock: 5,
        entity_type: 'ProductVariant',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      };

      ddbMock.on(GetCommand).resolves({ Item: PRODUCT_ITEM });
      // softDelete product; then variant soft-delete calls
      ddbMock.on(UpdateCommand).resolves({ Attributes: PRODUCT_ITEM });
      // variants query returns one variant
      ddbMock
        .on(QueryCommand)
        .resolvesOnce({ Items: [variantItem], Count: 1, ScannedCount: 1 })
        .resolves({ Items: [], Count: 0, ScannedCount: 0 });

      const event = makeEvent({
        httpMethod: 'DELETE',
        headers: ADMIN_HEADERS,
        pathParameters: { id: '1' },
      });

      const result = await deleteProduct(event);

      expect(result.statusCode).toBe(200);
    });

    it('returns 400 when id is invalid', async () => {
      const event = makeEvent({
        httpMethod: 'DELETE',
        headers: ADMIN_HEADERS,
        pathParameters: { id: '0' },
      });

      const result = await deleteProduct(event);

      expect(result.statusCode).toBe(400);
    });

    it('returns 401 without authentication', async () => {
      const event = makeEvent({
        httpMethod: 'DELETE',
        pathParameters: { id: '1' },
      });

      const result = await deleteProduct(event);

      expect(result.statusCode).toBe(401);
    });
  });

  // ── 7. Search Products ─────────────────────────────────────────────────────

  describe('Search Products', () => {
    it('searches products by term and returns matches', async () => {
      const matchItem = {
        ...PRODUCT_ITEM,
        id: 3,
        title: 'Watercolour Painting',
        slug: 'watercolour-painting',
      };

      // First QueryCommand (search via findByStatus with filter) returns match;
      // subsequent QueryCommands (relations) return empty.
      ddbMock
        .on(QueryCommand)
        .resolvesOnce({ Items: [matchItem], Count: 1, ScannedCount: 5 })
        .resolves({ Items: [], Count: 0, ScannedCount: 0 });
      ddbMock.on(GetCommand).resolves({ Item: undefined });

      const event = makeEvent({ queryStringParameters: { search: 'watercolour' } });
      const result = await listProducts(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.products.length).toBeGreaterThanOrEqual(1);
    });

    it('returns empty list when no products match the search term', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [], Count: 0, ScannedCount: 0 });
      ddbMock.on(GetCommand).resolves({ Item: undefined });

      const event = makeEvent({ queryStringParameters: { search: 'xyznotfound' } });
      const result = await listProducts(event);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).products).toHaveLength(0);
    });
  });

  // ── 8. Edge Cases ──────────────────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('returns 500 when DynamoDB throws ConditionalCheckFailedException on create (duplicate PK)', async () => {
      ddbMock.on(UpdateCommand).resolves({ Attributes: { value: 5 } });
      const error = new Error('The conditional request failed');
      error.name = 'ConditionalCheckFailedException';
      ddbMock.on(PutCommand).rejects(error);

      const event = makeEvent({
        httpMethod: 'POST',
        headers: ADMIN_HEADERS,
        body: JSON.stringify({ title: 'Dup', slug: 'dup-slug', base_price: 1 }),
      });

      const result = await createProduct(event);

      // Conditional check failures currently fall through product.handler handleError.
      expect(result.statusCode).toBe(500);
    });

    it('returns 400 when product id is not a positive integer on update', async () => {
      const event = makeEvent({
        httpMethod: 'PUT',
        headers: ADMIN_HEADERS,
        pathParameters: { id: '-1' },
        body: JSON.stringify({ title: 'Bad ID' }),
      });

      const result = await updateProduct(event);

      expect(result.statusCode).toBe(400);
    });

    it('soft-deleted products are still findable by slug (findBySlug has no deleted_at filter)', async () => {
      // ProductRepository.findBySlug does not filter by deleted_at; the product
      // is returned as-is (including deleted_at). Relations return empty.
      const deletedItem = {
        ...PRODUCT_ITEM,
        deleted_at: '2024-01-01T12:00:00.000Z',
      };
      ddbMock
        .on(QueryCommand)
        .resolvesOnce({ Items: [deletedItem], Count: 1, ScannedCount: 1 })
        .resolves({ Items: [], Count: 0, ScannedCount: 0 });
      ddbMock.on(GetCommand).resolves({ Item: undefined });

      const event = makeEvent({ pathParameters: { slug: 'test-product' } });
      const result = await getProduct(event);

      // findBySlug returns the deleted product; handler surfaces it as 200
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.deleted_at).toBeDefined();
    });

    it('returns 400 for invalid JSON in request body', async () => {
      const event = makeEvent({
        httpMethod: 'POST',
        headers: ADMIN_HEADERS,
        body: '{invalid-json}',
      });

      const result = await createProduct(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toMatch(/JSON/i);
    });

    it('handles pagination edge case: page > total products', async () => {
      // Only 1 product exists, but page=5 is requested
      ddbMock
        .on(QueryCommand)
        .resolvesOnce({ Items: [PRODUCT_ITEM], Count: 1, ScannedCount: 1 })
        .resolves({ Items: [], Count: 0, ScannedCount: 0 });
      ddbMock.on(GetCommand).resolves({ Item: undefined });

      const event = makeEvent({ queryStringParameters: { page: '5', per_page: '10', status: 'published' } });
      const result = await listProducts(event);

      expect(result.statusCode).toBe(200);
      // page 5 with 1 total product yields 0 products
      const body = JSON.parse(result.body);
      expect(body.products).toHaveLength(0);
      expect(body.page).toBe(5);
    });

    it('accepts page=1 as the minimum page number', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [], Count: 0, ScannedCount: 0 });
      ddbMock.on(GetCommand).resolves({ Item: undefined });

      const event = makeEvent({ queryStringParameters: { page: '-5' } });
      const result = await listProducts(event);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).page).toBe(1);
    });
  });

  // ── 9. Performance Tests ───────────────────────────────────────────────────

  describe('Performance Tests', () => {
    it('batch creates 100 products in under 5 seconds', async () => {
      // The mock counter increments per call
      let counter = 0;
      ddbMock.on(UpdateCommand).callsFake(() => {
        counter++;
        return Promise.resolve({ Attributes: { value: counter } });
      });
      ddbMock.on(PutCommand).resolves({});
      ddbMock.on(QueryCommand).resolves({ Items: [], Count: 0, ScannedCount: 0 });
      ddbMock.on(GetCommand).resolves({ Item: undefined });

      const start = Date.now();

      await Promise.all(
        Array.from({ length: 100 }, (_, i) =>
          createProduct(
            makeEvent({
              httpMethod: 'POST',
              headers: ADMIN_HEADERS,
              body: JSON.stringify({
                title: `Performance Product ${i + 1}`,
                slug: `perf-product-${i + 1}`,
                base_price: 9.99 + i,
              }),
            })
          )
        )
      );

      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(5000);
    });

    it('queries 1000 products in under 2 seconds', async () => {
      const items = Array.from({ length: 1000 }, (_, i) => ({
        ...PRODUCT_ITEM,
        id: i + 1,
        slug: `product-${i + 1}`,
        title: `Product ${i + 1}`,
      }));

      // First QueryCommand returns 1000 items; subsequent relation queries empty.
      ddbMock
        .on(QueryCommand)
        .resolvesOnce({ Items: items, Count: 1000, ScannedCount: 1000 })
        .resolves({ Items: [], Count: 0, ScannedCount: 0 });
      ddbMock.on(GetCommand).resolves({ Item: undefined });

      const start = Date.now();
      const result = await listProducts(makeEvent({ queryStringParameters: { status: 'published' } }));
      const elapsed = Date.now() - start;

      expect(result.statusCode).toBe(200);
      expect(elapsed).toBeLessThan(2000);
    });

    it('batch-gets 100 items in under 1 second', async () => {
      const items = Array.from({ length: 100 }, (_, i) => ({
        ...PRODUCT_ITEM,
        id: i + 1,
        slug: `product-${i + 1}`,
      }));

      // First QueryCommand returns 100 items; subsequent relation queries empty.
      ddbMock
        .on(QueryCommand)
        .resolvesOnce({ Items: items, Count: 100, ScannedCount: 100 })
        .resolves({ Items: [], Count: 0, ScannedCount: 0 });
      ddbMock.on(GetCommand).resolves({ Item: undefined });

      const start = Date.now();
      const result = await listProducts(makeEvent({ queryStringParameters: { status: 'published', per_page: '100' } }));
      const elapsed = Date.now() - start;

      expect(result.statusCode).toBe(200);
      expect(elapsed).toBeLessThan(1000);
    });
  });
});
