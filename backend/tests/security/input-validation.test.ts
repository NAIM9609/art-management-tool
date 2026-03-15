/**
 * Security Tests: Input Validation
 *
 * Verifies that API handlers correctly defend against common injection and
 * malformed-input attacks:
 *   - XSS payloads in request body / query strings do not crash the server
 *   - Malformed / missing JSON body returns 400
 *   - Path traversal in path parameters is handled safely
 *   - Oversized inputs do not crash the server
 *   - Null bytes and control characters are handled gracefully
 *   - Required-field validation is enforced
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

// ─── XSS Payloads ────────────────────────────────────────────────────────────

const XSS_PAYLOADS = [
  '<script>alert("xss")</script>',
  '"><img src=x onerror=alert(1)>',
  "'; DROP TABLE products; --",
  '<svg onload=alert(document.cookie)>',
  'javascript:alert(1)',
  '{{7*7}}',                          // template injection
  '${7*7}',                           // expression injection
];

describe('Input Validation: XSS payloads in request body', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each(XSS_PAYLOADS)(
    'XSS payload "%s" in title does not cause a 5xx error',
    async (payload) => {
      // The handler validates that the service did not throw; XSS stored in DB
      // is a separate concern—here we ensure the handler itself doesn't crash.
      mockCreateProduct.mockResolvedValueOnce({
        id: 1,
        title: payload,
        slug: 'xss-test',
        base_price: 10,
      });

      const result = await createProduct(
        makeEvent({
          body: JSON.stringify({ title: payload, slug: 'xss-test', base_price: 10 }),
        })
      );

      // Handler must respond with 2xx (stored) or 4xx (validation error), NOT 5xx
      expect(result.statusCode).toBeLessThan(500);
    }
  );

  it('XSS payload in query string search parameter does not crash listProducts', async () => {
    mockListProducts.mockResolvedValueOnce({ products: [], total: 0 });

    const result = await listProducts(
      makeEvent({
        headers: {},
        queryStringParameters: { search: '<script>alert(1)</script>' },
      })
    );

    expect(result.statusCode).toBe(200);
  });

  it('XSS payload in category query parameter does not crash listProducts', async () => {
    mockListProducts.mockResolvedValueOnce({ products: [], total: 0 });

    const result = await listProducts(
      makeEvent({
        headers: {},
        queryStringParameters: { category: '"><script>alert(1)</script>' },
      })
    );

    expect(result.statusCode).toBe(200);
  });
});

// ─── Malformed / Missing Body ──────────────────────────────────────────────────

describe('Input Validation: Malformed or missing request body', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 400 when body is completely absent', async () => {
    const result = await createProduct(makeEvent({ body: null }));

    expect(result.statusCode).toBe(400);
  });

  it('returns 400 when body is invalid JSON', async () => {
    const result = await createProduct(makeEvent({ body: '{invalid json' }));

    expect(result.statusCode).toBe(400);
  });

  it('returns 400 when body is an empty string', async () => {
    const result = await createProduct(makeEvent({ body: '' }));

    expect(result.statusCode).toBe(400);
  });

  it('returns 400 when body is a plain string (not JSON object)', async () => {
    const result = await createProduct(makeEvent({ body: '"just a string"' }));

    // Parsed as a string, not an object, so validation should fail
    expect(result.statusCode).toBe(400);
  });

  it('returns 400 when required field "title" is missing', async () => {
    const result = await createProduct(
      makeEvent({ body: JSON.stringify({ slug: 'art', base_price: 10 }) })
    );

    expect(result.statusCode).toBe(400);
  });

  it('returns 400 when required field "slug" is missing', async () => {
    const result = await createProduct(
      makeEvent({ body: JSON.stringify({ title: 'Art', base_price: 10 }) })
    );

    expect(result.statusCode).toBe(400);
  });

  it('returns 400 when required field "base_price" is missing', async () => {
    const result = await createProduct(
      makeEvent({ body: JSON.stringify({ title: 'Art', slug: 'art' }) })
    );

    expect(result.statusCode).toBe(400);
  });

  it('returns 400 when "base_price" is negative', async () => {
    const result = await createProduct(
      makeEvent({
        body: JSON.stringify({ title: 'Art', slug: 'art', base_price: -1 }),
      })
    );

    expect(result.statusCode).toBe(400);
  });

  it('returns 400 when "base_price" is a string instead of a number', async () => {
    const result = await createProduct(
      makeEvent({
        body: JSON.stringify({ title: 'Art', slug: 'art', base_price: 'ten' }),
      })
    );

    expect(result.statusCode).toBe(400);
  });

  it('returns 400 when updateProduct body has no fields', async () => {
    const result = await updateProduct(
      makeEvent({
        pathParameters: { id: '1' },
        body: JSON.stringify({}),
      })
    );

    expect(result.statusCode).toBe(400);
  });
});

// ─── Path Parameter Validation ────────────────────────────────────────────────

describe('Input Validation: Path traversal and invalid path parameters', () => {
  beforeEach(() => jest.clearAllMocks());

  it('non-numeric product id returns 400', async () => {
    const result = await updateProduct(
      makeEvent({
        pathParameters: { id: 'abc' },
        body: JSON.stringify({ title: 'Updated' }),
      })
    );

    expect(result.statusCode).toBe(400);
  });

  it('path traversal string as product id returns 400', async () => {
    const result = await updateProduct(
      makeEvent({
        pathParameters: { id: '../../../etc/passwd' },
        body: JSON.stringify({ title: 'Updated' }),
      })
    );

    expect(result.statusCode).toBe(400);
  });

  it('zero as product id returns 400', async () => {
    const result = await updateProduct(
      makeEvent({
        pathParameters: { id: '0' },
        body: JSON.stringify({ title: 'Updated' }),
      })
    );

    expect(result.statusCode).toBe(400);
  });

  it('negative product id returns 400', async () => {
    const result = await updateProduct(
      makeEvent({
        pathParameters: { id: '-1' },
        body: JSON.stringify({ title: 'Updated' }),
      })
    );

    expect(result.statusCode).toBe(400);
  });

  it('missing slug path parameter returns 400', async () => {
    const result = await getProduct(makeEvent({ pathParameters: null }));

    expect(result.statusCode).toBe(400);
  });

  it('path traversal string as slug does not cause 5xx', async () => {
    mockGetProductBySlug.mockResolvedValueOnce(null);

    const result = await getProduct(
      makeEvent({
        headers: {},
        pathParameters: { slug: '../../../etc/passwd' },
      })
    );

    // Should resolve to 404 (not found), not a 5xx crash
    expect(result.statusCode).toBe(404);
  });
});

// ─── Oversized and Special-Character Inputs ───────────────────────────────────

describe('Input Validation: Oversized and special-character inputs', () => {
  beforeEach(() => jest.clearAllMocks());

  it('extremely long title does not crash the handler', async () => {
    const longTitle = 'A'.repeat(10_000);
    mockCreateProduct.mockResolvedValueOnce({
      id: 1,
      title: longTitle,
      slug: 'long-title',
      base_price: 10,
    });

    const result = await createProduct(
      makeEvent({
        body: JSON.stringify({ title: longTitle, slug: 'long-title', base_price: 10 }),
      })
    );

    expect(result.statusCode).toBeLessThan(500);
  });

  it('null bytes in input string do not crash the handler', async () => {
    const titleWithNull = 'Art\x00Work';
    mockCreateProduct.mockResolvedValueOnce({
      id: 1,
      title: titleWithNull,
      slug: 'null-byte',
      base_price: 10,
    });

    const result = await createProduct(
      makeEvent({
        body: JSON.stringify({ title: titleWithNull, slug: 'null-byte', base_price: 10 }),
      })
    );

    expect(result.statusCode).toBeLessThan(500);
  });

  it('unicode control characters in input do not crash the handler', async () => {
    const title = 'Art\u0000\u0001\u001F';
    mockCreateProduct.mockResolvedValueOnce({ id: 1, title, slug: 'ctrl', base_price: 10 });

    const result = await createProduct(
      makeEvent({
        body: JSON.stringify({ title, slug: 'ctrl', base_price: 10 }),
      })
    );

    expect(result.statusCode).toBeLessThan(500);
  });

  it('extremely large per_page query parameter is capped and does not crash', async () => {
    mockListProducts.mockResolvedValueOnce({ products: [], total: 0 });

    const result = await listProducts(
      makeEvent({
        headers: {},
        queryStringParameters: { per_page: '999999999' },
      })
    );

    expect(result.statusCode).toBe(200);
    // Verify the service was called with a sane per_page (capped at MAX_PER_PAGE=100)
    expect(mockListProducts).toHaveBeenCalledWith(expect.anything(), 1, 100);
  });

  it('negative per_page query parameter is normalised and does not crash', async () => {
    mockListProducts.mockResolvedValueOnce({ products: [], total: 0 });

    const result = await listProducts(
      makeEvent({
        headers: {},
        queryStringParameters: { per_page: '-50' },
      })
    );

    expect(result.statusCode).toBe(200);
  });
});
