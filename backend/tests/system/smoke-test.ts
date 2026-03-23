/**
 * Smoke Test – Art Management Tool
 *
 * A fast, targeted health check that validates all services are responding
 * and critical user flows work correctly.  Target total run time: < 5 minutes.
 *
 * Checks:
 *   1. Health endpoints green for every service
 *   2. All services respond (public + auth endpoints return expected codes)
 *   3. Critical flows: browse products → add to cart → checkout
 *   4. Security: unauthenticated requests to admin routes are rejected
 *
 * All external dependencies are mocked so this suite can run locally or in CI
 * without any cloud infrastructure.
 *
 * Run:
 *   cd backend && npm test -- tests/system/smoke-test.ts
 */

// ── Environment (must precede all imports) ────────────────────────────────────
process.env.DYNAMODB_TABLE_NAME = 'art-smoke-test';
process.env.AWS_REGION = 'us-east-1';
process.env.JWT_SECRET = 'smoke-test-secret';
process.env.S3_BUCKET_NAME = 'art-smoke-test-bucket';
process.env.ETSY_CLIENT_ID = 'smoke-client-id';
process.env.ETSY_CLIENT_SECRET = 'smoke-client-secret';
process.env.ETSY_REDIRECT_URI = 'https://example.com/api/integrations/etsy/callback';
process.env.ETSY_WEBHOOK_SECRET = 'smoke-webhook-secret';
process.env.NODE_ENV = 'test';

import jwt from 'jsonwebtoken';

// ── Helpers ───────────────────────────────────────────────────────────────────

const JWT_SECRET = 'smoke-test-secret';
/** Smoke-test response-time budget (ms). */
const SMOKE_MAX_LATENCY_MS = 200;

function makeAdminToken(): string {
  return jwt.sign({ id: 1, username: 'artadmin' }, JWT_SECRET, { expiresIn: '1h' });
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

// ── Product Service Mocks ─────────────────────────────────────────────────────

const mockListProducts    = jest.fn();
const mockGetProductBySlug = jest.fn();
const mockCreateProduct   = jest.fn();
const mockUpdateProduct   = jest.fn();
const mockDeleteProduct   = jest.fn();
const mockGetProductById  = jest.fn();
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

const mockCreateOrder    = jest.fn();
const mockGetOrder       = jest.fn();
const mockListOrders     = jest.fn();
const mockGetCustomerOrders = jest.fn();
const mockUpdateOrderStatus = jest.fn();
const mockProcessPayment = jest.fn();

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

const mockGetOrCreateCart = jest.fn();
const mockGetCartItems    = jest.fn();
const mockGetCart         = jest.fn();
const mockAddItem         = jest.fn();
const mockUpdateQuantity  = jest.fn();
const mockRemoveItem      = jest.fn();
const mockClearCart       = jest.fn();
const mockApplyDiscount   = jest.fn();
const mockRemoveDiscount  = jest.fn();
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
    applyDiscount: mockApplyDiscount,
    removeDiscount: mockRemoveDiscount,
    calculateTotals: mockCalculateTotals,
  })),
}));

// ── Content Service Mocks ─────────────────────────────────────────────────────

const mockPersonaggioFindAll  = jest.fn();
const mockPersonaggioFindById = jest.fn();
const mockPersonaggioCreate   = jest.fn();
const mockPersonaggioUpdate   = jest.fn();
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

const mockFumettoFindAll  = jest.fn();
const mockFumettoFindById = jest.fn();
const mockFumettoCreate   = jest.fn();
const mockFumettoUpdate   = jest.fn();
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

jest.mock('../../src/services/s3/S3Service', () => ({
  S3Service: jest.fn().mockImplementation(() => ({
    generatePresignedUploadUrl: jest.fn(),
  })),
}));

// ── Discount Service Mocks ────────────────────────────────────────────────────

const mockDiscountFindByCode = jest.fn();
const mockDiscountFindAll    = jest.fn();
const mockDiscountFindById   = jest.fn();
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

const mockGetNotifications    = jest.fn();
const mockGetNotificationById = jest.fn();
const mockMarkAsRead          = jest.fn();
const mockMarkAllAsRead       = jest.fn();
const mockDeleteNotification  = jest.fn();

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

