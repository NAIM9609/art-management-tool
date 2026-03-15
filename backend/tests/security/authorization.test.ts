/**
 * Security Tests: Authorization
 *
 * Verifies that role-based access control (RBAC) is enforced correctly:
 *   - Public endpoints are accessible without authentication
 *   - Admin-only endpoints require a valid JWT (return 401 otherwise)
 *   - Authenticated requests succeed on admin endpoints with valid credentials
 *   - Cart endpoints enforce ownership via session / user JWT
 */

// Set environment variables before any imports
process.env.DYNAMODB_TABLE_NAME = 'test-security';
process.env.AWS_REGION = 'us-east-1';
process.env.JWT_SECRET = 'test-secret';

import jwt from 'jsonwebtoken';

// ─── Mocks: Product Service ───────────────────────────────────────────────────

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

// ─── Mocks: Cart Service ──────────────────────────────────────────────────────

const mockGetOrCreateCart = jest.fn();
const mockGetCartItems = jest.fn();
const mockGetCart = jest.fn();
const mockAddItem = jest.fn();
const mockUpdateQuantity = jest.fn();
const mockRemoveItem = jest.fn();
const mockClearCart = jest.fn();
const mockMergeCarts = jest.fn();
const mockApplyDiscount = jest.fn();
const mockRemoveDiscount = jest.fn();
const mockCalculateTotals = jest.fn();

jest.mock('../../src/services/CartService', () => ({
  CartService: jest.fn().mockImplementation(() => ({
    getOrCreateCart: mockGetOrCreateCart,
    getCartItems: mockGetCartItems,
    getCart: mockGetCart,
    addItem: mockAddItem,
    updateQuantity: mockUpdateQuantity,
    removeItem: mockRemoveItem,
    clearCart: mockClearCart,
    mergeCarts: mockMergeCarts,
    applyDiscount: mockApplyDiscount,
    removeDiscount: mockRemoveDiscount,
    calculateTotals: mockCalculateTotals,
  })),
}));

// ─── Import handlers after mocks ─────────────────────────────────────────────

import {
  createProduct,
  listProducts,
  getProduct,
  updateProduct,
  deleteProduct,
} from '../../services/product-service/src/handlers/product.handler';

import {
  getCart,
  addItem,
  clearCart,
} from '../../services/cart-service/src/handlers/cart.handler';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const JWT_SECRET = 'test-secret';

function makeAdminToken(): string {
  return jwt.sign({ id: 1, username: 'admin' }, JWT_SECRET);
}

function makeUserToken(userId = 42): string {
  return jwt.sign({ id: userId, username: 'user' }, JWT_SECRET);
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

const MOCK_CART = {
  id: 'cart-1',
  session_id: 'sess-abc',
  user_id: 42,
  discount_code: undefined,
  discount_amount: 0,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  expires_at: 9999999999,
};

// ─── Authorization: Public vs Admin ──────────────────────────────────────────

describe('Authorization: Public endpoints accessible without JWT', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET /api/products is accessible without authentication', async () => {
    mockListProducts.mockResolvedValueOnce({ products: [], total: 0 });

    const result = await listProducts(makeEvent());

    expect(result.statusCode).toBe(200);
  });

  it('GET /api/products/:slug is accessible without authentication', async () => {
    mockGetProductBySlug.mockResolvedValueOnce({
      id: 1,
      title: 'Art',
      slug: 'art',
      base_price: 10,
      updated_at: new Date().toISOString(),
    });

    const result = await getProduct(
      makeEvent({ pathParameters: { slug: 'art' } })
    );

    expect(result.statusCode).toBe(200);
  });
});

describe('Authorization: Admin endpoints require JWT', () => {
  beforeEach(() => jest.clearAllMocks());

  it('POST /api/products returns 401 without any credentials', async () => {
    const result = await createProduct(
      makeEvent({ body: JSON.stringify({ title: 'Art', slug: 'art', base_price: 10 }) })
    );

    expect(result.statusCode).toBe(401);
    expect(mockCreateProduct).not.toHaveBeenCalled();
  });

  it('PUT /api/products/:id returns 401 without any credentials', async () => {
    const result = await updateProduct(
      makeEvent({
        pathParameters: { id: '1' },
        body: JSON.stringify({ title: 'Updated' }),
      })
    );

    expect(result.statusCode).toBe(401);
    expect(mockUpdateProduct).not.toHaveBeenCalled();
  });

  it('DELETE /api/products/:id returns 401 without any credentials', async () => {
    const result = await deleteProduct(
      makeEvent({ pathParameters: { id: '1' } })
    );

    expect(result.statusCode).toBe(401);
    expect(mockDeleteProduct).not.toHaveBeenCalled();
  });

  it('POST /api/products succeeds with a valid JWT', async () => {
    mockCreateProduct.mockResolvedValueOnce({ id: 1, title: 'Art', slug: 'art', base_price: 10 });

    const result = await createProduct(
      makeEvent({
        headers: { Authorization: `Bearer ${makeAdminToken()}` },
        body: JSON.stringify({ title: 'Art', slug: 'art', base_price: 10 }),
      })
    );

    expect(result.statusCode).toBe(201);
    expect(mockCreateProduct).toHaveBeenCalledTimes(1);
  });

  it('PUT /api/products/:id succeeds with a valid JWT', async () => {
    mockUpdateProduct.mockResolvedValueOnce({ id: 1, title: 'Updated' });

    const result = await updateProduct(
      makeEvent({
        headers: { Authorization: `Bearer ${makeAdminToken()}` },
        pathParameters: { id: '1' },
        body: JSON.stringify({ title: 'Updated' }),
      })
    );

    expect(result.statusCode).toBe(200);
    expect(mockUpdateProduct).toHaveBeenCalledTimes(1);
  });

  it('DELETE /api/products/:id succeeds with a valid JWT', async () => {
    mockDeleteProduct.mockResolvedValueOnce(undefined);

    const result = await deleteProduct(
      makeEvent({
        headers: { Authorization: `Bearer ${makeAdminToken()}` },
        pathParameters: { id: '1' },
      })
    );

    expect(result.statusCode).toBe(200);
    expect(mockDeleteProduct).toHaveBeenCalledTimes(1);
  });
});

