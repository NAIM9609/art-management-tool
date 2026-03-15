/**
 * Security Tests: SQL / NoSQL Injection
 *
 * Although the application uses DynamoDB (not SQL), it must still be resilient
 * against:
 *   - NoSQL operator injection ($ne, $gt, $where, $regex, etc.) in query strings
 *     and request bodies
 *   - JavaScript injection via JSON payloads
 *   - Prototype pollution attempts via crafted JSON
 *   - Classic SQL injection strings passed to string-typed fields
 *
 * All tests verify that the handler returns a non-5xx status code and does not
 * throw an unhandled exception.  DynamoDB SDK calls are mocked so no real DB
 * interaction occurs.
 */

// Set environment variables before any imports
process.env.DYNAMODB_TABLE_NAME = 'test-security';
process.env.AWS_REGION = 'us-east-1';
process.env.JWT_SECRET = 'test-secret';

import jwt from 'jsonwebtoken';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockCreateProduct = jest.fn();
const mockListProducts = jest.fn();
const mockGetProductBySlug = jest.fn();
const mockUpdateProduct = jest.fn();
const mockDeleteProduct = jest.fn();
const mockGetProductById = jest.fn();
const mockAddVariant = jest.fn();
const mockUpdateVariant = jest.fn();
const mockListImages = jest.fn();
const mockDeleteImage = jest.fn();

jest.mock('../../src/services/ProductService', () => ({
  ProductService: jest.fn().mockImplementation(() => ({
    listProducts: mockListProducts,
    getProductBySlug: mockGetProductBySlug,
    getProductById: mockGetProductById,
    createProduct: mockCreateProduct,
    updateProduct: mockUpdateProduct,
    deleteProduct: mockDeleteProduct,
    addVariant: mockAddVariant,
    updateVariant: mockUpdateVariant,
    listImages: mockListImages,
    deleteImage: mockDeleteImage,
  })),
  ProductStatus: {
    PUBLISHED: 'published',
    DRAFT: 'draft',
    ARCHIVED: 'archived',
  },
}));

jest.mock('../../src/services/dynamodb/DynamoDBOptimized', () => ({
  DynamoDBOptimized: jest.fn().mockImplementation(() => ({})),
}));

import {
  createProduct,
  listProducts,
  getProduct,
  updateProduct,
} from '../../services/product-service/src/handlers/product.handler';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const JWT_SECRET = 'test-secret';

function makeAdminToken(): string {
  return jwt.sign({ id: 1, username: 'admin' }, JWT_SECRET);
}

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    httpMethod: 'POST',
    path: '/',
    pathParameters: null,
    queryStringParameters: null,
    headers: { Authorization: `Bearer ${makeAdminToken()}` },
    body: null,
    ...overrides,
  };
}

// ─── Classic SQL Injection in String Fields ────────────────────────────────────

const SQL_INJECTION_PAYLOADS = [
  "' OR '1'='1",
  '"; DROP TABLE products; --',
  "1' OR 1=1 --",
  "' UNION SELECT * FROM users --",
  "admin'--",
  "1; SELECT * FROM information_schema.tables --",
];

