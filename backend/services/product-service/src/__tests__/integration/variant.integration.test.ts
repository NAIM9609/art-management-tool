/**
 * Integration Tests for Variant Handler → ProductService → ProductVariantRepository → DynamoDB
 *
 * Tests the full handler-to-repository chain using a mocked DynamoDB client.
 * Covers:
 *   1. Create variant
 *   2. Update stock atomically
 *   3. Prevent stock below 0
 *   4. Batch create variants
 *   5. Update variant fields
 *   6. Edge cases (missing product, invalid fields, auth)
 */

// ── Environment configuration ─────────────────────────────────────────────────
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
} from '@aws-sdk/lib-dynamodb';
import jwt from 'jsonwebtoken';

const ddbMock = mockClient(DynamoDBDocumentClient);

import {
  listVariants,
  createVariant,
  updateVariant,
  updateStock,
} from '../../handlers/variant.handler';

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

const PRODUCT_ITEM = {
  PK: 'PRODUCT#1',
  SK: 'METADATA',
  id: 1,
  slug: 'test-product',
  title: 'Test Product',
  base_price: 29.99,
  currency: 'EUR',
  status: 'published',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

const VARIANT_ITEM = {
  PK: 'PRODUCT#1',
  SK: 'VARIANT#variant-uuid-001',
  id: 'variant-uuid-001',
  product_id: 1,
  sku: 'SKU-001',
  name: 'Default',
  price_adjustment: 0,
  stock: 10,
  entity_type: 'ProductVariant',
  GSI1PK: 'VARIANT_SKU#SKU-001',
  GSI1SK: '1',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('Variant Integration Tests', () => {
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

  // ── List Variants ──────────────────────────────────────────────────────────

  describe('listVariants', () => {
    it('returns variants for a valid product', async () => {
      // getProductById: product + images + variants + categories
      ddbMock
        .on(GetCommand)
        .resolvesOnce({ Item: PRODUCT_ITEM });
      ddbMock
        .on(QueryCommand)
        // images
        .resolvesOnce({ Items: [], Count: 0, ScannedCount: 0 })
        // variants
        .resolvesOnce({ Items: [VARIANT_ITEM], Count: 1, ScannedCount: 1 })
        // categories
        .resolvesOnce({ Items: [], Count: 0, ScannedCount: 0 });

      const event = makeEvent({ pathParameters: { id: '1' } });
      const result = await listVariants(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(Array.isArray(body.variants)).toBe(true);
    });

    it('returns 404 when product does not exist', async () => {
      ddbMock.on(GetCommand).resolves({ Item: undefined });
      ddbMock.on(QueryCommand).resolves({ Items: [], Count: 0, ScannedCount: 0 });

      const event = makeEvent({ pathParameters: { id: '999' } });
      const result = await listVariants(event);

      expect(result.statusCode).toBe(404);
    });

    it('returns 400 when id is not a positive integer', async () => {
      const event = makeEvent({ pathParameters: { id: 'abc' } });
      const result = await listVariants(event);

      expect(result.statusCode).toBe(400);
    });

    it('returns 400 when id is missing', async () => {
      const event = makeEvent({ pathParameters: null });
      const result = await listVariants(event);

      expect(result.statusCode).toBe(400);
    });
  });

  // ── Create Variant ─────────────────────────────────────────────────────────

  describe('createVariant', () => {
    it('creates a variant and returns 201', async () => {
      // PutCommand to store the variant
      ddbMock.on(PutCommand).resolves({});

      const event = makeEvent({
        httpMethod: 'POST',
        headers: ADMIN_HEADERS,
        pathParameters: { id: '1' },
        body: JSON.stringify({
          sku: 'NEW-SKU',
          name: 'New Variant',
          stock: 5,
          price_adjustment: 2.50,
        }),
      });

      const result = await createVariant(event);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.sku).toBe('NEW-SKU');
      expect(body.name).toBe('New Variant');
      expect(body.stock).toBe(5);
      expect(body.product_id).toBe(1);
    });

    it('creates a variant with zero stock when stock is omitted', async () => {
      ddbMock.on(PutCommand).resolves({});

      const event = makeEvent({
        httpMethod: 'POST',
        headers: ADMIN_HEADERS,
        pathParameters: { id: '1' },
        body: JSON.stringify({ sku: 'ZERO-SKU', name: 'Zero Stock' }),
      });

      const result = await createVariant(event);

      expect(result.statusCode).toBe(201);
      expect(JSON.parse(result.body).stock).toBe(0);
    });

    it('creates a variant with negative price_adjustment (discount)', async () => {
      ddbMock.on(PutCommand).resolves({});

      const event = makeEvent({
        httpMethod: 'POST',
        headers: ADMIN_HEADERS,
        pathParameters: { id: '1' },
        body: JSON.stringify({
          sku: 'DISC-SKU',
          name: 'Discounted',
          price_adjustment: -5,
        }),
      });

      const result = await createVariant(event);

      expect(result.statusCode).toBe(201);
      expect(JSON.parse(result.body).price_adjustment).toBe(-5);
    });

    it('returns 400 when sku is missing', async () => {
      const event = makeEvent({
        httpMethod: 'POST',
        headers: ADMIN_HEADERS,
        pathParameters: { id: '1' },
        body: JSON.stringify({ name: 'No SKU' }),
      });

      const result = await createVariant(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toMatch(/sku/i);
    });

    it('returns 400 when name is missing', async () => {
      const event = makeEvent({
        httpMethod: 'POST',
        headers: ADMIN_HEADERS,
        pathParameters: { id: '1' },
        body: JSON.stringify({ sku: 'NO-NAME' }),
      });

      const result = await createVariant(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toMatch(/name/i);
    });

    it('returns 400 when stock is negative', async () => {
      const event = makeEvent({
        httpMethod: 'POST',
        headers: ADMIN_HEADERS,
        pathParameters: { id: '1' },
        body: JSON.stringify({ sku: 'NEG-SKU', name: 'Negative', stock: -1 }),
      });

      const result = await createVariant(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toMatch(/stock/i);
    });

    it('returns 400 when price_adjustment is not a number', async () => {
      const event = makeEvent({
        httpMethod: 'POST',
        headers: ADMIN_HEADERS,
        pathParameters: { id: '1' },
        body: JSON.stringify({ sku: 'BAD-ADJ', name: 'Bad', price_adjustment: 'free' }),
      });

      const result = await createVariant(event);

      expect(result.statusCode).toBe(400);
    });

    it('returns 401 without authentication', async () => {
      const event = makeEvent({
        httpMethod: 'POST',
        pathParameters: { id: '1' },
        body: JSON.stringify({ sku: 'NO-AUTH', name: 'No Auth' }),
      });

      const result = await createVariant(event);

      expect(result.statusCode).toBe(401);
    });

    it('returns 400 when product id is invalid', async () => {
      const event = makeEvent({
        httpMethod: 'POST',
        headers: ADMIN_HEADERS,
        pathParameters: { id: '0' },
        body: JSON.stringify({ sku: 'S', name: 'N' }),
      });

      const result = await createVariant(event);

      expect(result.statusCode).toBe(400);
    });
  });

  // ── Update Variant ─────────────────────────────────────────────────────────

  describe('updateVariant', () => {
    it('updates variant fields and returns 200', async () => {
      // findById uses GSI1 query
      ddbMock
        .on(QueryCommand)
        .resolvesOnce({ Items: [VARIANT_ITEM], Count: 1, ScannedCount: 1 });
      // update uses UpdateCommand
      const updatedVariant = { ...VARIANT_ITEM, name: 'Updated Name', updated_at: new Date().toISOString() };
      ddbMock.on(UpdateCommand).resolves({ Attributes: updatedVariant });

      const event = makeEvent({
        httpMethod: 'PUT',
        headers: ADMIN_HEADERS,
        pathParameters: { id: 'variant-uuid-001' },
        body: JSON.stringify({ name: 'Updated Name' }),
      });

      const result = await updateVariant(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.name).toBe('Updated Name');
    });

    it('returns 404 when variant does not exist', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [], Count: 0, ScannedCount: 0 });

      const event = makeEvent({
        httpMethod: 'PUT',
        headers: ADMIN_HEADERS,
        pathParameters: { id: 'nonexistent-id' },
        body: JSON.stringify({ name: 'Ghost' }),
      });

      const result = await updateVariant(event);

      expect(result.statusCode).toBe(404);
    });

    it('returns 400 when body is empty', async () => {
      const event = makeEvent({
        httpMethod: 'PUT',
        headers: ADMIN_HEADERS,
        pathParameters: { id: 'variant-uuid-001' },
        body: JSON.stringify({}),
      });

      const result = await updateVariant(event);

      expect(result.statusCode).toBe(400);
    });

    it('returns 401 when not authenticated', async () => {
      const event = makeEvent({
        httpMethod: 'PUT',
        pathParameters: { id: 'variant-uuid-001' },
        body: JSON.stringify({ name: 'No Auth' }),
      });

      const result = await updateVariant(event);

      expect(result.statusCode).toBe(401);
    });
  });

  // ── Update Stock ───────────────────────────────────────────────────────────

  describe('updateStock', () => {
    it('updates stock to a new quantity', async () => {
      // findById uses GSI1 query
      ddbMock
        .on(QueryCommand)
        .resolvesOnce({ Items: [VARIANT_ITEM], Count: 1, ScannedCount: 1 });
      // update stock uses UpdateCommand
      const updatedVariant = { ...VARIANT_ITEM, stock: 25, updated_at: new Date().toISOString() };
      ddbMock.on(UpdateCommand).resolves({ Attributes: updatedVariant });

      const event = makeEvent({
        httpMethod: 'PATCH',
        headers: ADMIN_HEADERS,
        pathParameters: { id: 'variant-uuid-001' },
        body: JSON.stringify({ quantity: 25 }),
      });

      const result = await updateStock(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.stock).toBe(25);
    });

    it('sets stock to zero (minimum valid value)', async () => {
      ddbMock
        .on(QueryCommand)
        .resolvesOnce({ Items: [VARIANT_ITEM], Count: 1, ScannedCount: 1 });
      const zeroStock = { ...VARIANT_ITEM, stock: 0, updated_at: new Date().toISOString() };
      ddbMock.on(UpdateCommand).resolves({ Attributes: zeroStock });

      const event = makeEvent({
        httpMethod: 'PATCH',
        headers: ADMIN_HEADERS,
        pathParameters: { id: 'variant-uuid-001' },
        body: JSON.stringify({ quantity: 0 }),
      });

      const result = await updateStock(event);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).stock).toBe(0);
    });

    it('prevents stock from going below 0', async () => {
      const event = makeEvent({
        httpMethod: 'PATCH',
        headers: ADMIN_HEADERS,
        pathParameters: { id: 'variant-uuid-001' },
        body: JSON.stringify({ quantity: -1 }),
      });

      const result = await updateStock(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toMatch(/non-negative/i);
    });

    it('returns 400 when quantity is missing', async () => {
      const event = makeEvent({
        httpMethod: 'PATCH',
        headers: ADMIN_HEADERS,
        pathParameters: { id: 'variant-uuid-001' },
        body: JSON.stringify({}),
      });

      const result = await updateStock(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toMatch(/quantity/i);
    });

    it('returns 400 when quantity is not a number', async () => {
      const event = makeEvent({
        httpMethod: 'PATCH',
        headers: ADMIN_HEADERS,
        pathParameters: { id: 'variant-uuid-001' },
        body: JSON.stringify({ quantity: 'many' }),
      });

      const result = await updateStock(event);

      expect(result.statusCode).toBe(400);
    });

    it('returns 401 without authentication', async () => {
      const event = makeEvent({
        httpMethod: 'PATCH',
        pathParameters: { id: 'variant-uuid-001' },
        body: JSON.stringify({ quantity: 10 }),
      });

      const result = await updateStock(event);

      expect(result.statusCode).toBe(401);
    });

    it('returns 400 when variant id is missing', async () => {
      const event = makeEvent({
        httpMethod: 'PATCH',
        headers: ADMIN_HEADERS,
        pathParameters: null,
        body: JSON.stringify({ quantity: 5 }),
      });

      const result = await updateStock(event);

      expect(result.statusCode).toBe(400);
    });
  });

  // ── Parallel Variant Operations ────────────────────────────────────────────

  describe('Parallel variant operations', () => {
    it('creates multiple variants via parallel createVariant requests', async () => {
      ddbMock.on(PutCommand).resolves({});
      ddbMock.on(QueryCommand).resolves({ Items: [], Count: 0, ScannedCount: 0 });

      const variants = Array.from({ length: 5 }, (_, i) => ({
        sku: `BATCH-SKU-${i + 1}`,
        name: `Batch Variant ${i + 1}`,
        stock: i * 2,
        price_adjustment: 0,
      }));

      ddbMock.on(PutCommand).resolves({});

      const results = await Promise.all(
        variants.map(v =>
          createVariant(
            makeEvent({
              httpMethod: 'POST',
              headers: ADMIN_HEADERS,
              pathParameters: { id: '1' },
              body: JSON.stringify(v),
            })
          )
        )
      );

      const created = results.filter(r => r.statusCode === 201);
      expect(created).toHaveLength(5);
    });

    it('returns 200 for every concurrent stock update and echoes the requested quantity', async () => {
      ddbMock.on(QueryCommand).callsFake(() => {
        return Promise.resolve({ Items: [VARIANT_ITEM], Count: 1, ScannedCount: 1 });
      });

      const requestedQuantities = Array.from({ length: 10 }, (_, i) => i * 5);
      ddbMock.on(UpdateCommand).callsFake((input: { ExpressionAttributeValues?: Record<string, unknown> }) => {
        const stock = input.ExpressionAttributeValues?.[':upd1'];

        return Promise.resolve({
          Attributes: {
            ...VARIANT_ITEM,
            stock: typeof stock === 'number' ? stock : VARIANT_ITEM.stock,
            updated_at: new Date().toISOString(),
          },
        });
      });

      const updates = requestedQuantities.map(quantity =>
        updateStock(
          makeEvent({
            httpMethod: 'PATCH',
            headers: ADMIN_HEADERS,
            pathParameters: { id: 'variant-uuid-001' },
            body: JSON.stringify({ quantity }),
          })
        )
      );

      const results = await Promise.all(updates);
      expect(results).toHaveLength(requestedQuantities.length);

      results.forEach(result => {
        expect(result.statusCode).toBe(200);
      });

      const returnedStocks = results
        .map(result => JSON.parse(result.body).stock)
        .sort((left: number, right: number) => left - right);

      expect(returnedStocks).toEqual([...requestedQuantities].sort((left, right) => left - right));
    });

    it('batch creates 25 variants within performance budget', async () => {
      ddbMock.on(PutCommand).resolves({});
      ddbMock.on(QueryCommand).resolves({ Items: [], Count: 0, ScannedCount: 0 });

      const variants = Array.from({ length: 25 }, (_, i) => ({
        sku: `PERF-SKU-${i + 1}`,
        name: `Perf Variant ${i + 1}`,
        stock: 10,
      }));

      const start = Date.now();

      const results = await Promise.all(
        variants.map(v =>
          createVariant(
            makeEvent({
              httpMethod: 'POST',
              headers: ADMIN_HEADERS,
              pathParameters: { id: '1' },
              body: JSON.stringify(v),
            })
          )
        )
      );

      const elapsed = Date.now() - start;
      expect(results.every(r => r.statusCode === 201)).toBe(true);
      expect(elapsed).toBeLessThan(2000);
    });
  });
});