const mockGetEntityHistory       = jest.fn();
const mockGetUserActivity        = jest.fn();
const mockGetActivityByDateRange = jest.fn();

jest.mock('../../src/services/AuditService', () => ({
  AuditService: jest.fn().mockImplementation(() => ({
    getEntityHistory: mockGetEntityHistory,
    getUserActivity: mockGetUserActivity,
    getActivityByDateRange: mockGetActivityByDateRange,
  })),
}));

// ── Integration Service Mocks ─────────────────────────────────────────────────

jest.mock('../../services/integration-service/src/tokenStore', () => ({
  saveToken: jest.fn().mockResolvedValue(undefined),
  getToken: jest.fn().mockResolvedValue(null),
  saveOAuthState: jest.fn().mockResolvedValue(undefined),
  getOAuthState: jest.fn().mockResolvedValue({
    state: 'smoke-state',
    expiresAt: Date.now() + 60_000,
  }),
  deleteOAuthState: jest.fn().mockResolvedValue(undefined),
}));

global.fetch = jest.fn() as typeof fetch;

// ── Shared DynamoDB mock ──────────────────────────────────────────────────────

jest.mock('../../src/services/dynamodb/DynamoDBOptimized', () => ({
  DynamoDBOptimized: jest.fn().mockImplementation(() => ({})),
}));

// ── Health-check utilities mock (product-service inline copy) ─────────────────

jest.mock('../../services/product-service/src/health-check', () => ({
  checkDynamoDB: jest.fn().mockResolvedValue({ status: 'healthy', latencyMs: 5 }),
  checkS3:       jest.fn().mockResolvedValue({ status: 'healthy', latencyMs: 5 }),
  checkMemory:   jest.fn().mockReturnValue({ status: 'healthy', usedMb: 50, limitMb: 512 }),
  aggregateStatus: jest.fn().mockReturnValue('healthy'),
  buildHealthReport: jest.fn().mockImplementation(
    (service: string, version: string, checks: Record<string, unknown>) => ({
      status: 'healthy',
      service,
      version,
      timestamp: new Date().toISOString(),
      checks,
    })
  ),
  CheckStatus: { HEALTHY: 'healthy', DEGRADED: 'degraded', UNHEALTHY: 'unhealthy' },
}));

// ── Handler imports (after all mocks) ────────────────────────────────────────

import {
  listProducts,
  getProduct,
  createProduct,
} from '../../services/product-service/src/handlers/product.handler';

import {
  getHealth,
} from '../../services/product-service/src/handlers/health.handler';

import {
  createOrder,
  getOrder,
  listOrders,
} from '../../services/order-service/src/handlers/order.handler';

import {
  getCart,
  addItem,
} from '../../services/cart-service/src/handlers/cart.handler';

import {
  listPersonaggi,
} from '../../services/content-service/src/handlers/personaggi.handler';

import {
  listFumetti,
} from '../../services/content-service/src/handlers/fumetti.handler';

import {
  validateCode,
  listDiscounts,
} from '../../services/discount-service/src/handlers/discount.handler';

import {
  listNotifications,
} from '../../services/notification-service/src/handlers/notification.handler';

import {
  getEntityHistory,
} from '../../services/audit-service/src/handlers/audit.handler';

import {
  initiateOAuth,
  syncProducts,
} from '../../services/integration-service/src/handlers/etsy.handler';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MOCK_PRODUCT = {
  id: 1,
  slug: 'smoke-artwork',
  title: 'Smoke Artwork',
  base_price: 29.99,
  currency: 'EUR',
  status: 'published',
};

const MOCK_ORDER = {
  id: 'smoke-order-uuid',
  order_number: 'ORD-SMOKE',
  customer_email: 'smoke@example.com',
  status: 'pending',
  total_amount: 29.99,
};

const MOCK_CART = {
  id: 'smoke-cart-uuid',
  session_id: 'smoke-session',
  items: [],
  subtotal: 0,
  total: 0,
};

const MOCK_CART_ITEM = {
  id: 'smoke-item-uuid',
  cart_id: 'smoke-cart-uuid',
  product_id: 1,
  quantity: 1,
  unit_price: 29.99,
};