describe('SQL/NoSQL Injection: Classic SQL injection strings in body fields', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each(SQL_INJECTION_PAYLOADS)(
    'SQL payload "%s" in title field does not cause 5xx',
    async (payload) => {
      // Handler passes the string to the (mocked) service; what matters is no 5xx
      mockCreateProduct.mockResolvedValueOnce({
        id: 1,
        title: payload,
        slug: 'injection-test',
        base_price: 10,
      });

      const result = await createProduct(
        makeEvent({
          body: JSON.stringify({ title: payload, slug: 'injection-test', base_price: 10 }),
        })
      );

      expect(result.statusCode).toBeLessThan(500);
    }
  );

  it.each(SQL_INJECTION_PAYLOADS)(
    'SQL payload "%s" in slug field does not cause 5xx',
    async (payload) => {
      mockCreateProduct.mockResolvedValueOnce({
        id: 1,
        title: 'Art',
        slug: payload,
        base_price: 10,
      });

      const result = await createProduct(
        makeEvent({
          body: JSON.stringify({ title: 'Art', slug: payload, base_price: 10 }),
        })
      );

      expect(result.statusCode).toBeLessThan(500);
    }
  );

  it.each(SQL_INJECTION_PAYLOADS)(
    'SQL payload "%s" in search query parameter does not cause 5xx',
    async (payload) => {
      mockListProducts.mockResolvedValueOnce({ products: [], total: 0 });

      const result = await listProducts(
        makeEvent({
          headers: {},
          queryStringParameters: { search: payload },
        })
      );

      expect(result.statusCode).toBeLessThan(500);
    }
  );
});

// ─── NoSQL Operator Injection in Query Parameters ─────────────────────────────

describe('SQL/NoSQL Injection: Operator injection in query string parameters', () => {
  beforeEach(() => jest.clearAllMocks());

  it('$ne operator in "category" query param is treated as a plain string', async () => {
    mockListProducts.mockResolvedValueOnce({ products: [], total: 0 });

    // The handler reads qs.category as a plain string and passes it to the
    // service. The DynamoDB SDK — not the handler — is responsible for
    // preventing operator injection; here we confirm no crash occurs.
    const result = await listProducts(
      makeEvent({
        headers: {},
        queryStringParameters: { category: '{"$ne":""}' },
      })
    );

    expect(result.statusCode).toBe(200);
  });

  it('$gt operator in "min_price" is parsed as NaN and ignored', async () => {
    mockListProducts.mockResolvedValueOnce({ products: [], total: 0 });

    const result = await listProducts(
      makeEvent({
        headers: {},
        queryStringParameters: { min_price: '{"$gt":0}' },
      })
    );

    expect(result.statusCode).toBe(200);
    // parseFloat('{"$gt":0}') === NaN, so minPrice filter must not be set
    expect(mockListProducts).toHaveBeenCalledWith(
      expect.not.objectContaining({ minPrice: expect.anything() }),
      expect.any(Number),
      expect.any(Number)
    );
  });

  it('$where operator string in "search" query param does not cause 5xx', async () => {
    mockListProducts.mockResolvedValueOnce({ products: [], total: 0 });

    const result = await listProducts(
      makeEvent({
        headers: {},
        queryStringParameters: { search: '{"$where":"function(){return true}"}' },
      })
    );

    expect(result.statusCode).toBe(200);
  });

  it('"page" set to an injection string falls back to page 1', async () => {
    mockListProducts.mockResolvedValueOnce({ products: [], total: 0 });

    const result = await listProducts(
      makeEvent({
        headers: {},
        queryStringParameters: { page: "1 OR 1=1" },
      })
    );

    expect(result.statusCode).toBe(200);
    // parseInt('1 OR 1=1') === 1, so this should be treated as page 1
    expect(mockListProducts).toHaveBeenCalledWith(expect.anything(), 1, expect.any(Number));
  });
});

// ─── NoSQL Operator Injection in Request Body ─────────────────────────────────

