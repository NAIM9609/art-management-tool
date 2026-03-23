/**
 * Full System Test – Art Management Tool
 *
 * Exercises every service at the Lambda handler level, validates user flows,
 * enforces security requirements, and checks that each handler responds within
 * its target latency budget.
 *
 * Services covered:
 *   - Product service  (CRUD, search, pagination)
 *   - Order service    (create, query, update)
 *   - Cart service     (add, update, remove, discount)
 *   - Content service  (personaggi, fumetti)
 *   - Discount service (validate, usage)
 *   - Notification service (create, read)
 *   - Audit service    (log, query)
 *   - Integration service (Etsy sync)
 *
 * All external dependencies (DynamoDB, S3, Etsy API) are mocked so that the
 * suite runs fully offline without any cloud infrastructure.
 *
 * Run:
 *   cd backend && npm test -- tests/system/full-system-test.ts
 */

// ── Environment (must precede all imports) ────────────────────────────────────
process.env.DYNAMODB_TABLE_NAME = 'art-system-test';
process.env.AWS_REGION = 'us-east-1';
process.env.JWT_SECRET = 'system-test-secret';
process.env.S3_BUCKET_NAME = 'art-system-test-bucket';
process.env.ETSY_CLIENT_ID = 'test-client-id';
process.env.ETSY_CLIENT_SECRET = 'test-client-secret';
process.env.ETSY_REDIRECT_URI = 'https://example.com/api/integrations/etsy/callback';
process.env.ETSY_WEBHOOK_SECRET = 'test-webhook-secret';
process.env.NODE_ENV = 'test';

import jwt from 'jsonwebtoken';

// ── Constants ─────────────────────────────────────────────────────────────────

const JWT_SECRET = 'system-test-secret';
/** Target response time for every handler call (ms). */
const MAX_LATENCY_MS = 500;

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAdminToken(): string {
  return jwt.sign({ id: 1, username: 'artadmin' }, JWT_SECRET, { expiresIn: '1h' });
}

function makeUserToken(userId = 42, username = 'customer'): string {
  return jwt.sign({ id: userId, username }, JWT_SECRET, { expiresIn: '1h' });
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
const USER_HEADERS  = { Authorization: `Bearer ${makeUserToken()}` };

// ── Product Service Mocks ─────────────────────────────────────────────────────

const mockCreateProduct   = jest.fn();
const mockListProducts    = jest.fn();
const mockGetProductBySlug = jest.fn();
const mockGetProductById  = jest.fn();
const mockUpdateProduct   = jest.fn();
const mockDeleteProduct   = jest.fn();
const mockAddVariant      = jest.fn();
const mockUpdateVariant   = jest.fn();
const mockListImages      = jest.fn();
const mockDeleteImage     = jest.fn();

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
  ProductStatus: { PUBLISHED: 'published', DRAFT: 'draft', ARCHIVED: 'archived' },
}));

// ── Order Service Mocks ───────────────────────────────────────────────────────

const mockCreateOrder       = jest.fn();
const mockGetOrder          = jest.fn();
const mockListOrders        = jest.fn();
const mockGetCustomerOrders = jest.fn();
const mockUpdateOrderStatus = jest.fn();
const mockProcessPayment    = jest.fn();

jest.mock('../../src/services/OrderService', () => ({
  OrderService: jest.fn().mockImplementation(() => ({
    createOrder: mockCreateOrder,
    getOrderByNumber: mockGetOrder,
    listOrders: mockListOrders,
    getOrdersByCustomer: mockGetCustomerOrders,
    updateOrderStatus: mockUpdateOrderStatus,
    processPayment: mockProcessPayment,
    calculateTotals: jest.fn().mockReturnValue({
      subtotal: 49.99,
      tax: 0,
      discount: 0,
      total: 49.99,
    }),
  })),
  OrderStatus: {
    PENDING: 'pending',
    PROCESSING: 'processing',
    SHIPPED: 'shipped',
    DELIVERED: 'delivered',
    CANCELLED: 'cancelled',
  },
}));

// ── Cart Service Mocks ────────────────────────────────────────────────────────

const mockGetOrCreateCart  = jest.fn();
const mockGetCartItems     = jest.fn();
const mockGetCart          = jest.fn();
const mockAddItem          = jest.fn();
const mockUpdateQuantity   = jest.fn();
const mockRemoveItem       = jest.fn();
const mockClearCart        = jest.fn();
const mockApplyDiscount    = jest.fn();
const mockRemoveDiscount   = jest.fn();
const mockCalculateTotals  = jest.fn();

jest.mock('../../src/services/CartService', () => ({
  CartService: jest.fn().mockImplementation(() => ({
    getOrCreateCart: mockGetOrCreateCart,
    getCartItems: mockGetCartItems,
    getCart: mockGetCart,
    addItem: mockAddItem,
    updateQuantity: mockUpdateQuantity,
    removeItem: mockRemoveItem,
    clearCart: mockClearCart,
    applyDiscount: mockApplyDiscount,
    removeDiscount: mockRemoveDiscount,
    calculateTotals: mockCalculateTotals,
  })),
}));

// ── Content Service Mocks ─────────────────────────────────────────────────────

const mockPersonaggioFindAll    = jest.fn();
const mockPersonaggioFindById   = jest.fn();
const mockPersonaggioCreate     = jest.fn();
const mockPersonaggioUpdate     = jest.fn();
const mockPersonaggioSoftDelete = jest.fn();

jest.mock('../../src/services/dynamodb/repositories/PersonaggioRepository', () => ({
  PersonaggioRepository: jest.fn().mockImplementation(() => ({
    findAll: mockPersonaggioFindAll,
    findById: mockPersonaggioFindById,
    create: mockPersonaggioCreate,
    update: mockPersonaggioUpdate,
    softDelete: mockPersonaggioSoftDelete,
  })),
}));

const mockFumettoFindAll    = jest.fn();
const mockFumettoFindById   = jest.fn();
const mockFumettoCreate     = jest.fn();
const mockFumettoUpdate     = jest.fn();
const mockFumettoSoftDelete = jest.fn();

jest.mock('../../src/services/dynamodb/repositories/FumettoRepository', () => ({
  FumettoRepository: jest.fn().mockImplementation(() => ({
    findAll: mockFumettoFindAll,
    findById: mockFumettoFindById,
    create: mockFumettoCreate,
    update: mockFumettoUpdate,
    softDelete: mockFumettoSoftDelete,
  })),
}));

const mockGeneratePresignedUrl = jest.fn();

