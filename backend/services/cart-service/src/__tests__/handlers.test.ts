/**
 * Unit tests for Cart Service Lambda Handlers
 */

// Set environment variables before any imports
process.env.DYNAMODB_TABLE_NAME = 'test-cart';
process.env.AWS_REGION_CUSTOM = 'us-east-1';
process.env.JWT_SECRET = 'test-secret';

import jwt from 'jsonwebtoken';

// ──────────────────────────────────────────────────────────────────────────────
// Mocks
// ──────────────────────────────────────────────────────────────────────────────

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

jest.mock('../../../../src/services/CartService', () => ({
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

jest.mock('../../../../src/services/dynamodb/DynamoDBOptimized', () => ({
  DynamoDBOptimized: jest.fn().mockImplementation(() => ({})),
}));

// ──────────────────────────────────────────────────────────────────────────────
// Import handlers AFTER mocks are set up
// ──────────────────────────────────────────────────────────────────────────────

import {
  getCart,
  addItem,
  updateQuantity,
  removeItem,
  clearCart,
  applyDiscount,
  removeDiscount,
} from '../handlers/cart.handler';

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function makeAuthToken(): string {
  return jwt.sign({ id: 42, username: 'testuser' }, 'test-secret');
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

const AUTH_HEADERS = { Authorization: `Bearer ${makeAuthToken()}` };
const SESSION_HEADERS = { 'x-cart-session': 'sess-abc' };

const MOCK_CART = {
  id: 'cart-uuid-1',
  session_id: 'sess-abc',
  user_id: undefined as number | undefined,
  discount_code: undefined as string | undefined,
  discount_amount: 0,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  expires_at: 9999999999,
};

const MOCK_ITEMS = [
  {
    id: 'item-1',
    cart_id: 'cart-uuid-1',
    product_id: 10,
    variant_id: undefined,
    quantity: 2,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
];

const MOCK_TOTALS = { subtotal: 20, discount: 0, tax: 2, total: 22 };

// ──────────────────────────────────────────────────────────────────────────────
// getCart
// ──────────────────────────────────────────────────────────────────────────────

describe('getCart', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with cart, items and totals', async () => {
    mockGetOrCreateCart.mockResolvedValue(MOCK_CART);
    mockGetCartItems.mockResolvedValue(MOCK_ITEMS);
    mockCalculateTotals.mockResolvedValue(MOCK_TOTALS);

    const result = await getCart(makeEvent({ headers: SESSION_HEADERS }));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.cart.id).toBe('cart-uuid-1');
    expect(body.cart.items).toHaveLength(1);
    expect(body.subtotal).toBe(20);
    expect(body.tax).toBe(2);
    expect(body.total).toBe(22);
  });

  it('sets the Set-Cookie header with session ID', async () => {
    mockGetOrCreateCart.mockResolvedValue(MOCK_CART);
    mockGetCartItems.mockResolvedValue([]);
    mockCalculateTotals.mockResolvedValue(MOCK_TOTALS);

    const result = await getCart(makeEvent({ headers: SESSION_HEADERS }));

    expect(result.headers?.['Set-Cookie']).toContain('cart_session=');
  });

  it('generates a new session when no session header or cookie is provided', async () => {
    mockGetOrCreateCart.mockResolvedValue({ ...MOCK_CART, session_id: 'new-session' });
    mockGetCartItems.mockResolvedValue([]);
    mockCalculateTotals.mockResolvedValue(MOCK_TOTALS);

    const result = await getCart(makeEvent());

    expect(result.statusCode).toBe(200);
    // A new session ID was generated (starts with "session_")
    const cookie = result.headers?.['Set-Cookie'] || '';
    expect(cookie).toContain('cart_session=');
  });

  it('extracts session from cookie header', async () => {
    mockGetOrCreateCart.mockResolvedValue(MOCK_CART);
    mockGetCartItems.mockResolvedValue([]);
    mockCalculateTotals.mockResolvedValue(MOCK_TOTALS);

    const result = await getCart(
      makeEvent({ headers: { Cookie: 'cart_session=cookie-sess-1; other=val' } })
    );

    expect(result.statusCode).toBe(200);
    expect(mockGetOrCreateCart).toHaveBeenCalledWith('cookie-sess-1');
  });

  it('extracts user ID from JWT when authenticated', async () => {
    const userCart = { ...MOCK_CART, id: 'user-cart', user_id: 42 };
    const sessionCart = { ...MOCK_CART, id: 'session-cart', session_id: 'sess-abc' };
    mockGetOrCreateCart
      .mockResolvedValueOnce(userCart)
      .mockResolvedValueOnce(sessionCart);
    mockGetCartItems.mockResolvedValue([]);
    mockCalculateTotals.mockResolvedValue(MOCK_TOTALS);

    await getCart(
      makeEvent({ headers: { ...SESSION_HEADERS, ...AUTH_HEADERS } })
    );

    expect(mockGetOrCreateCart).toHaveBeenNthCalledWith(1, undefined, 42);
    expect(mockGetOrCreateCart).toHaveBeenNthCalledWith(2, 'sess-abc');
  });

  it('returns 500 on service error', async () => {
    mockGetOrCreateCart.mockRejectedValueOnce(new Error('DynamoDB failure'));

    const result = await getCart(makeEvent({ headers: SESSION_HEADERS }));

    expect(result.statusCode).toBe(500);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// addItem
// ──────────────────────────────────────────────────────────────────────────────

describe('addItem', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with updated cart on success', async () => {
    mockGetOrCreateCart.mockResolvedValue(MOCK_CART);
    mockAddItem.mockResolvedValue(MOCK_ITEMS[0]);
    mockGetCartItems.mockResolvedValue(MOCK_ITEMS);
    mockCalculateTotals.mockResolvedValue(MOCK_TOTALS);

    const result = await addItem(
      makeEvent({
        headers: SESSION_HEADERS,
        body: JSON.stringify({ product_id: 10, quantity: 2 }),
      })
    );

    expect(result.statusCode).toBe(200);
    expect(mockAddItem).toHaveBeenCalledWith('cart-uuid-1', 10, undefined, 2);
  });

  it('uses default quantity of 1 when not provided', async () => {
    mockGetOrCreateCart.mockResolvedValue(MOCK_CART);
    mockAddItem.mockResolvedValue(MOCK_ITEMS[0]);
    mockGetCartItems.mockResolvedValue([]);
    mockCalculateTotals.mockResolvedValue(MOCK_TOTALS);

    await addItem(
      makeEvent({
        headers: SESSION_HEADERS,
        body: JSON.stringify({ product_id: 10 }),
      })
    );

    expect(mockAddItem).toHaveBeenCalledWith('cart-uuid-1', 10, undefined, 1);
  });

  it('passes variant_id when provided', async () => {
    mockGetOrCreateCart.mockResolvedValue(MOCK_CART);
    mockAddItem.mockResolvedValue({});
    mockGetCartItems.mockResolvedValue([]);
    mockCalculateTotals.mockResolvedValue(MOCK_TOTALS);

    await addItem(
      makeEvent({
        headers: SESSION_HEADERS,
        body: JSON.stringify({ product_id: 5, variant_id: 'var-uuid', quantity: 1 }),
      })
    );

    expect(mockAddItem).toHaveBeenCalledWith('cart-uuid-1', 5, 'var-uuid', 1);
  });

  it('returns 400 when body is missing', async () => {
    const result = await addItem(makeEvent({ headers: SESSION_HEADERS }));
    expect(result.statusCode).toBe(400);
  });

  it('returns 400 for invalid JSON body', async () => {
    const result = await addItem(
      makeEvent({ headers: SESSION_HEADERS, body: 'not-json' })
    );
    expect(result.statusCode).toBe(400);
  });

  it('returns 400 when product_id is missing', async () => {
    const result = await addItem(
      makeEvent({
        headers: SESSION_HEADERS,
        body: JSON.stringify({ quantity: 1 }),
      })
    );
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toContain('product_id');
  });

  it('returns 400 when product_id is not a positive integer', async () => {
    const result = await addItem(
      makeEvent({
        headers: SESSION_HEADERS,
        body: JSON.stringify({ product_id: -1, quantity: 1 }),
      })
    );
    expect(result.statusCode).toBe(400);
  });

  it('returns 400 when quantity is zero', async () => {
    const result = await addItem(
      makeEvent({
        headers: SESSION_HEADERS,
        body: JSON.stringify({ product_id: 10, quantity: 0 }),
      })
    );
    expect(result.statusCode).toBe(400);
  });

  it('returns 400 on insufficient stock error from service', async () => {
    mockGetOrCreateCart.mockResolvedValue(MOCK_CART);
    mockAddItem.mockRejectedValueOnce(new Error('Insufficient stock available'));

    const result = await addItem(
      makeEvent({
        headers: SESSION_HEADERS,
        body: JSON.stringify({ product_id: 10, quantity: 999 }),
      })
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toContain('Insufficient');
  });

  it('returns 404 when product not found', async () => {
    mockGetOrCreateCart.mockResolvedValue(MOCK_CART);
    mockAddItem.mockRejectedValueOnce(new Error('Product not found'));

    const result = await addItem(
      makeEvent({
        headers: SESSION_HEADERS,
        body: JSON.stringify({ product_id: 999, quantity: 1 }),
      })
    );

    expect(result.statusCode).toBe(404);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// updateQuantity
// ──────────────────────────────────────────────────────────────────────────────

describe('updateQuantity', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with updated cart', async () => {
    mockGetOrCreateCart.mockResolvedValue(MOCK_CART);
    mockUpdateQuantity.mockResolvedValue({ ...MOCK_ITEMS[0], quantity: 5 });
    mockGetCartItems.mockResolvedValue([{ ...MOCK_ITEMS[0], quantity: 5 }]);
    mockCalculateTotals.mockResolvedValue(MOCK_TOTALS);

    const result = await updateQuantity(
      makeEvent({
        headers: SESSION_HEADERS,
        pathParameters: { id: 'item-1' },
        body: JSON.stringify({ quantity: 5 }),
      })
    );

    expect(result.statusCode).toBe(200);
    expect(mockUpdateQuantity).toHaveBeenCalledWith('cart-uuid-1', 'item-1', 5);
  });

  it('returns 400 when id is missing', async () => {
    const result = await updateQuantity(
      makeEvent({
        headers: SESSION_HEADERS,
        body: JSON.stringify({ quantity: 2 }),
      })
    );
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toContain('id');
  });

  it('returns 400 when body is missing', async () => {
    const result = await updateQuantity(
      makeEvent({ headers: SESSION_HEADERS, pathParameters: { id: 'item-1' } })
    );
    expect(result.statusCode).toBe(400);
  });

  it('returns 400 when quantity is missing', async () => {
    const result = await updateQuantity(
      makeEvent({
        headers: SESSION_HEADERS,
        pathParameters: { id: 'item-1' },
        body: JSON.stringify({}),
      })
    );
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toContain('quantity');
  });

  it('returns 400 when quantity is zero', async () => {
    const result = await updateQuantity(
      makeEvent({
        headers: SESSION_HEADERS,
        pathParameters: { id: 'item-1' },
        body: JSON.stringify({ quantity: 0 }),
      })
    );
    expect(result.statusCode).toBe(400);
  });

  it('returns 400 when quantity is negative', async () => {
    const result = await updateQuantity(
      makeEvent({
        headers: SESSION_HEADERS,
        pathParameters: { id: 'item-1' },
        body: JSON.stringify({ quantity: -3 }),
      })
    );
    expect(result.statusCode).toBe(400);
  });

  it('returns 400 for invalid JSON body', async () => {
    const result = await updateQuantity(
      makeEvent({
        headers: SESSION_HEADERS,
        pathParameters: { id: 'item-1' },
        body: 'bad-json',
      })
    );
    expect(result.statusCode).toBe(400);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// removeItem
// ──────────────────────────────────────────────────────────────────────────────

describe('removeItem', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with updated cart after removal', async () => {
    mockGetOrCreateCart.mockResolvedValue(MOCK_CART);
    mockRemoveItem.mockResolvedValue(undefined);
    mockGetCartItems.mockResolvedValue([]);
    mockCalculateTotals.mockResolvedValue({ subtotal: 0, discount: 0, tax: 0, total: 0 });

    const result = await removeItem(
      makeEvent({
        headers: SESSION_HEADERS,
        pathParameters: { id: 'item-1' },
      })
    );

    expect(result.statusCode).toBe(200);
    expect(mockRemoveItem).toHaveBeenCalledWith('cart-uuid-1', 'item-1');
  });

  it('returns 400 when id is missing', async () => {
    const result = await removeItem(makeEvent({ headers: SESSION_HEADERS }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toContain('id');
  });

  it('returns 500 on service error', async () => {
    mockGetOrCreateCart.mockResolvedValue(MOCK_CART);
    mockRemoveItem.mockRejectedValueOnce(new Error('DynamoDB failure'));

    const result = await removeItem(
      makeEvent({
        headers: SESSION_HEADERS,
        pathParameters: { id: 'item-1' },
      })
    );

    expect(result.statusCode).toBe(500);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// clearCart
// ──────────────────────────────────────────────────────────────────────────────

describe('clearCart', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with cleared cart message', async () => {
    mockGetOrCreateCart.mockResolvedValue(MOCK_CART);
    mockClearCart.mockResolvedValue(undefined);

    const result = await clearCart(makeEvent({ headers: SESSION_HEADERS }));

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).message).toBe('Cart cleared');
    expect(mockClearCart).toHaveBeenCalledWith('cart-uuid-1');
  });

  it('sets the Set-Cookie header', async () => {
    mockGetOrCreateCart.mockResolvedValue(MOCK_CART);
    mockClearCart.mockResolvedValue(undefined);

    const result = await clearCart(makeEvent({ headers: SESSION_HEADERS }));

    expect(result.headers?.['Set-Cookie']).toContain('cart_session=');
  });

  it('returns 500 on service error', async () => {
    mockGetOrCreateCart.mockRejectedValueOnce(new Error('DynamoDB failure'));

    const result = await clearCart(makeEvent({ headers: SESSION_HEADERS }));

    expect(result.statusCode).toBe(500);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// applyDiscount
// ──────────────────────────────────────────────────────────────────────────────

describe('applyDiscount', () => {
  beforeEach(() => jest.clearAllMocks());

  const DISCOUNTED_CART = {
    ...MOCK_CART,
    discount_code: 'SAVE10',
    discount_amount: 10,
  };

  it('returns 200 with discount applied', async () => {
    mockGetOrCreateCart.mockResolvedValue(MOCK_CART);
    mockApplyDiscount.mockResolvedValue(DISCOUNTED_CART);
    mockGetCartItems.mockResolvedValue(MOCK_ITEMS);
    mockCalculateTotals.mockResolvedValue({ subtotal: 20, discount: 10, tax: 1, total: 11 });

    const result = await applyDiscount(
      makeEvent({
        headers: SESSION_HEADERS,
        body: JSON.stringify({ code: 'SAVE10' }),
      })
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.cart.discount_code).toBe('SAVE10');
    expect(body.discount).toBe(10);
    expect(mockApplyDiscount).toHaveBeenCalledWith('cart-uuid-1', 'SAVE10');
  });

  it('returns 400 when body is missing', async () => {
    const result = await applyDiscount(makeEvent({ headers: SESSION_HEADERS }));
    expect(result.statusCode).toBe(400);
  });

  it('returns 400 when code is missing', async () => {
    const result = await applyDiscount(
      makeEvent({
        headers: SESSION_HEADERS,
        body: JSON.stringify({}),
      })
    );
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toContain('code');
  });

  it('returns 400 when code is empty string', async () => {
    const result = await applyDiscount(
      makeEvent({
        headers: SESSION_HEADERS,
        body: JSON.stringify({ code: '   ' }),
      })
    );
    expect(result.statusCode).toBe(400);
  });

  it('returns 400 when discount code is invalid', async () => {
    mockGetOrCreateCart.mockResolvedValue(MOCK_CART);
    mockApplyDiscount.mockRejectedValueOnce(new Error('Invalid discount code'));

    const result = await applyDiscount(
      makeEvent({
        headers: SESSION_HEADERS,
        body: JSON.stringify({ code: 'BAD' }),
      })
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toContain('Invalid discount code');
  });

  it('returns 400 when discount code is expired', async () => {
    mockGetOrCreateCart.mockResolvedValue(MOCK_CART);
    mockApplyDiscount.mockRejectedValueOnce(
      new Error('Discount code is expired or no longer active')
    );

    const result = await applyDiscount(
      makeEvent({
        headers: SESSION_HEADERS,
        body: JSON.stringify({ code: 'EXPIRED' }),
      })
    );

    expect(result.statusCode).toBe(400);
  });

  it('returns 400 for invalid JSON body', async () => {
    const result = await applyDiscount(
      makeEvent({ headers: SESSION_HEADERS, body: 'not-json' })
    );
    expect(result.statusCode).toBe(400);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// removeDiscount
// ──────────────────────────────────────────────────────────────────────────────

describe('removeDiscount', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with discount removed', async () => {
    const cartWithDiscount = { ...MOCK_CART, discount_code: 'SAVE10', discount_amount: 10 };
    const cartWithoutDiscount = { ...MOCK_CART, discount_code: undefined, discount_amount: 0 };
    mockGetOrCreateCart.mockResolvedValue(cartWithDiscount);
    mockRemoveDiscount.mockResolvedValue(cartWithoutDiscount);
    mockGetCartItems.mockResolvedValue(MOCK_ITEMS);
    mockCalculateTotals.mockResolvedValue(MOCK_TOTALS);

    const result = await removeDiscount(makeEvent({ headers: SESSION_HEADERS }));

    expect(result.statusCode).toBe(200);
    expect(mockRemoveDiscount).toHaveBeenCalledWith('cart-uuid-1');
    const body = JSON.parse(result.body);
    expect(body.cart.discount_code).toBeUndefined();
  });

  it('returns 404 when cart is not found', async () => {
    mockGetOrCreateCart.mockResolvedValue(MOCK_CART);
    mockRemoveDiscount.mockRejectedValueOnce(new Error('Cart not found'));

    const result = await removeDiscount(makeEvent({ headers: SESSION_HEADERS }));

    expect(result.statusCode).toBe(404);
  });

  it('returns 500 on unexpected service error', async () => {
    mockGetOrCreateCart.mockRejectedValueOnce(new Error('DynamoDB failure'));

    const result = await removeDiscount(makeEvent({ headers: SESSION_HEADERS }));

    expect(result.statusCode).toBe(500);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Session Management
// ──────────────────────────────────────────────────────────────────────────────

describe('Session Management', () => {
  beforeEach(() => jest.clearAllMocks());

  it('prefers x-cart-session header over cookie', async () => {
    mockGetOrCreateCart.mockResolvedValue(MOCK_CART);
    mockGetCartItems.mockResolvedValue([]);
    mockCalculateTotals.mockResolvedValue(MOCK_TOTALS);

    await getCart(
      makeEvent({
        headers: {
          'x-cart-session': 'header-session',
          Cookie: 'cart_session=cookie-session',
        },
      })
    );

    expect(mockGetOrCreateCart).toHaveBeenCalledWith('header-session');
  });

  it('falls back to x-session-id legacy header', async () => {
    mockGetOrCreateCart.mockResolvedValue(MOCK_CART);
    mockGetCartItems.mockResolvedValue([]);
    mockCalculateTotals.mockResolvedValue(MOCK_TOTALS);

    await getCart(makeEvent({ headers: { 'x-session-id': 'legacy-session' } }));

    expect(mockGetOrCreateCart).toHaveBeenCalledWith('legacy-session');
  });

  it('prefers cookie over x-session-id legacy header', async () => {
    mockGetOrCreateCart.mockResolvedValue(MOCK_CART);
    mockGetCartItems.mockResolvedValue([]);
    mockCalculateTotals.mockResolvedValue(MOCK_TOTALS);

    await getCart(
      makeEvent({
        headers: {
          Cookie: 'cart_session=cookie-session',
          'x-session-id': 'legacy-session',
        },
      })
    );

    expect(mockGetOrCreateCart).toHaveBeenCalledWith('cookie-session');
  });

  it('merges session cart with user cart on login', async () => {
    const sessionCart = { ...MOCK_CART, id: 'session-cart', session_id: 'sess-abc' };
    const userCart = { ...MOCK_CART, id: 'user-cart', user_id: 42, session_id: 'sess-abc' };

    // First call returns the user cart lookup, second returns the session cart lookup
    mockGetOrCreateCart
      .mockResolvedValueOnce(userCart)
      .mockResolvedValueOnce(sessionCart);
    mockMergeCarts.mockResolvedValue(undefined);
    mockGetCartItems.mockResolvedValue([]);
    mockCalculateTotals.mockResolvedValue(MOCK_TOTALS);

    const result = await getCart(
      makeEvent({ headers: { ...SESSION_HEADERS, ...AUTH_HEADERS } })
    );

    expect(result.statusCode).toBe(200);
    expect(mockMergeCarts).toHaveBeenCalledWith('session-cart', 'user-cart');
    expect(mockGetOrCreateCart).toHaveBeenNthCalledWith(1, undefined, 42);
    expect(mockGetOrCreateCart).toHaveBeenNthCalledWith(2, 'sess-abc');
  });
});