describe('SQL/NoSQL Injection: Operator injection in request body', () => {
  beforeEach(() => jest.clearAllMocks());

  it('body with $set operator key does not cause 5xx', async () => {
    // Payload that mimics a MongoDB update operator injection
    const injectionBody = {
      title: 'Art',
      slug: 'art',
      base_price: 10,
      $set: { admin: true },
    };
    mockCreateProduct.mockResolvedValueOnce({ id: 1, title: 'Art', slug: 'art', base_price: 10 });

    const result = await createProduct(
      makeEvent({ body: JSON.stringify(injectionBody) })
    );

    // Handler accepts extra keys; no 5xx regardless
    expect(result.statusCode).toBeLessThan(500);
  });

  it('body with $where key does not cause 5xx', async () => {
    const injectionBody = {
      title: 'Art',
      slug: 'art',
      base_price: 10,
      $where: 'function() { return true; }',
    };
    mockCreateProduct.mockResolvedValueOnce({ id: 1, title: 'Art', slug: 'art', base_price: 10 });

    const result = await createProduct(
      makeEvent({ body: JSON.stringify(injectionBody) })
    );

    expect(result.statusCode).toBeLessThan(500);
  });

  it('body with deeply nested $regex operator does not cause 5xx', async () => {
    const injectionBody = {
      title: { $regex: '.*' },
      slug: 'art',
      base_price: 10,
    };

    // title is not a string → validation should reject with 400
    const result = await createProduct(
      makeEvent({ body: JSON.stringify(injectionBody) })
    );

    expect(result.statusCode).toBe(400);
  });

  it('update body with $inc operator key does not cause 5xx', async () => {
    const injectionBody = {
      title: 'Updated',
      $inc: { base_price: 1000 },
    };
    mockUpdateProduct.mockResolvedValueOnce({ id: 1, title: 'Updated' });

    const result = await updateProduct(
      makeEvent({
        pathParameters: { id: '1' },
        body: JSON.stringify(injectionBody),
      })
    );

    expect(result.statusCode).toBeLessThan(500);
  });
});

// ─── Prototype Pollution ──────────────────────────────────────────────────────

describe('SQL/NoSQL Injection: Prototype pollution via crafted JSON', () => {
  beforeEach(() => jest.clearAllMocks());

  it('__proto__ key in body does not pollute Object.prototype', async () => {
    // JSON.parse does NOT restore __proto__ chains, so this is a non-issue for
    // well-formed JSON, but we confirm the handler doesn't crash.
    const pollutionBody = '{"title":"Art","slug":"art","base_price":10,"__proto__":{"admin":true}}';
    mockCreateProduct.mockResolvedValueOnce({ id: 1, title: 'Art', slug: 'art', base_price: 10 });

    const protoAdminBefore = ({} as Record<string, unknown>)['admin'];

    const result = await createProduct(
      makeEvent({ body: pollutionBody })
    );

    // Object.prototype must not have been mutated
    expect(({} as Record<string, unknown>)['admin']).toBe(protoAdminBefore);
    expect(result.statusCode).toBeLessThan(500);
  });

  it('constructor.prototype key in body does not cause 5xx', async () => {
    const pollutionBody = JSON.stringify({
      title: 'Art',
      slug: 'art',
      base_price: 10,
      'constructor': { 'prototype': { 'isAdmin': true } },
    });
    mockCreateProduct.mockResolvedValueOnce({ id: 1, title: 'Art', slug: 'art', base_price: 10 });

    const result = await createProduct(
      makeEvent({ body: pollutionBody })
    );

    expect(result.statusCode).toBeLessThan(500);
  });
});

// ─── Path Parameter Injection ─────────────────────────────────────────────────

describe('SQL/NoSQL Injection: Injection via path parameters', () => {
  beforeEach(() => jest.clearAllMocks());

  it('SQL injection string as product slug does not cause 5xx', async () => {
    mockGetProductBySlug.mockResolvedValueOnce(null);

    const result = await getProduct(
      makeEvent({
        headers: {},
        pathParameters: { slug: "' OR '1'='1" },
      })
    );

    // Slug is passed as a plain string to the (mocked) service; expect 404
    expect(result.statusCode).toBe(404);
  });

  it('NoSQL operator in slug path param does not cause 5xx', async () => {
    mockGetProductBySlug.mockResolvedValueOnce(null);

    const result = await getProduct(
      makeEvent({
        headers: {},
        pathParameters: { slug: '{"$ne":null}' },
      })
    );

    expect(result.statusCode).toBe(404);
  });
});
