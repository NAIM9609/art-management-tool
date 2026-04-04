/**
 * Security Tests: Authentication
 *
 * Verifies that API endpoints correctly enforce JWT-based authentication:
 *   - Valid JWT is accepted
 *   - Missing, malformed, invalid, and expired tokens are rejected with 401
 *   - Demo token accepted for backward compatibility
 *   - Public endpoints do not require authentication
 */

// Set environment variables before any imports
process.env.DYNAMODB_TABLE_NAME = 'test-security';
process.env.AWS_REGION_CUSTOM = 'us-east-1';
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
  updateProduct,
  deleteProduct,
} from '../../services/product-service/src/handlers/product.handler';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const JWT_SECRET = 'test-secret';

function makeValidToken(): string {
  return jwt.sign({ id: 1, username: 'admin' }, JWT_SECRET);
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

const VALID_PRODUCT_BODY = JSON.stringify({ title: 'Art', slug: 'art', base_price: 10 });

// ─── Authentication Tests ─────────────────────────────────────────────────────

describe('Authentication: Admin endpoints require valid JWT', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('POST /api/products (createProduct)', () => {
    it('returns 401 when Authorization header is missing', async () => {
      const result = await createProduct(
        makeEvent({ headers: {}, body: VALID_PRODUCT_BODY })
      );

      expect(result.statusCode).toBe(401);
    });

    it('returns 401 when Authorization header has wrong format (no Bearer prefix)', async () => {
      const result = await createProduct(
        makeEvent({
          headers: { Authorization: 'Token bad-format' },
          body: VALID_PRODUCT_BODY,
        })
      );

      expect(result.statusCode).toBe(401);
    });

    it('returns 401 when JWT is signed with a wrong secret', async () => {
      const wrongToken = jwt.sign({ id: 1, username: 'admin' }, 'wrong-secret');

      const result = await createProduct(
        makeEvent({
          headers: { Authorization: `Bearer ${wrongToken}` },
          body: VALID_PRODUCT_BODY,
        })
      );

      expect(result.statusCode).toBe(401);
    });

    it('returns 401 when JWT is expired', async () => {
      const expiredToken = jwt.sign({ id: 1, username: 'admin' }, JWT_SECRET, {
        expiresIn: -1,
      });

      const result = await createProduct(
        makeEvent({
          headers: { Authorization: `Bearer ${expiredToken}` },
          body: VALID_PRODUCT_BODY,
        })
      );

      expect(result.statusCode).toBe(401);
    });

    it('returns 401 when token is completely invalid (garbage string)', async () => {
      const result = await createProduct(
        makeEvent({
          headers: { Authorization: 'Bearer not.a.valid.jwt' },
          body: VALID_PRODUCT_BODY,
        })
      );

      expect(result.statusCode).toBe(401);
    });

    it('returns 401 when Bearer token value is empty', async () => {
      const result = await createProduct(
        makeEvent({
          headers: { Authorization: 'Bearer ' },
          body: VALID_PRODUCT_BODY,
        })
      );

      expect(result.statusCode).toBe(401);
    });

    it('accepts a valid JWT and processes the request', async () => {
      mockCreateProduct.mockResolvedValueOnce({
        id: 1,
        title: 'Art',
        slug: 'art',
        base_price: 10,
      });

      const result = await createProduct(
        makeEvent({
          headers: { Authorization: `Bearer ${makeValidToken()}` },
          body: VALID_PRODUCT_BODY,
        })
      );

      expect(result.statusCode).toBe(201);
    });

    it('accepts lowercase "authorization" header (API Gateway normalization)', async () => {
      mockCreateProduct.mockResolvedValueOnce({
        id: 1,
        title: 'Art',
        slug: 'art',
        base_price: 10,
      });

      const result = await createProduct(
        makeEvent({
          headers: { authorization: `Bearer ${makeValidToken()}` },
          body: VALID_PRODUCT_BODY,
        })
      );

      expect(result.statusCode).toBe(201);
    });

    it('accepts the legacy demo-token-12345 for backward compatibility', async () => {
      mockCreateProduct.mockResolvedValueOnce({
        id: 1,
        title: 'Art',
        slug: 'art',
        base_price: 10,
      });

      const result = await createProduct(
        makeEvent({
          headers: { Authorization: 'Bearer demo-token-12345' },
          body: VALID_PRODUCT_BODY,
        })
      );

      expect(result.statusCode).toBe(201);
    });
  });

  describe('PUT /api/products/:id (updateProduct)', () => {
    it('returns 401 when Authorization header is missing', async () => {
      const result = await updateProduct(
        makeEvent({
          headers: {},
          pathParameters: { id: '1' },
          body: JSON.stringify({ title: 'Updated' }),
        })
      );

      expect(result.statusCode).toBe(401);
    });

    it('returns 401 when JWT is expired', async () => {
      const expiredToken = jwt.sign({ id: 1, username: 'admin' }, JWT_SECRET, {
        expiresIn: -1,
      });

      const result = await updateProduct(
        makeEvent({
          headers: { Authorization: `Bearer ${expiredToken}` },
          pathParameters: { id: '1' },
          body: JSON.stringify({ title: 'Updated' }),
        })
      );

      expect(result.statusCode).toBe(401);
    });

    it('accepts a valid JWT', async () => {
      mockUpdateProduct.mockResolvedValueOnce({ id: 1, title: 'Updated' });

      const result = await updateProduct(
        makeEvent({
          headers: { Authorization: `Bearer ${makeValidToken()}` },
          pathParameters: { id: '1' },
          body: JSON.stringify({ title: 'Updated' }),
        })
      );

      expect(result.statusCode).toBe(200);
    });
  });

  describe('DELETE /api/products/:id (deleteProduct)', () => {
    it('returns 401 when Authorization header is missing', async () => {
      const result = await deleteProduct(
        makeEvent({
          headers: {},
          pathParameters: { id: '1' },
        })
      );

      expect(result.statusCode).toBe(401);
    });

    it('returns 401 when JWT uses wrong secret', async () => {
      const badToken = jwt.sign({ id: 1, username: 'admin' }, 'wrong-secret');

      const result = await deleteProduct(
        makeEvent({
          headers: { Authorization: `Bearer ${badToken}` },
          pathParameters: { id: '1' },
        })
      );

      expect(result.statusCode).toBe(401);
    });

    it('accepts a valid JWT', async () => {
      mockDeleteProduct.mockResolvedValueOnce(undefined);

      const result = await deleteProduct(
        makeEvent({
          headers: { Authorization: `Bearer ${makeValidToken()}` },
          pathParameters: { id: '1' },
        })
      );

      expect(result.statusCode).toBe(200);
    });
  });
});

describe('Authentication: Public endpoints do not require JWT', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET /api/products returns 200 without any Authorization header', async () => {
    mockListProducts.mockResolvedValueOnce({ products: [], total: 0 });

    const result = await listProducts(makeEvent({ headers: {} }));

    expect(result.statusCode).toBe(200);
  });

  it('GET /api/products works with an invalid Authorization header present', async () => {
    mockListProducts.mockResolvedValueOnce({ products: [], total: 0 });

    const result = await listProducts(
      makeEvent({ headers: { Authorization: 'Bearer garbage-token' } })
    );

    expect(result.statusCode).toBe(200);
  });
});