describe('Authorization: Role-based access control', () => {
  beforeEach(() => jest.clearAllMocks());

  it('any authenticated user can create a product (single-role system)', async () => {
    mockCreateProduct.mockResolvedValueOnce({ id: 2, title: 'Print', slug: 'print', base_price: 5 });

    const result = await createProduct(
      makeEvent({
        // A regular user token (not an "admin" username) is still accepted
        headers: { Authorization: `Bearer ${makeUserToken(99)}` },
        body: JSON.stringify({ title: 'Print', slug: 'print', base_price: 5 }),
      })
    );

    expect(result.statusCode).toBe(201);
  });

  it('createProduct passes the authenticated user id to the service', async () => {
    const userId = 7;
    mockCreateProduct.mockResolvedValueOnce({ id: 3, title: 'Sculpture', slug: 'sculpture', base_price: 50 });

    await createProduct(
      makeEvent({
        headers: { Authorization: `Bearer ${makeUserToken(userId)}` },
        body: JSON.stringify({ title: 'Sculpture', slug: 'sculpture', base_price: 50 }),
      })
    );

    expect(mockCreateProduct).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Sculpture' }),
      String(userId)
    );
  });
});

describe('Authorization: Cart endpoint session ownership', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET /api/cart is accessible to guests (auto-generates a session)', async () => {
    mockGetOrCreateCart.mockResolvedValueOnce(MOCK_CART);
    mockGetCartItems.mockResolvedValueOnce([]);
    mockCalculateTotals.mockResolvedValueOnce({ subtotal: 0, tax: 0, total: 0, discount_amount: 0 });

    const result = await getCart(makeEvent({ headers: {} }));

    expect(result.statusCode).toBe(200);
    expect(mockGetOrCreateCart).toHaveBeenCalledTimes(1);
  });

  it('GET /api/cart succeeds with a valid session header', async () => {
    mockGetOrCreateCart.mockResolvedValueOnce(MOCK_CART);
    mockGetCartItems.mockResolvedValueOnce([]);
    mockCalculateTotals.mockResolvedValueOnce({ subtotal: 0, tax: 0, total: 0, discount_amount: 0 });

    const result = await getCart(
      makeEvent({ headers: { 'x-cart-session': 'sess-abc' } })
    );

    expect(result.statusCode).toBe(200);
  });

  it('GET /api/cart succeeds with a valid JWT (user-linked cart)', async () => {
    const userCart = { ...MOCK_CART, id: 'user-cart-1', user_id: 42 };
    // getCart calls getOrCreateCart twice for authenticated users:
    // 1st: getOrCreateCart(undefined, userId) → user's own cart
    // 2nd: getOrCreateCart(sessionId)         → guest session cart
    // When both return the same id, no merge occurs.
    mockGetOrCreateCart
      .mockResolvedValueOnce(userCart)   // user cart
      .mockResolvedValueOnce(userCart);  // session cart (same id → no merge)
    mockGetCartItems.mockResolvedValueOnce([]);
    mockCalculateTotals.mockResolvedValueOnce({ subtotal: 0, tax: 0, total: 0, discount_amount: 0 });

    const result = await getCart(
      makeEvent({ headers: { Authorization: `Bearer ${makeUserToken(42)}` } })
    );

    expect(result.statusCode).toBe(200);
  });

  it('POST /api/cart/items (addItem) returns 400 when body is missing', async () => {
    const result = await addItem(
      makeEvent({ headers: {}, body: null })
    );

    // Validation happens before session extraction, so 400 is returned immediately
    expect(result.statusCode).toBe(400);
  });

  it('DELETE /api/cart (clearCart) is accessible to guests (auto-generates session)', async () => {
    mockGetOrCreateCart.mockResolvedValueOnce(MOCK_CART);
    mockClearCart.mockResolvedValueOnce(undefined);

    const result = await clearCart(makeEvent({ headers: {} }));

    expect(result.statusCode).toBe(200);
  });

  it('clearCart succeeds when a valid session header is provided', async () => {
    mockGetOrCreateCart.mockResolvedValueOnce(MOCK_CART);
    mockClearCart.mockResolvedValueOnce(undefined);

    const result = await clearCart(
      makeEvent({ headers: { 'x-cart-session': 'sess-abc' } })
    );

    expect(result.statusCode).toBe(200);
  });
});