jest.mock('../../src/services/s3/S3Service', () => ({
  S3Service: jest.fn().mockImplementation(() => ({
    generatePresignedUploadUrl: mockGeneratePresignedUrl,
  })),
}));

// ── Discount Service Mocks ────────────────────────────────────────────────────

const mockDiscountFindByCode = jest.fn();
const mockDiscountFindById   = jest.fn();
const mockDiscountFindAll    = jest.fn();
const mockDiscountCreate     = jest.fn();
const mockDiscountUpdate     = jest.fn();
const mockDiscountSoftDelete = jest.fn();
const mockDiscountGetStats   = jest.fn();

jest.mock('../../src/services/dynamodb/repositories/DiscountCodeRepository', () => ({
  DiscountCodeRepository: jest.fn().mockImplementation(() => ({
    findByCode: mockDiscountFindByCode,
    findById: mockDiscountFindById,
    findAll: mockDiscountFindAll,
    create: mockDiscountCreate,
    update: mockDiscountUpdate,
    softDelete: mockDiscountSoftDelete,
    getStats: mockDiscountGetStats,
  })),
}));

// ── Notification Service Mocks ────────────────────────────────────────────────

const mockGetNotifications       = jest.fn();
const mockGetNotificationById    = jest.fn();
const mockMarkAsRead             = jest.fn();
const mockMarkAllAsRead          = jest.fn();
const mockDeleteNotification     = jest.fn();

jest.mock('../../src/services/NotificationService', () => ({
  NotificationService: jest.fn().mockImplementation(() => ({
    getNotifications: mockGetNotifications,
    getNotificationById: mockGetNotificationById,
    markAsRead: mockMarkAsRead,
    markAllAsRead: mockMarkAllAsRead,
    deleteNotification: mockDeleteNotification,
  })),
}));

// ── Audit Service Mocks ───────────────────────────────────────────────────────

const mockGetEntityHistory        = jest.fn();
const mockGetUserActivity         = jest.fn();
const mockGetActivityByDateRange  = jest.fn();

jest.mock('../../src/services/AuditService', () => ({
  AuditService: jest.fn().mockImplementation(() => ({
    getEntityHistory: mockGetEntityHistory,
    getUserActivity: mockGetUserActivity,
    getActivityByDateRange: mockGetActivityByDateRange,
  })),
}));

// ── Integration Service Mocks ─────────────────────────────────────────────────

const mockSaveToken      = jest.fn().mockResolvedValue(undefined);
const mockGetToken       = jest.fn().mockResolvedValue(null);
const mockSaveOAuthState = jest.fn().mockResolvedValue(undefined);
const mockGetOAuthState  = jest.fn().mockResolvedValue({
  state: 'random-state',
  expiresAt: Date.now() + 60_000,
});
const mockDeleteOAuthState = jest.fn().mockResolvedValue(undefined);