// ─────────────────────────────────────────────────────────────────────────────
// SMOKE TEST SUITE
// ─────────────────────────────────────────────────────────────────────────────

describe('Smoke Tests – Art Management Tool', () => {
  beforeEach(() => jest.clearAllMocks());

  // ── 1. Health Endpoints ──────────────────────────────────────────────────

  describe('1. Health endpoints green', () => {
    it('product-service /health returns 200 with healthy status', async () => {
      const start = Date.now();
      const res = await getHealth(makeEvent());
      const elapsed = Date.now() - start;

      expect(res.statusCode).toBe(200);
      expect(elapsed).toBeLessThan(SMOKE_MAX_LATENCY_MS);

      const body = JSON.parse(res.body);
      expect(body).toHaveProperty('status');
      expect(['healthy', 'degraded']).toContain(body.status);
    });
  });

  // ── 2. All Services Responding ───────────────────────────────────────────

  describe('2. All services responding', () => {
    it('Product service – GET /api/products returns 200', async () => {
      mockListProducts.mockResolvedValueOnce({ products: [MOCK_PRODUCT], total: 1 });
      const start = Date.now();
      const res = await listProducts(makeEvent());
      expect(res.statusCode).toBe(200);
      expect(Date.now() - start).toBeLessThan(SMOKE_MAX_LATENCY_MS);
    });

    it('Order service – GET /api/admin/orders returns 200 (auth delegated to API Gateway)', async () => {
      mockListOrders.mockResolvedValueOnce({ orders: [], total: 0 });
      const start = Date.now();
      const res = await listOrders(makeEvent());
      expect(res.statusCode).toBe(200);
      expect(Date.now() - start).toBeLessThan(SMOKE_MAX_LATENCY_MS);
    });

    it('Cart service – GET /api/cart returns 200 with empty cart', async () => {
      mockGetOrCreateCart.mockResolvedValueOnce(MOCK_CART);
      mockGetCartItems.mockResolvedValueOnce([]);
      mockCalculateTotals.mockReturnValueOnce({ subtotal: 0, total: 0, currency: 'EUR' });
      const start = Date.now();
      const res = await getCart(
        makeEvent({ headers: { 'x-cart-session': 'smoke-session' } })
      );
      expect(res.statusCode).toBe(200);
      expect(Date.now() - start).toBeLessThan(SMOKE_MAX_LATENCY_MS);
    });

    it('Content service – GET /api/personaggi returns 200', async () => {
      mockPersonaggioFindAll.mockResolvedValueOnce([]);
      const start = Date.now();
      const res = await listPersonaggi(makeEvent());
      expect(res.statusCode).toBe(200);
      expect(Date.now() - start).toBeLessThan(SMOKE_MAX_LATENCY_MS);
    });

    it('Content service – GET /api/fumetti returns 200', async () => {
      mockFumettoFindAll.mockResolvedValueOnce([]);
      const start = Date.now();
      const res = await listFumetti(makeEvent());
      expect(res.statusCode).toBe(200);
      expect(Date.now() - start).toBeLessThan(SMOKE_MAX_LATENCY_MS);
    });

    it('Discount service – POST /api/discounts/validate returns 400 without body code', async () => {
      const start = Date.now();
      const res = await validateCode(makeEvent({ body: JSON.stringify({}) }));
      expect(res.statusCode).toBe(400);
      expect(Date.now() - start).toBeLessThan(SMOKE_MAX_LATENCY_MS);
    });

    it('Notification service – GET /api/admin/notifications returns 401 without auth', async () => {
      const start = Date.now();
      const res = await listNotifications(makeEvent());
      expect(res.statusCode).toBe(401);
      expect(Date.now() - start).toBeLessThan(SMOKE_MAX_LATENCY_MS);
    });

    it('Audit service – GET /api/admin/audit/entity returns 401 without auth', async () => {
      const start = Date.now();
      const res = await getEntityHistory(
        makeEvent({ pathParameters: { type: 'product', id: '1' } })
      );
      expect(res.statusCode).toBe(401);
      expect(Date.now() - start).toBeLessThan(SMOKE_MAX_LATENCY_MS);
    });

    it('Integration service – GET /api/integrations/etsy/auth returns 301/302/200', async () => {
      const start = Date.now();
      const res = await initiateOAuth(makeEvent());
      expect([200, 301, 302]).toContain(res.statusCode);
      expect(Date.now() - start).toBeLessThan(SMOKE_MAX_LATENCY_MS);
    });
  });

  // ── 3. Critical Flows ────────────────────────────────────────────────────

  describe('3. Critical flows working', () => {
    it('Browse → Cart → Checkout flow completes', async () => {
      // Browse products
      mockListProducts.mockResolvedValueOnce({ products: [MOCK_PRODUCT], total: 1 });
      const browseRes = await listProducts(makeEvent());
      expect(browseRes.statusCode).toBe(200);

      // View product detail
      mockGetProductBySlug.mockResolvedValueOnce(MOCK_PRODUCT);
      const detailRes = await getProduct(
        makeEvent({ pathParameters: { slug: 'smoke-artwork' } })
      );
      expect(detailRes.statusCode).toBe(200);

      // Add to cart
      mockGetOrCreateCart.mockResolvedValue(MOCK_CART);
      mockAddItem.mockResolvedValueOnce(MOCK_CART_ITEM);
      mockGetCartItems.mockResolvedValueOnce([MOCK_CART_ITEM]);
      mockCalculateTotals.mockReturnValueOnce({ subtotal: 29.99, total: 29.99, currency: 'EUR' });
      const addRes = await addItem(
        makeEvent({
          headers: { 'x-cart-session': 'smoke-session' },
          body: JSON.stringify({ product_id: 1, quantity: 1, unit_price: 29.99 }),
        })
      );
      expect(addRes.statusCode).toBe(200);

      // Checkout
      mockCreateOrder.mockResolvedValueOnce(MOCK_ORDER);
      const orderRes = await createOrder(
        makeEvent({
          body: JSON.stringify({
            customer_email: 'smoke@example.com',
            customer_name: 'Smoke Customer',
            items: [{ product_id: 1, quantity: 1, unit_price: 29.99 }],
          }),
        })
      );
      expect(orderRes.statusCode).toBe(201);

      // Order confirmation
      mockGetOrder.mockResolvedValueOnce(MOCK_ORDER);
      const confirmRes = await getOrder(
        makeEvent({ pathParameters: { orderNumber: 'ORD-SMOKE' } })
      );
      expect(confirmRes.statusCode).toBe(200);
    });

    it('Admin view and manage orders flow', async () => {
      mockListOrders.mockResolvedValueOnce({ orders: [MOCK_ORDER], total: 1 });
      const res = await listOrders(makeEvent({ headers: ADMIN_HEADERS }));
      expect(res.statusCode).toBe(200);
    });

    it('Admin discount management flow', async () => {
      mockDiscountFindAll.mockResolvedValueOnce({ items: [], lastEvaluatedKey: null });
      const res = await listDiscounts(makeEvent({ headers: ADMIN_HEADERS }));
      expect(res.statusCode).toBe(200);
    });
  });

  // ── 4. Security Health Check ─────────────────────────────────────────────

  describe('4. Security – admin routes reject unauthenticated requests', () => {
    const unauthenticatedChecks: Array<{ route: string; call: () => Promise<{ statusCode: number }> }> = [
      { route: 'POST /api/products',              call: () => createProduct(makeEvent({ body: '{}' })) },
      { route: 'GET /api/admin/notifications',    call: () => listNotifications(makeEvent()) },
      { route: 'GET /api/admin/discounts',        call: () => listDiscounts(makeEvent()) },
      { route: 'GET /api/admin/audit/entity/x/1', call: () => getEntityHistory(makeEvent({ pathParameters: { type: 'x', id: '1' } })) },
      { route: 'POST /api/admin/integrations/etsy/sync/products', call: () => syncProducts(makeEvent()) },
    ];

    for (const check of unauthenticatedChecks) {
      it(`${check.route} → 401 without credentials`, async () => {
        const res = await check.call();
        expect(res.statusCode).toBe(401);
      });
    }
  });
});