jest.mock('../../services/integration-service/src/tokenStore', () => ({
  saveToken: (...args: unknown[]) => mockSaveToken(...args),
  getToken: (...args: unknown[]) => mockGetToken(...args),
  saveOAuthState: (...args: unknown[]) => mockSaveOAuthState(...args),
  getOAuthState: (...args: unknown[]) => mockGetOAuthState(...args),
  deleteOAuthState: (...args: unknown[]) => mockDeleteOAuthState(...args),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch as typeof fetch;

// ── Shared DynamoDB mock ──────────────────────────────────────────────────────

jest.mock('../../src/services/dynamodb/DynamoDBOptimized', () => ({
  DynamoDBOptimized: jest.fn().mockImplementation(() => ({})),
}));

// ── Handler imports (after all mocks) ────────────────────────────────────────

import {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
} from '../../services/product-service/src/handlers/product.handler';

import {
  createOrder,
  getOrder,
  listOrders,
  getCustomerOrders,
  updateOrderStatus,
} from '../../services/order-service/src/handlers/order.handler';

import {
  getCart,
  addItem,
  updateQuantity,
  removeItem,
  clearCart,
  applyDiscount,
  removeDiscount,
} from '../../services/cart-service/src/handlers/cart.handler';

import {
  listPersonaggi,
  getPersonaggio,
  createPersonaggio,
  updatePersonaggio,
  deletePersonaggio,
} from '../../services/content-service/src/handlers/personaggi.handler';

import {
  listFumetti,
  getFumetto,
  createFumetto,
} from '../../services/content-service/src/handlers/fumetti.handler';

import {
  validateCode,
  listDiscounts,
  createDiscount,
  updateDiscount,
  deleteDiscount,
  getStats,
} from '../../services/discount-service/src/handlers/discount.handler';

import {
  listNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} from '../../services/notification-service/src/handlers/notification.handler';

import {
  getEntityHistory,
  getUserActivity,
  getActivityByDate,
} from '../../services/audit-service/src/handlers/audit.handler';

import {
  initiateOAuth,
  syncProducts,
  syncInventory,
  syncOrders,
} from '../../services/integration-service/src/handlers/etsy.handler';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MOCK_PRODUCT = {
  id: 1,
  slug: 'sample-artwork-1',
  title: 'Sample Artwork',
  short_description: 'A beautiful piece',
  base_price: 49.99,
  currency: 'EUR',
  status: 'published',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

const MOCK_ORDER = {
  id: 'order-uuid-1',
  order_number: 'ORD-001',
  customer_email: 'customer@example.com',
  status: 'pending',
  total_amount: 49.99,
  currency: 'EUR',
  created_at: '2024-01-01T00:00:00.000Z',
};

const MOCK_CART = {
  id: 'cart-uuid-1',
  session_id: 'session-123',
  user_id: null,
  items: [],
  subtotal: 0,
  total: 0,
  currency: 'EUR',
};

const MOCK_CART_ITEM = {
  id: 'item-uuid-1',
  cart_id: 'cart-uuid-1',
  product_id: 1,
  product_slug: 'sample-artwork-1',
  product_title: 'Sample Artwork',
  quantity: 1,
  unit_price: 49.99,
};

const MOCK_PERSONAGGIO = {
  id: 1,
  name: 'Personaggio Test',
  description: 'Test character',
  status: 'published',
  created_at: '2024-01-01T00:00:00.000Z',
};

const MOCK_FUMETTO = {
  id: 1,
  title: 'Fumetto Test',
  description: 'Test comic',
  status: 'published',
  created_at: '2024-01-01T00:00:00.000Z',
};

const MOCK_DISCOUNT = {
  id: 1,
  code: 'SAVE10',
  discount_type: 'percentage',
  discount_value: 10,
  is_active: true,
  valid_from: '2024-01-01T00:00:00.000Z',
  valid_until: null,
  max_uses: 100,
  times_used: 0,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

const MOCK_NOTIFICATION = {
  id: 'notif-uuid-1',
  type: 'order_created',
  title: 'New Order',
  message: 'Order ORD-001 received',
  is_read: false,
  created_at: '2024-01-01T00:00:00.000Z',
};

const MOCK_AUDIT_LOG = {
  id: 'audit-uuid-1',
  entity_type: 'product',
  entity_id: '1',
  action: 'update',
  user_id: '1',
  changes: { title: { from: 'Old', to: 'New' } },
  created_at: '2024-01-01T00:00:00.000Z',
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. PRODUCT SERVICE
// ─────────────────────────────────────────────────────────────────────────────

describe('1. Product Service', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('1.1 List products (public, paginated)', () => {
    it('returns 200 with product list', async () => {
      mockListProducts.mockResolvedValueOnce({ products: [MOCK_PRODUCT], total: 1 });
      const start = Date.now();
      const res = await listProducts(makeEvent());
      const elapsed = Date.now() - start;

      expect(res.statusCode).toBe(200);
      expect(elapsed).toBeLessThan(MAX_LATENCY_MS);
    });

    it('supports pagination via page and per_page query params', async () => {
      mockListProducts.mockResolvedValueOnce({ products: [], total: 0 });
      const res = await listProducts(
        makeEvent({ queryStringParameters: { page: '2', per_page: '10' } })
      );
      expect(res.statusCode).toBe(200);
    });

    it('supports status filter', async () => {
      mockListProducts.mockResolvedValueOnce({ products: [MOCK_PRODUCT], total: 1 });
      const res = await listProducts(
        makeEvent({ queryStringParameters: { status: 'published' } })
      );
      expect(res.statusCode).toBe(200);
    });
  });

  describe('1.2 Get single product by slug (public)', () => {
    it('returns 200 for existing product', async () => {
      mockGetProductBySlug.mockResolvedValueOnce(MOCK_PRODUCT);
      const res = await getProduct(
        makeEvent({ pathParameters: { slug: 'sample-artwork-1' } })
      );
      expect(res.statusCode).toBe(200);
    });

    it('returns 404 for non-existent product', async () => {
      mockGetProductBySlug.mockResolvedValueOnce(null);
      const res = await getProduct(
        makeEvent({ pathParameters: { slug: 'does-not-exist' } })
      );
      expect(res.statusCode).toBe(404);
    });
  });

  describe('1.3 Create product (admin)', () => {
    it('returns 201 when admin creates a product', async () => {
      mockCreateProduct.mockResolvedValueOnce(MOCK_PRODUCT);
      const res = await createProduct(
        makeEvent({
          headers: ADMIN_HEADERS,
          body: JSON.stringify({ title: 'New Art', slug: 'new-art', base_price: 30 }),
        })
      );
      expect(res.statusCode).toBe(201);
    });

    it('returns 401 when unauthenticated', async () => {
      const res = await createProduct(
        makeEvent({ body: JSON.stringify({ title: 'New Art', slug: 'new-art', base_price: 30 }) })
      );
      expect(res.statusCode).toBe(401);
    });
  });

  describe('1.4 Update product (admin)', () => {
    it('returns 200 when admin updates a product', async () => {
      mockUpdateProduct.mockResolvedValueOnce({ ...MOCK_PRODUCT, title: 'Updated Art' });
      const res = await updateProduct(
        makeEvent({
          headers: ADMIN_HEADERS,
          pathParameters: { id: '1' },
          body: JSON.stringify({ title: 'Updated Art' }),
        })
      );
      expect(res.statusCode).toBe(200);
    });

    it('returns 401 when unauthenticated', async () => {
      const res = await updateProduct(
        makeEvent({ pathParameters: { id: '1' }, body: JSON.stringify({ title: 'Hack' }) })
      );
      expect(res.statusCode).toBe(401);
    });
  });

  describe('1.5 Delete product (admin)', () => {
    it('returns 200 when admin deletes a product', async () => {
      mockDeleteProduct.mockResolvedValueOnce(undefined);
      const res = await deleteProduct(
        makeEvent({ headers: ADMIN_HEADERS, pathParameters: { id: '1' } })
      );
      expect(res.statusCode).toBe(200);
    });

    it('returns 401 when unauthenticated', async () => {
      const res = await deleteProduct(makeEvent({ pathParameters: { id: '1' } }));
      expect(res.statusCode).toBe(401);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. ORDER SERVICE
// ─────────────────────────────────────────────────────────────────────────────

describe('2. Order Service', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('2.1 Create order', () => {
    it('returns 201 for a valid order submission', async () => {
      mockCreateOrder.mockResolvedValueOnce(MOCK_ORDER);
      const res = await createOrder(
        makeEvent({
          body: JSON.stringify({
            customer_email: 'customer@example.com',
            customer_name: 'Test Customer',
            items: [{ product_id: 1, quantity: 1, unit_price: 49.99 }],
          }),
        })
      );
      expect(res.statusCode).toBe(201);
    });

    it('returns 400 for missing required fields', async () => {
      const res = await createOrder(makeEvent({ body: JSON.stringify({}) }));
      expect(res.statusCode).toBe(400);
    });
  });

  describe('2.2 Query order by number', () => {
    it('returns 200 for existing order', async () => {
      mockGetOrder.mockResolvedValueOnce(MOCK_ORDER);
      const res = await getOrder(
        makeEvent({ pathParameters: { orderNumber: 'ORD-001' } })
      );
      expect(res.statusCode).toBe(200);
    });

    it('returns 404 for non-existent order', async () => {
      mockGetOrder.mockResolvedValueOnce(null);
      const res = await getOrder(
        makeEvent({ pathParameters: { orderNumber: 'ORD-999' } })
      );
      expect(res.statusCode).toBe(404);
    });
  });

  describe('2.3 Get customer orders', () => {
    it('returns 200 with orders list for a customer email', async () => {
      mockGetCustomerOrders.mockResolvedValueOnce({ orders: [MOCK_ORDER], lastKey: null });
      const res = await getCustomerOrders(
        makeEvent({
          headers: USER_HEADERS,
          queryStringParameters: { email: 'customer@example.com' },
        })
      );
      expect(res.statusCode).toBe(200);
    });
  });

  describe('2.4 Admin – list all orders', () => {
    it('returns 200 for any caller (auth delegated to API Gateway)', async () => {
      mockListOrders.mockResolvedValueOnce({ orders: [MOCK_ORDER], total: 1 });
      const res = await listOrders(makeEvent({ headers: ADMIN_HEADERS }));
      expect(res.statusCode).toBe(200);
    });

    it('returns 200 without auth (no Lambda-level auth in order service)', async () => {
      mockListOrders.mockResolvedValueOnce({ orders: [], total: 0 });
      const res = await listOrders(makeEvent());
      expect(res.statusCode).toBe(200);
    });
  });

  describe('2.5 Admin – update order status', () => {
    it('returns 200 when status is updated', async () => {
      mockUpdateOrderStatus.mockResolvedValueOnce({ ...MOCK_ORDER, status: 'processing' });
      const res = await updateOrderStatus(
        makeEvent({
          headers: ADMIN_HEADERS,
          pathParameters: { id: 'order-uuid-1' },
          body: JSON.stringify({ status: 'processing' }),
        })
      );
      expect(res.statusCode).toBe(200);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. CART SERVICE
// ─────────────────────────────────────────────────────────────────────────────

describe('3. Cart Service', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('3.1 Get cart', () => {
    it('returns 200 with empty cart for new session', async () => {
      mockGetOrCreateCart.mockResolvedValueOnce(MOCK_CART);
      mockGetCartItems.mockResolvedValueOnce([]);
      mockCalculateTotals.mockReturnValueOnce({ subtotal: 0, total: 0, currency: 'EUR' });
      const res = await getCart(
        makeEvent({ headers: { 'x-cart-session': 'session-123' } })
      );
      expect(res.statusCode).toBe(200);
    });
  });

  describe('3.2 Add item to cart', () => {
    it('returns 200 after adding an item', async () => {
      mockGetOrCreateCart.mockResolvedValueOnce(MOCK_CART);
      mockAddItem.mockResolvedValueOnce(MOCK_CART_ITEM);
      mockGetCartItems.mockResolvedValueOnce([MOCK_CART_ITEM]);
      mockCalculateTotals.mockReturnValueOnce({ subtotal: 49.99, total: 49.99, currency: 'EUR' });
      const start = Date.now();
      const res = await addItem(
        makeEvent({
          headers: { 'x-cart-session': 'session-123' },
          body: JSON.stringify({ product_id: 1, quantity: 1, unit_price: 49.99 }),
        })
      );
      const elapsed = Date.now() - start;

      expect(res.statusCode).toBe(200);
      expect(elapsed).toBeLessThan(MAX_LATENCY_MS);
    });

    it('returns 400 when body is missing', async () => {
      const res = await addItem(
        makeEvent({ headers: { 'x-cart-session': 'session-123' }, body: null })
      );
      expect(res.statusCode).toBe(400);
    });
  });

  describe('3.3 Update item quantity', () => {
    it('returns 200 after updating quantity', async () => {
      mockGetOrCreateCart.mockResolvedValueOnce(MOCK_CART);
      mockUpdateQuantity.mockResolvedValueOnce({ ...MOCK_CART_ITEM, quantity: 3 });
      mockGetCartItems.mockResolvedValueOnce([{ ...MOCK_CART_ITEM, quantity: 3 }]);
      mockCalculateTotals.mockReturnValueOnce({ subtotal: 149.97, total: 149.97, currency: 'EUR' });
      const res = await updateQuantity(
        makeEvent({
          headers: { 'x-cart-session': 'session-123' },
          pathParameters: { id: 'item-uuid-1' },
          body: JSON.stringify({ quantity: 3 }),
        })
      );
      expect(res.statusCode).toBe(200);
    });
  });

  describe('3.4 Remove item from cart', () => {
    it('returns 200 after removing an item', async () => {
      mockGetOrCreateCart.mockResolvedValueOnce(MOCK_CART);
      mockRemoveItem.mockResolvedValueOnce(undefined);
      mockGetCartItems.mockResolvedValueOnce([]);
      mockCalculateTotals.mockReturnValueOnce({ subtotal: 0, total: 0, currency: 'EUR' });
      const res = await removeItem(
        makeEvent({
          headers: { 'x-cart-session': 'session-123' },
          pathParameters: { id: 'item-uuid-1' },
        })
      );
      expect(res.statusCode).toBe(200);
    });
  });

  describe('3.5 Apply discount code', () => {
    it('returns 200 when a valid discount is applied', async () => {
      mockGetOrCreateCart.mockResolvedValueOnce(MOCK_CART);
      mockApplyDiscount.mockResolvedValueOnce({
        ...MOCK_CART,
        discount_code: 'SAVE10',
        discount_amount: 5.0,
      });
      mockGetCartItems.mockResolvedValueOnce([MOCK_CART_ITEM]);
      mockCalculateTotals.mockReturnValueOnce({
        subtotal: 49.99,
        discount: 5.0,
        total: 44.99,
        currency: 'EUR',
      });
      const res = await applyDiscount(
        makeEvent({
          headers: { 'x-cart-session': 'session-123' },
          body: JSON.stringify({ code: 'SAVE10' }),
        })
      );
      expect(res.statusCode).toBe(200);
    });
  });

  describe('3.6 Remove discount', () => {
    it('returns 200 after removing a discount', async () => {
      mockGetOrCreateCart.mockResolvedValueOnce(MOCK_CART);
      mockRemoveDiscount.mockResolvedValueOnce(MOCK_CART);
      mockGetCartItems.mockResolvedValueOnce([MOCK_CART_ITEM]);
      mockCalculateTotals.mockReturnValueOnce({ subtotal: 49.99, total: 49.99, currency: 'EUR' });
      const res = await removeDiscount(
        makeEvent({ headers: { 'x-cart-session': 'session-123' } })
      );
      expect(res.statusCode).toBe(200);
    });
  });

  describe('3.7 Clear cart', () => {
    it('returns 200 after clearing the cart', async () => {
      mockGetOrCreateCart.mockResolvedValueOnce(MOCK_CART);
      mockClearCart.mockResolvedValueOnce(undefined);
      const res = await clearCart(
        makeEvent({ headers: { 'x-cart-session': 'session-123' } })
      );
      expect(res.statusCode).toBe(200);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. CONTENT SERVICE
// ─────────────────────────────────────────────────────────────────────────────

describe('4. Content Service', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('4.1 Personaggi', () => {
    it('listPersonaggi returns 200 (public)', async () => {
      mockPersonaggioFindAll.mockResolvedValueOnce([MOCK_PERSONAGGIO]);
      const start = Date.now();
      const res = await listPersonaggi(makeEvent());
      expect(res.statusCode).toBe(200);
      expect(Date.now() - start).toBeLessThan(MAX_LATENCY_MS);
    });

    it('getPersonaggio returns 200 for existing item', async () => {
      mockPersonaggioFindById.mockResolvedValueOnce(MOCK_PERSONAGGIO);
      const res = await getPersonaggio(
        makeEvent({ pathParameters: { id: '1' } })
      );
      expect(res.statusCode).toBe(200);
    });

    it('getPersonaggio returns 404 for missing item', async () => {
      mockPersonaggioFindById.mockResolvedValueOnce(null);
      const res = await getPersonaggio(
        makeEvent({ pathParameters: { id: '999' } })
      );
      expect(res.statusCode).toBe(404);
    });

    it('createPersonaggio returns 201 for admin', async () => {
      mockPersonaggioCreate.mockResolvedValueOnce(MOCK_PERSONAGGIO);
      const res = await createPersonaggio(
        makeEvent({
          headers: ADMIN_HEADERS,
          body: JSON.stringify({ name: 'New Character', description: 'Desc' }),
        })
      );
      expect(res.statusCode).toBe(201);
    });

    it('createPersonaggio returns 401 without auth', async () => {
      const res = await createPersonaggio(
        makeEvent({ body: JSON.stringify({ name: 'Hack', description: 'Desc' }) })
      );
      expect(res.statusCode).toBe(401);
    });

    it('updatePersonaggio returns 200 for admin', async () => {
      mockPersonaggioUpdate.mockResolvedValueOnce({ ...MOCK_PERSONAGGIO, name: 'Updated' });
      const res = await updatePersonaggio(
        makeEvent({
          headers: ADMIN_HEADERS,
          pathParameters: { id: '1' },
          body: JSON.stringify({ name: 'Updated' }),
        })
      );
      expect(res.statusCode).toBe(200);
    });

    it('deletePersonaggio returns 200 for admin', async () => {
      mockPersonaggioSoftDelete.mockResolvedValueOnce(MOCK_PERSONAGGIO);
      const res = await deletePersonaggio(
        makeEvent({ headers: ADMIN_HEADERS, pathParameters: { id: '1' } })
      );
      expect(res.statusCode).toBe(200);
    });
  });

  describe('4.2 Fumetti', () => {
    it('listFumetti returns 200 (public)', async () => {
      mockFumettoFindAll.mockResolvedValueOnce([MOCK_FUMETTO]);
      const res = await listFumetti(makeEvent());
      expect(res.statusCode).toBe(200);
    });

    it('getFumetto returns 200 for existing item', async () => {
      mockFumettoFindById.mockResolvedValueOnce(MOCK_FUMETTO);
      const res = await getFumetto(
        makeEvent({ pathParameters: { id: '1' } })
      );
      expect(res.statusCode).toBe(200);
    });

    it('getFumetto returns 404 for missing item', async () => {
      mockFumettoFindById.mockResolvedValueOnce(null);
      const res = await getFumetto(
        makeEvent({ pathParameters: { id: '999' } })
      );
      expect(res.statusCode).toBe(404);
    });

    it('createFumetto returns 201 for admin', async () => {
      mockFumettoCreate.mockResolvedValueOnce(MOCK_FUMETTO);
      const res = await createFumetto(
        makeEvent({
          headers: ADMIN_HEADERS,
          body: JSON.stringify({ title: 'New Comic', description: 'Desc' }),
        })
      );
      expect(res.statusCode).toBe(201);
    });

    it('createFumetto returns 401 without auth', async () => {
      const res = await createFumetto(
        makeEvent({ body: JSON.stringify({ title: 'Hack', description: 'Desc' }) })
      );
      expect(res.statusCode).toBe(401);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. DISCOUNT SERVICE
// ─────────────────────────────────────────────────────────────────────────────

describe('5. Discount Service', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('5.1 Validate discount code (public)', () => {
    it('returns 200 for a valid active code', async () => {
      mockDiscountFindByCode.mockResolvedValueOnce({
        ...MOCK_DISCOUNT,
        times_used: 0,
        max_uses: 100,
        is_active: true,
      });
      const start = Date.now();
      const res = await validateCode(
        makeEvent({ body: JSON.stringify({ code: 'SAVE10', cartTotal: 49.99 }) })
      );
      expect(res.statusCode).toBe(200);
      expect(Date.now() - start).toBeLessThan(MAX_LATENCY_MS);
    });

    it('returns 400 when code is missing from body', async () => {
      const res = await validateCode(makeEvent({ body: JSON.stringify({}) }));
      expect(res.statusCode).toBe(400);
    });

    it('returns 200 with valid:false when code does not exist', async () => {
      mockDiscountFindByCode.mockResolvedValueOnce(null);
      const res = await validateCode(
        makeEvent({ body: JSON.stringify({ code: 'FAKE99', cartTotal: 49.99 }) })
      );
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.valid).toBe(false);
    });
  });

  describe('5.2 Admin – list discounts', () => {
    it('returns 200 for admin', async () => {
      mockDiscountFindAll.mockResolvedValueOnce({ items: [MOCK_DISCOUNT], lastEvaluatedKey: null });
      const res = await listDiscounts(makeEvent({ headers: ADMIN_HEADERS }));
      expect(res.statusCode).toBe(200);
    });

    it('returns 401 without auth', async () => {
      const res = await listDiscounts(makeEvent());
      expect(res.statusCode).toBe(401);
    });
  });

  describe('5.3 Admin – create discount', () => {
    it('returns 201 for a valid discount creation', async () => {
      mockDiscountCreate.mockResolvedValueOnce(MOCK_DISCOUNT);
      const res = await createDiscount(
        makeEvent({
          headers: ADMIN_HEADERS,
          body: JSON.stringify({
            code: 'NEWCODE',
            discount_type: 'percentage',
            discount_value: 15,
            max_usage: 50,
          }),
        })
      );
      expect(res.statusCode).toBe(201);
    });
  });

  describe('5.4 Admin – update discount', () => {
    it('returns 200 when admin updates a discount', async () => {
      mockDiscountUpdate.mockResolvedValueOnce({ ...MOCK_DISCOUNT, discount_value: 20 });
      const res = await updateDiscount(
        makeEvent({
          headers: ADMIN_HEADERS,
          pathParameters: { id: '1' },
          body: JSON.stringify({ discount_value: 20 }),
        })
      );
      expect(res.statusCode).toBe(200);
    });
  });

  describe('5.5 Admin – delete discount', () => {
    it('returns 200 when admin deletes a discount', async () => {
      mockDiscountSoftDelete.mockResolvedValueOnce(true);
      const res = await deleteDiscount(
        makeEvent({
          headers: ADMIN_HEADERS,
          pathParameters: { id: '1' },
        })
      );
      expect(res.statusCode).toBe(200);
    });
  });

  describe('5.6 Admin – discount stats', () => {
    it('returns 200 with usage statistics', async () => {
      mockDiscountFindById.mockResolvedValueOnce(MOCK_DISCOUNT);
      mockDiscountGetStats.mockResolvedValueOnce({ total_used: 5, total_discount_given: 24.95 });
      const res = await getStats(
        makeEvent({
          headers: ADMIN_HEADERS,
          pathParameters: { id: '1' },
        })
      );
      expect(res.statusCode).toBe(200);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. NOTIFICATION SERVICE
// ─────────────────────────────────────────────────────────────────────────────

describe('6. Notification Service', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('6.1 List notifications (admin)', () => {
    it('returns 200 with notification list', async () => {
      mockGetNotifications.mockResolvedValueOnce({
        notifications: [MOCK_NOTIFICATION],
        unreadCount: 1,
        lastEvaluatedKey: null,
      });
      const start = Date.now();
      const res = await listNotifications(makeEvent({ headers: ADMIN_HEADERS }));
      expect(res.statusCode).toBe(200);
      expect(Date.now() - start).toBeLessThan(MAX_LATENCY_MS);
    });

    it('returns 401 without auth', async () => {
      const res = await listNotifications(makeEvent());
      expect(res.statusCode).toBe(401);
    });
  });

  describe('6.2 Mark notification as read (admin)', () => {
    it('returns 200 after marking as read', async () => {
      mockGetNotificationById.mockResolvedValueOnce(MOCK_NOTIFICATION);
      mockMarkAsRead.mockResolvedValueOnce({ ...MOCK_NOTIFICATION, is_read: true });
      const res = await markAsRead(
        makeEvent({ headers: ADMIN_HEADERS, pathParameters: { id: 'notif-uuid-1' } })
      );
      expect(res.statusCode).toBe(200);
    });

    it('returns 404 for non-existent notification', async () => {
      mockGetNotificationById.mockResolvedValueOnce(null);
      const res = await markAsRead(
        makeEvent({ headers: ADMIN_HEADERS, pathParameters: { id: 'nonexistent-id' } })
      );
      expect(res.statusCode).toBe(404);
    });
  });

  describe('6.3 Mark all notifications as read (admin)', () => {
    it('returns 200 after marking all as read', async () => {
      mockMarkAllAsRead.mockResolvedValueOnce(undefined);
      const res = await markAllAsRead(makeEvent({ headers: ADMIN_HEADERS }));
      expect(res.statusCode).toBe(200);
    });
  });

  describe('6.4 Delete notification (admin)', () => {
    it('returns 200 after deletion', async () => {
      mockGetNotificationById.mockResolvedValueOnce(MOCK_NOTIFICATION);
      mockDeleteNotification.mockResolvedValueOnce(undefined);
      const res = await deleteNotification(
        makeEvent({ headers: ADMIN_HEADERS, pathParameters: { id: 'notif-uuid-1' } })
      );
      expect(res.statusCode).toBe(200);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. AUDIT SERVICE
// ─────────────────────────────────────────────────────────────────────────────

describe('7. Audit Service', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('7.1 Get entity history (admin)', () => {
    it('returns 200 with audit logs', async () => {
      mockGetEntityHistory.mockResolvedValueOnce({ logs: [MOCK_AUDIT_LOG], lastEvaluatedKey: null });
      const start = Date.now();
      const res = await getEntityHistory(
        makeEvent({
          headers: ADMIN_HEADERS,
          pathParameters: { type: 'product', id: '1' },
        })
      );
      expect(res.statusCode).toBe(200);
      expect(Date.now() - start).toBeLessThan(MAX_LATENCY_MS);
    });

    it('returns 401 without auth', async () => {
      const res = await getEntityHistory(
        makeEvent({ pathParameters: { type: 'product', id: '1' } })
      );
      expect(res.statusCode).toBe(401);
    });
  });

  describe('7.2 Get user activity (admin)', () => {
    it('returns 200 with user activity logs', async () => {
      mockGetUserActivity.mockResolvedValueOnce({ logs: [MOCK_AUDIT_LOG], lastEvaluatedKey: null });
      const res = await getUserActivity(
        makeEvent({ headers: ADMIN_HEADERS, pathParameters: { userId: '1' } })
      );
      expect(res.statusCode).toBe(200);
    });

    it('returns 401 without auth', async () => {
      const res = await getUserActivity(
        makeEvent({ pathParameters: { userId: '1' } })
      );
      expect(res.statusCode).toBe(401);
    });
  });

  describe('7.3 Get activity by date range (admin)', () => {
    it('returns 200 with date-filtered logs', async () => {
      mockGetActivityByDateRange.mockResolvedValueOnce({
        logs: [MOCK_AUDIT_LOG],
        lastEvaluatedKey: null,
      });
      const res = await getActivityByDate(
        makeEvent({
          headers: ADMIN_HEADERS,
          queryStringParameters: {
            startDate: '2024-01-01',
            endDate: '2024-12-31',
          },
        })
      );
      expect(res.statusCode).toBe(200);
    });

    it('returns 400 when dates are missing', async () => {
      const res = await getActivityByDate(
        makeEvent({ headers: ADMIN_HEADERS })
      );
      expect(res.statusCode).toBe(400);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. INTEGRATION SERVICE (Etsy)
// ─────────────────────────────────────────────────────────────────────────────

describe('8. Integration Service – Etsy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetOAuthState.mockResolvedValue({
      state: 'random-state',
      expiresAt: Date.now() + 60_000,
    });
  });

  describe('8.1 OAuth entrypoint (public)', () => {
    it('returns 302 redirect to Etsy authorization URL', async () => {
      const res = await initiateOAuth(makeEvent());
      expect([301, 302, 200]).toContain(res.statusCode);
    });
  });

  describe('8.2 Admin – sync products', () => {
    it('returns 401 without auth', async () => {
      const res = await syncProducts(makeEvent());
      expect(res.statusCode).toBe(401);
    });

    it('returns error when no Etsy token is configured', async () => {
      mockGetToken.mockResolvedValueOnce(null);
      const res = await syncProducts(
        makeEvent({
          headers: ADMIN_HEADERS,
          queryStringParameters: { shop_id: 'test-shop' },
        }),
      );
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  describe('8.3 Admin – sync inventory', () => {
    it('returns 401 without auth', async () => {
      const res = await syncInventory(makeEvent());
      expect(res.statusCode).toBe(401);
    });
  });

  describe('8.4 Admin – sync orders', () => {
    it('returns 401 without auth', async () => {
      const res = await syncOrders(makeEvent());
      expect(res.statusCode).toBe(401);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. USER FLOWS (end-to-end handler sequences)
// ─────────────────────────────────────────────────────────────────────────────

describe('9. User Flows', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('9.1 Browse products flow', () => {
    it('customer can list and view a product', async () => {
      mockListProducts.mockResolvedValueOnce({ products: [MOCK_PRODUCT], total: 1 });
      const list = await listProducts(makeEvent());
      expect(list.statusCode).toBe(200);

      mockGetProductBySlug.mockResolvedValueOnce(MOCK_PRODUCT);
      const detail = await getProduct(
        makeEvent({ pathParameters: { slug: 'sample-artwork-1' } })
      );
      expect(detail.statusCode).toBe(200);
    });
  });

  describe('9.2 Add to cart and apply discount flow', () => {
    it('customer adds a product to cart, applies discount, and views total', async () => {
      // Step 1: Get or create cart
      mockGetOrCreateCart.mockResolvedValue(MOCK_CART);
      mockGetCartItems.mockResolvedValue([]);
      mockCalculateTotals.mockReturnValue({ subtotal: 0, total: 0, currency: 'EUR' });
      const cartRes = await getCart(
        makeEvent({ headers: { 'x-cart-session': 'session-flow' } })
      );
      expect(cartRes.statusCode).toBe(200);

      // Step 2: Add item
      mockAddItem.mockResolvedValueOnce(MOCK_CART_ITEM);
      mockGetCartItems.mockResolvedValueOnce([MOCK_CART_ITEM]);
      mockCalculateTotals.mockReturnValueOnce({ subtotal: 49.99, total: 49.99, currency: 'EUR' });
      const addRes = await addItem(
        makeEvent({
          headers: { 'x-cart-session': 'session-flow' },
          body: JSON.stringify({ product_id: 1, quantity: 1, unit_price: 49.99 }),
        })
      );
      expect(addRes.statusCode).toBe(200);

      // Step 3: Apply discount
      mockApplyDiscount.mockResolvedValueOnce({ ...MOCK_CART, discount_code: 'SAVE10' });
      mockGetCartItems.mockResolvedValueOnce([MOCK_CART_ITEM]);
      mockCalculateTotals.mockReturnValueOnce({
        subtotal: 49.99,
        discount: 5.0,
        total: 44.99,
        currency: 'EUR',
      });
      const discountRes = await applyDiscount(
        makeEvent({
          headers: { 'x-cart-session': 'session-flow' },
          body: JSON.stringify({ code: 'SAVE10' }),
        })
      );
      expect(discountRes.statusCode).toBe(200);
    });
  });

  describe('9.3 Checkout and order confirmation flow', () => {
    it('customer places an order and receives confirmation', async () => {
      mockCreateOrder.mockResolvedValueOnce(MOCK_ORDER);
      const orderRes = await createOrder(
        makeEvent({
          body: JSON.stringify({
            customer_email: 'customer@example.com',
            customer_name: 'Test Customer',
            items: [{ product_id: 1, quantity: 1, unit_price: 49.99 }],
          }),
        })
      );
      expect(orderRes.statusCode).toBe(201);

      const body = JSON.parse(orderRes.body);
      expect(body).toBeDefined();

      mockGetOrder.mockResolvedValueOnce(MOCK_ORDER);
      const getRes = await getOrder(
        makeEvent({ pathParameters: { orderNumber: 'ORD-001' } })
      );
      expect(getRes.statusCode).toBe(200);
    });
  });

  describe('9.4 View personaggi flow', () => {
    it('customer can browse personaggi (public content)', async () => {
      mockPersonaggioFindAll.mockResolvedValueOnce([MOCK_PERSONAGGIO]);
      const listRes = await listPersonaggi(makeEvent());
      expect(listRes.statusCode).toBe(200);

      mockPersonaggioFindById.mockResolvedValueOnce(MOCK_PERSONAGGIO);
      const detailRes = await getPersonaggio(
        makeEvent({ pathParameters: { id: '1' } })
      );
      expect(detailRes.statusCode).toBe(200);
    });
  });

  describe('9.5 Admin operations flow', () => {
    it('admin creates a product, updates it, then deletes it', async () => {
      mockCreateProduct.mockResolvedValueOnce(MOCK_PRODUCT);
      const createRes = await createProduct(
        makeEvent({
          headers: ADMIN_HEADERS,
          body: JSON.stringify({ title: 'Admin Art', slug: 'admin-art', base_price: 99 }),
        })
      );
      expect(createRes.statusCode).toBe(201);

      mockUpdateProduct.mockResolvedValueOnce({ ...MOCK_PRODUCT, base_price: 120 });
      const updateRes = await updateProduct(
        makeEvent({
          headers: ADMIN_HEADERS,
          pathParameters: { id: '1' },
          body: JSON.stringify({ base_price: 120 }),
        })
      );
      expect(updateRes.statusCode).toBe(200);

      mockDeleteProduct.mockResolvedValueOnce(undefined);
      const deleteRes = await deleteProduct(
        makeEvent({ headers: ADMIN_HEADERS, pathParameters: { id: '1' } })
      );
      expect(deleteRes.statusCode).toBe(200);
    });

    it('admin updates an order status after fulfillment', async () => {
      mockUpdateOrderStatus.mockResolvedValueOnce({ ...MOCK_ORDER, status: 'shipped' });
      const res = await updateOrderStatus(
        makeEvent({
          headers: ADMIN_HEADERS,
          pathParameters: { id: 'order-uuid-1' },
          body: JSON.stringify({ status: 'shipped' }),
        })
      );
      expect(res.statusCode).toBe(200);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. SECURITY VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

describe('10. Security Validation', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('10.1 Authentication enforced on all admin endpoints', () => {
    const adminEndpoints = [
      { name: 'createProduct',   call: () => createProduct(makeEvent({ body: '{}' })) },
      { name: 'updateProduct',   call: () => updateProduct(makeEvent({ pathParameters: { id: '1' }, body: '{}' })) },
      { name: 'deleteProduct',   call: () => deleteProduct(makeEvent({ pathParameters: { id: '1' } })) },
      { name: 'listDiscounts',   call: () => listDiscounts(makeEvent()) },
      { name: 'createDiscount',  call: () => createDiscount(makeEvent({ body: '{}' })) },
      { name: 'listNotifications', call: () => listNotifications(makeEvent()) },
      { name: 'getEntityHistory', call: () => getEntityHistory(makeEvent({ pathParameters: { type: 'product', id: '1' } })) },
      { name: 'getUserActivity', call: () => getUserActivity(makeEvent({ pathParameters: { userId: '1' } })) },
      { name: 'syncProducts',    call: () => syncProducts(makeEvent()) },
      { name: 'syncInventory',   call: () => syncInventory(makeEvent()) },
      { name: 'syncOrders',      call: () => syncOrders(makeEvent()) },
    ];

    for (const endpoint of adminEndpoints) {
      it(`${endpoint.name} returns 401 when no auth header is provided`, async () => {
        const res = await endpoint.call();
        expect(res.statusCode).toBe(401);
      });
    }
  });

  describe('10.2 Public endpoints accessible without auth', () => {
    it('listProducts returns 200 without auth', async () => {
      mockListProducts.mockResolvedValueOnce({ products: [], total: 0 });
      const res = await listProducts(makeEvent());
      expect(res.statusCode).toBe(200);
    });

    it('listPersonaggi returns 200 without auth', async () => {
      mockPersonaggioFindAll.mockResolvedValueOnce([]);
      const res = await listPersonaggi(makeEvent());
      expect(res.statusCode).toBe(200);
    });

    it('listFumetti returns 200 without auth', async () => {
      mockFumettoFindAll.mockResolvedValueOnce([]);
      const res = await listFumetti(makeEvent());
      expect(res.statusCode).toBe(200);
    });
  });

  describe('10.3 Invalid JWT rejected', () => {
    it('createProduct returns 401 for a tampered token', async () => {
      const badToken = jwt.sign({ id: 1, username: 'admin' }, 'wrong-secret');
      const res = await createProduct(
        makeEvent({
          headers: { Authorization: `Bearer ${badToken}` },
          body: JSON.stringify({ title: 'Hack', slug: 'hack', base_price: 0 }),
        })
      );
      expect(res.statusCode).toBe(401);
    });

    it('listNotifications returns 401 for an expired token', async () => {
      const expiredToken = jwt.sign({ id: 1, username: 'admin' }, JWT_SECRET, { expiresIn: -1 });
      const res = await listNotifications(
        makeEvent({ headers: { Authorization: `Bearer ${expiredToken}` } })
      );
      expect(res.statusCode).toBe(401);
    });
  });

  describe('10.4 Response headers include Content-Type', () => {
    it('listProducts response includes Content-Type header', async () => {
      mockListProducts.mockResolvedValueOnce({ products: [], total: 0 });
      const res = await listProducts(makeEvent());
      const ct = res.headers?.['Content-Type'] ?? res.headers?.['content-type'];
      expect(ct).toMatch(/application\/json/i);
    });

    it('listPersonaggi response includes Content-Type header', async () => {
      mockPersonaggioFindAll.mockResolvedValueOnce([]);
      const res = await listPersonaggi(makeEvent());
      const ct = res.headers?.['Content-Type'] ?? res.headers?.['content-type'];
      expect(ct).toMatch(/application\/json/i);
    });
  });

  describe('10.5 Demo token backward compatibility', () => {
    it('createProduct accepts the demo token', async () => {
      mockCreateProduct.mockResolvedValueOnce(MOCK_PRODUCT);
      const res = await createProduct(
        makeEvent({
          headers: { Authorization: 'Bearer demo-token-12345' },
          body: JSON.stringify({ title: 'Demo Art', slug: 'demo-art', base_price: 10 }),
        })
      );
      expect(res.statusCode).toBe(201);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. PERFORMANCE VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

describe('11. Performance Validation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('all 8 key endpoints respond within target latency', async () => {
    const benchmarks: Array<{ name: string; latencyMs: number }> = [];

    // Product
    mockListProducts.mockResolvedValue({ products: [], total: 0 });
    let t0 = Date.now();
    await listProducts(makeEvent());
    benchmarks.push({ name: 'listProducts', latencyMs: Date.now() - t0 });

    // Order
    mockGetOrder.mockResolvedValue(MOCK_ORDER);
    t0 = Date.now();
    await getOrder(makeEvent({ pathParameters: { orderNumber: 'ORD-001' } }));
    benchmarks.push({ name: 'getOrder', latencyMs: Date.now() - t0 });

    // Cart
    mockGetOrCreateCart.mockResolvedValue(MOCK_CART);
    mockGetCartItems.mockResolvedValue([]);
    mockCalculateTotals.mockReturnValue({ subtotal: 0, total: 0, currency: 'EUR' });
    t0 = Date.now();
    await getCart(makeEvent({ headers: { 'x-cart-session': 'bench-session' } }));
    benchmarks.push({ name: 'getCart', latencyMs: Date.now() - t0 });

    // Content
    mockPersonaggioFindAll.mockResolvedValue([]);
    t0 = Date.now();
    await listPersonaggi(makeEvent());
    benchmarks.push({ name: 'listPersonaggi', latencyMs: Date.now() - t0 });

    // Discount
    mockDiscountFindByCode.mockResolvedValue(null);
    t0 = Date.now();
    await validateCode(makeEvent({ body: JSON.stringify({ code: 'BENCH', cartTotal: 10 }) }));
    benchmarks.push({ name: 'validateCode', latencyMs: Date.now() - t0 });

    // Notification
    mockGetNotifications.mockResolvedValue({ notifications: [], unreadCount: 0 });
    t0 = Date.now();
    await listNotifications(makeEvent({ headers: ADMIN_HEADERS }));
    benchmarks.push({ name: 'listNotifications', latencyMs: Date.now() - t0 });

    // Audit
    mockGetEntityHistory.mockResolvedValue({ logs: [], lastEvaluatedKey: null });
    t0 = Date.now();
    await getEntityHistory(
      makeEvent({ headers: ADMIN_HEADERS, pathParameters: { type: 'product', id: '1' } })
    );
    benchmarks.push({ name: 'getEntityHistory', latencyMs: Date.now() - t0 });

    // Integration
    t0 = Date.now();
    await initiateOAuth(makeEvent());
    benchmarks.push({ name: 'initiateOAuth', latencyMs: Date.now() - t0 });

    for (const b of benchmarks) {
      expect(b.latencyMs).toBeLessThan(MAX_LATENCY_MS);
    }
  });
});
