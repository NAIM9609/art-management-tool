/**
 * Unit tests for Order Service Lambda Handlers
 *
 * All service calls are mocked at the module level so no DynamoDB connection
 * is required.  Each handler is tested for:
 *   - Happy-path success (correct status code + body shape)
 *   - Input-validation errors (400)
 *   - Not-found cases (404)
 *   - Downstream service errors (500)
 */

import {
  LambdaEvent,
  createOrder,
  getOrder,
  listOrders,
  updateOrderStatus,
  getCustomerOrders,
  processPayment,
  webhookHandler,
  OrderServiceDeps,
} from '../handlers/order.handler';
import { OrderStatus } from '../../../../src/services/OrderService';

// ---------------------------------------------------------------------------
// Shared mock data
// ---------------------------------------------------------------------------

const MOCK_ORDER = {
  id: 'order-uuid-1',
  order_number: 'ORD-20240101-0001',
  customer_email: 'test@example.com',
  customer_name: 'Test User',
  subtotal: 100,
  tax: 10,
  discount: 0,
  total: 110,
  currency: 'EUR',
  status: OrderStatus.PENDING,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

const MOCK_ORDER_ITEM = {
  id: 'item-uuid-1',
  order_id: 'order-uuid-1',
  product_name: 'Art Print',
  quantity: 2,
  unit_price: 50,
  total_price: 100,
  created_at: '2024-01-01T00:00:00.000Z',
};

// ---------------------------------------------------------------------------
// Mock services
// ---------------------------------------------------------------------------

function makeMockOrderService(overrides: Partial<Record<string, jest.Mock>> = {}) {
  return {
    calculateTotals: jest.fn().mockReturnValue({
      subtotal: 100,
      tax: 10,
      discount: 0,
      total: 110,
    }),
    createOrder: jest
      .fn()
      .mockResolvedValue({ order: MOCK_ORDER, items: [MOCK_ORDER_ITEM] }),
    getOrderByNumber: jest.fn().mockResolvedValue(MOCK_ORDER),
    getOrderById: jest
      .fn()
      .mockResolvedValue({ order: MOCK_ORDER, items: [MOCK_ORDER_ITEM] }),
    listOrders: jest.fn().mockResolvedValue({ orders: [MOCK_ORDER], total: 1 }),
    updateOrderStatus: jest
      .fn()
      .mockResolvedValue({ ...MOCK_ORDER, status: OrderStatus.PROCESSING }),
    processPayment: jest
      .fn()
      .mockResolvedValue({ ...MOCK_ORDER, payment_status: 'paid' }),
    getOrdersByCustomer: jest
      .fn()
      .mockResolvedValue({ items: [MOCK_ORDER], count: 1 }),
    ...overrides,
  } as unknown as OrderServiceDeps['orderService'];
}

function makeMockPaymentProvider(overrides: Partial<Record<string, jest.Mock>> = {}) {
  return {
    processPayment: jest.fn().mockResolvedValue({
      success: true,
      transactionId: 'txn-mock-123',
      message: 'Payment processed',
    }),
    refundPayment: jest.fn().mockResolvedValue({ success: true, refundId: 'ref-1' }),
    validateWebhook: jest.fn().mockResolvedValue({
      valid: true,
      event: {
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_test_123',
            metadata: { order_id: 'order-uuid-1' },
          },
        },
      },
    }),
    getName: jest.fn().mockReturnValue('mock'),
    ...overrides,
  } as unknown as OrderServiceDeps['paymentProvider'];
}

function makeDeps(
  orderOverrides: Partial<Record<string, jest.Mock>> = {},
  paymentOverrides: Partial<Record<string, jest.Mock>> = {}
): OrderServiceDeps {
  return {
    orderService: makeMockOrderService(orderOverrides),
    paymentProvider: makeMockPaymentProvider(paymentOverrides),
  };
}

// ---------------------------------------------------------------------------
// Helper: base event
// ---------------------------------------------------------------------------

function baseEvent(overrides: Partial<LambdaEvent> = {}): LambdaEvent {
  return {
    httpMethod: 'GET',
    path: '/',
    pathParameters: null,
    queryStringParameters: null,
    headers: null,
    body: null,
    ...overrides,
  };
}

// ===========================================================================
// createOrder
// ===========================================================================

describe('createOrder', () => {
  it('returns 201 with order and items on success', async () => {
    const deps = makeDeps();
    const event = baseEvent({
      httpMethod: 'POST',
      path: '/api/orders',
      body: JSON.stringify({
        customer_email: 'test@example.com',
        customer_name: 'Test User',
        items: [{ product_id: 1, quantity: 2, unit_price: 50 }],
      }),
    });

    const response = await createOrder(event, deps);

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.order.order_number).toBe('ORD-20240101-0001');
    expect(body.items).toHaveLength(1);
  });

  it('returns 400 when customer_email is missing', async () => {
    const deps = makeDeps();
    const event = baseEvent({
      httpMethod: 'POST',
      body: JSON.stringify({
        customer_name: 'Test User',
        items: [{ quantity: 1, unit_price: 10 }],
      }),
    });

    const response = await createOrder(event, deps);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toMatch(/customer_email/);
  });

  it('returns 400 when customer_name is missing', async () => {
    const deps = makeDeps();
    const event = baseEvent({
      httpMethod: 'POST',
      body: JSON.stringify({
        customer_email: 'test@example.com',
        items: [{ quantity: 1, unit_price: 10 }],
      }),
    });

    const response = await createOrder(event, deps);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toMatch(/customer_name/);
  });

  it('returns 400 when items array is missing', async () => {
    const deps = makeDeps();
    const event = baseEvent({
      httpMethod: 'POST',
      body: JSON.stringify({
        customer_email: 'test@example.com',
        customer_name: 'Test User',
      }),
    });

    const response = await createOrder(event, deps);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toMatch(/items/);
  });

  it('returns 400 when items array is empty', async () => {
    const deps = makeDeps();
    const event = baseEvent({
      httpMethod: 'POST',
      body: JSON.stringify({
        customer_email: 'test@example.com',
        customer_name: 'Test User',
        items: [],
      }),
    });

    const response = await createOrder(event, deps);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toMatch(/items/);
  });

  it('returns 400 when status is invalid', async () => {
    const deps = makeDeps();
    const event = baseEvent({
      httpMethod: 'POST',
      body: JSON.stringify({
        customer_email: 'test@example.com',
        customer_name: 'Test User',
        status: 'not-a-real-status',
        items: [{ quantity: 1, unit_price: 10 }],
      }),
    });

    const response = await createOrder(event, deps);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toMatch(/Invalid status/i);
  });

  it('returns 400 on insufficient stock error', async () => {
    const deps = makeDeps({
      createOrder: jest.fn().mockRejectedValue(new Error('Insufficient stock for variant var-1')),
    });
    const event = baseEvent({
      httpMethod: 'POST',
      body: JSON.stringify({
        customer_email: 'test@example.com',
        customer_name: 'Test User',
        items: [{ product_id: 1, variant_id: 'var-1', quantity: 99, unit_price: 50 }],
      }),
    });

    const response = await createOrder(event, deps);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toMatch(/Insufficient stock/);
  });

  it('returns 400 when DynamoDB transaction is cancelled', async () => {
    const deps = makeDeps({
      createOrder: jest.fn().mockRejectedValue(
        new Error('Order creation failed: insufficient stock or concurrent modification')
      ),
    });
    const event = baseEvent({
      httpMethod: 'POST',
      body: JSON.stringify({
        customer_email: 'test@example.com',
        customer_name: 'Test User',
        items: [{ product_id: 1, quantity: 1, unit_price: 50 }],
      }),
    });

    const response = await createOrder(event, deps);

    expect(response.statusCode).toBe(400);
  });

  it('returns 500 on unexpected error', async () => {
    const deps = makeDeps({
      createOrder: jest.fn().mockRejectedValue(new Error('DynamoDB connection error')),
    });
    const event = baseEvent({
      httpMethod: 'POST',
      body: JSON.stringify({
        customer_email: 'test@example.com',
        customer_name: 'Test User',
        items: [{ quantity: 1, unit_price: 10 }],
      }),
    });

    const response = await createOrder(event, deps);

    expect(response.statusCode).toBe(500);
  });

  it('includes CORS headers in the response', async () => {
    const deps = makeDeps();
    const event = baseEvent({
      httpMethod: 'POST',
      body: JSON.stringify({
        customer_email: 'test@example.com',
        customer_name: 'Test User',
        items: [{ quantity: 1, unit_price: 10 }],
      }),
    });

    const response = await createOrder(event, deps);

    expect(response.headers['Content-Type']).toBe('application/json');
    expect(response.headers['Access-Control-Allow-Origin']).toBe('*');
  });
});

// ===========================================================================
// getOrder
// ===========================================================================

describe('getOrder', () => {
  it('returns 200 with order data', async () => {
    const deps = makeDeps();
    const event = baseEvent({
      httpMethod: 'GET',
      path: '/api/orders/ORD-20240101-0001',
      pathParameters: { orderNumber: 'ORD-20240101-0001' },
    });

    const response = await getOrder(event, deps);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.order_number).toBe('ORD-20240101-0001');
  });

  it('returns 400 when orderNumber path parameter is missing', async () => {
    const deps = makeDeps();
    const event = baseEvent({ httpMethod: 'GET', path: '/api/orders/' });

    const response = await getOrder(event, deps);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toMatch(/orderNumber/);
  });

  it('returns 404 when order is not found', async () => {
    const deps = makeDeps({
      getOrderByNumber: jest.fn().mockResolvedValue(null),
    });
    const event = baseEvent({
      httpMethod: 'GET',
      pathParameters: { orderNumber: 'ORD-99999999-0000' },
    });

    const response = await getOrder(event, deps);

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body).error).toMatch(/not found/i);
  });

  it('returns 500 on service error', async () => {
    const deps = makeDeps({
      getOrderByNumber: jest.fn().mockRejectedValue(new Error('DB error')),
    });
    const event = baseEvent({
      pathParameters: { orderNumber: 'ORD-20240101-0001' },
    });

    const response = await getOrder(event, deps);

    expect(response.statusCode).toBe(500);
  });
});

// ===========================================================================
// listOrders
// ===========================================================================

describe('listOrders', () => {
  it('returns 200 with orders array and total', async () => {
    const deps = makeDeps();
    const event = baseEvent({
      httpMethod: 'GET',
      path: '/api/admin/orders',
    });

    const response = await listOrders(event, deps);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(Array.isArray(body.orders)).toBe(true);
    expect(body.total).toBe(1);
  });

  it('passes status filter to orderService.listOrders', async () => {
    const mockListOrders = jest
      .fn()
      .mockResolvedValue({ orders: [], total: 0 });
    const deps = makeDeps({ listOrders: mockListOrders });
    const event = baseEvent({
      queryStringParameters: { status: 'processing', per_page: '10', page: '2' },
    });

    await listOrders(event, deps);

    expect(mockListOrders).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'processing' }),
      2,
      10
    );
  });

  it('uses default pagination when no query params', async () => {
    const mockListOrders = jest
      .fn()
      .mockResolvedValue({ orders: [], total: 0 });
    const deps = makeDeps({ listOrders: mockListOrders });
    const event = baseEvent({});

    await listOrders(event, deps);

    expect(mockListOrders).toHaveBeenCalledWith(expect.any(Object), 1, 20);
  });

  it('normalizes invalid pagination values to defaults', async () => {
    const mockListOrders = jest
      .fn()
      .mockResolvedValue({ orders: [], total: 0 });
    const deps = makeDeps({ listOrders: mockListOrders });
    const event = baseEvent({
      queryStringParameters: { page: '0', per_page: 'abc' },
    });

    await listOrders(event, deps);

    expect(mockListOrders).toHaveBeenCalledWith(expect.any(Object), 1, 20);
  });

  it('caps per_page to 100', async () => {
    const mockListOrders = jest
      .fn()
      .mockResolvedValue({ orders: [], total: 0 });
    const deps = makeDeps({ listOrders: mockListOrders });
    const event = baseEvent({
      queryStringParameters: { per_page: '999', page: '1' },
    });

    await listOrders(event, deps);

    expect(mockListOrders).toHaveBeenCalledWith(expect.any(Object), 1, 100);
  });

  it('returns 500 on service error', async () => {
    const deps = makeDeps({
      listOrders: jest.fn().mockRejectedValue(new Error('Query failed')),
    });
    const event = baseEvent({});

    const response = await listOrders(event, deps);

    expect(response.statusCode).toBe(500);
  });
});

// ===========================================================================
// updateOrderStatus
// ===========================================================================

describe('updateOrderStatus', () => {
  it('returns 200 with updated order on success', async () => {
    const deps = makeDeps();
    const event = baseEvent({
      httpMethod: 'PATCH',
      path: '/api/admin/orders/order-uuid-1/status',
      pathParameters: { id: 'order-uuid-1' },
      body: JSON.stringify({ status: 'processing' }),
    });

    const response = await updateOrderStatus(event, deps);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe(OrderStatus.PROCESSING);
  });

  it('returns 400 when id path parameter is missing', async () => {
    const deps = makeDeps();
    const event = baseEvent({
      body: JSON.stringify({ status: 'processing' }),
    });

    const response = await updateOrderStatus(event, deps);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toMatch(/id/);
  });

  it('returns 400 when status is missing in body', async () => {
    const deps = makeDeps();
    const event = baseEvent({
      pathParameters: { id: 'order-uuid-1' },
      body: JSON.stringify({}),
    });

    const response = await updateOrderStatus(event, deps);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toMatch(/status/);
  });

  it('returns 400 for an invalid status value', async () => {
    const deps = makeDeps();
    const event = baseEvent({
      pathParameters: { id: 'order-uuid-1' },
      body: JSON.stringify({ status: 'invalid-status' }),
    });

    const response = await updateOrderStatus(event, deps);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toMatch(/Invalid status/);
  });

  it('returns 404 when order is not found', async () => {
    const deps = makeDeps({
      updateOrderStatus: jest.fn().mockResolvedValue(null),
    });
    const event = baseEvent({
      pathParameters: { id: 'non-existent-id' },
      body: JSON.stringify({ status: 'processing' }),
    });

    const response = await updateOrderStatus(event, deps);

    expect(response.statusCode).toBe(404);
  });

  it('forwards x-user-id header to service', async () => {
    const mockUpdateStatus = jest
      .fn()
      .mockResolvedValue({ ...MOCK_ORDER, status: OrderStatus.PROCESSING });
    const deps = makeDeps({ updateOrderStatus: mockUpdateStatus });
    const event = baseEvent({
      pathParameters: { id: 'order-uuid-1' },
      headers: { 'x-user-id': 'admin-user-42' },
      body: JSON.stringify({ status: 'processing' }),
    });

    await updateOrderStatus(event, deps);

    expect(mockUpdateStatus).toHaveBeenCalledWith(
      'order-uuid-1',
      OrderStatus.PROCESSING,
      'admin-user-42'
    );
  });

  it('forwards X-User-Id header to service case-insensitively', async () => {
    const mockUpdateStatus = jest
      .fn()
      .mockResolvedValue({ ...MOCK_ORDER, status: OrderStatus.PROCESSING });
    const deps = makeDeps({ updateOrderStatus: mockUpdateStatus });
    const event = baseEvent({
      pathParameters: { id: 'order-uuid-1' },
      headers: { 'X-User-Id': 'admin-user-99' },
      body: JSON.stringify({ status: 'processing' }),
    });

    await updateOrderStatus(event, deps);

    expect(mockUpdateStatus).toHaveBeenCalledWith(
      'order-uuid-1',
      OrderStatus.PROCESSING,
      'admin-user-99'
    );
  });

  it('returns 500 on service error', async () => {
    const deps = makeDeps({
      updateOrderStatus: jest.fn().mockRejectedValue(new Error('DB write failed')),
    });
    const event = baseEvent({
      pathParameters: { id: 'order-uuid-1' },
      body: JSON.stringify({ status: 'processing' }),
    });

    const response = await updateOrderStatus(event, deps);

    expect(response.statusCode).toBe(500);
  });
});

// ===========================================================================
// getCustomerOrders
// ===========================================================================

describe('getCustomerOrders', () => {
  it('returns 200 with customer orders', async () => {
    const deps = makeDeps();
    const event = baseEvent({
      httpMethod: 'GET',
      queryStringParameters: { email: 'test@example.com' },
    });

    const response = await getCustomerOrders(event, deps);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.count).toBe(1);
    expect(body.items).toHaveLength(1);
  });

  it('returns 400 when email query parameter is missing', async () => {
    const deps = makeDeps();
    const event = baseEvent({ httpMethod: 'GET' });

    const response = await getCustomerOrders(event, deps);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toMatch(/email/);
  });

  it('passes limit from query string', async () => {
    const mockGetByCustomer = jest
      .fn()
      .mockResolvedValue({ items: [], count: 0 });
    const deps = makeDeps({ getOrdersByCustomer: mockGetByCustomer });
    const event = baseEvent({
      queryStringParameters: { email: 'test@example.com', limit: '5' },
    });

    await getCustomerOrders(event, deps);

    expect(mockGetByCustomer).toHaveBeenCalledWith(
      'test@example.com',
      { limit: 5 }
    );
  });

  it('uses default limit for invalid query value', async () => {
    const mockGetByCustomer = jest
      .fn()
      .mockResolvedValue({ items: [], count: 0 });
    const deps = makeDeps({ getOrdersByCustomer: mockGetByCustomer });
    const event = baseEvent({
      queryStringParameters: { email: 'test@example.com', limit: 'abc' },
    });

    await getCustomerOrders(event, deps);

    expect(mockGetByCustomer).toHaveBeenCalledWith(
      'test@example.com',
      { limit: 20 }
    );
  });

  it('caps customer order limit at 100', async () => {
    const mockGetByCustomer = jest
      .fn()
      .mockResolvedValue({ items: [], count: 0 });
    const deps = makeDeps({ getOrdersByCustomer: mockGetByCustomer });
    const event = baseEvent({
      queryStringParameters: { email: 'test@example.com', limit: '999' },
    });

    await getCustomerOrders(event, deps);

    expect(mockGetByCustomer).toHaveBeenCalledWith(
      'test@example.com',
      { limit: 100 }
    );
  });

  it('returns 500 on service error', async () => {
    const deps = makeDeps({
      getOrdersByCustomer: jest.fn().mockRejectedValue(new Error('Query error')),
    });
    const event = baseEvent({
      queryStringParameters: { email: 'test@example.com' },
    });

    const response = await getCustomerOrders(event, deps);

    expect(response.statusCode).toBe(500);
  });
});

// ===========================================================================
// processPayment
// ===========================================================================

describe('processPayment', () => {
  it('returns 200 with updated order and transaction_id on success', async () => {
    const deps = makeDeps();
    const event = baseEvent({
      httpMethod: 'POST',
      pathParameters: { id: 'order-uuid-1' },
      body: JSON.stringify({ payment_details: {} }),
    });

    const response = await processPayment(event, deps);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.transaction_id).toBe('txn-mock-123');
    expect(body.order).toBeDefined();
  });

  it('returns 400 when id path parameter is missing', async () => {
    const deps = makeDeps();
    const event = baseEvent({ httpMethod: 'POST' });

    const response = await processPayment(event, deps);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toMatch(/id/);
  });

  it('returns 404 when order is not found', async () => {
    const deps = makeDeps({
      getOrderById: jest.fn().mockResolvedValue(null),
    });
    const event = baseEvent({
      pathParameters: { id: 'non-existent-id' },
    });

    const response = await processPayment(event, deps);

    expect(response.statusCode).toBe(404);
  });

  it('returns 404 when payment update returns null', async () => {
    const deps = makeDeps({
      processPayment: jest.fn().mockResolvedValue(null),
    });
    const event = baseEvent({
      httpMethod: 'POST',
      pathParameters: { id: 'order-uuid-1' },
      body: JSON.stringify({ payment_details: {} }),
    });

    const response = await processPayment(event, deps);

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body).error).toMatch(/not found/i);
  });

  it('returns 400 when payment provider rejects the payment', async () => {
    const deps = makeDeps(
      {},
      {
        processPayment: jest.fn().mockResolvedValue({
          success: false,
          transactionId: '',
          error: 'Card declined',
        }),
      }
    );
    const event = baseEvent({
      pathParameters: { id: 'order-uuid-1' },
      body: JSON.stringify({ payment_details: { simulateFailure: true } }),
    });

    const response = await processPayment(event, deps);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toBe('Card declined');
  });

  it('returns 500 on unexpected error', async () => {
    const deps = makeDeps({
      getOrderById: jest.fn().mockRejectedValue(new Error('Connection timeout')),
    });
    const event = baseEvent({
      pathParameters: { id: 'order-uuid-1' },
    });

    const response = await processPayment(event, deps);

    expect(response.statusCode).toBe(500);
  });
});

// ===========================================================================
// webhookHandler
// ===========================================================================

describe('webhookHandler', () => {
  it('returns 200 with received:true on valid webhook', async () => {
    const deps = makeDeps();
    const event = baseEvent({
      httpMethod: 'POST',
      path: '/api/webhooks/payment',
      headers: { 'stripe-signature': 'valid-sig' },
      body: JSON.stringify({ type: 'payment_intent.succeeded' }),
    });

    const response = await webhookHandler(event, deps);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ received: true });
  });

  it('processes payment when event type is payment_intent.succeeded', async () => {
    const mockProcessPayment = jest
      .fn()
      .mockResolvedValue({ ...MOCK_ORDER, payment_status: 'paid' });
    const deps = makeDeps({ processPayment: mockProcessPayment });
    const event = baseEvent({
      httpMethod: 'POST',
      headers: { 'stripe-signature': 'sig' },
      body: '{}',
    });

    await webhookHandler(event, deps);

    expect(mockProcessPayment).toHaveBeenCalledWith(
      'order-uuid-1',
      expect.objectContaining({ payment_status: 'paid' })
    );
  });

  it('returns 401 when webhook signature is invalid', async () => {
    const deps = makeDeps(
      {},
      {
        validateWebhook: jest.fn().mockResolvedValue({
          valid: false,
          error: 'Invalid signature',
        }),
      }
    );
    const event = baseEvent({
      httpMethod: 'POST',
      headers: { 'stripe-signature': 'bad-sig' },
      body: '{}',
    });

    const response = await webhookHandler(event, deps);

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body).error).toBe('Invalid signature');
  });

  it('does not process payment for unrelated event types', async () => {
    const mockProcessPayment = jest.fn();
    const deps = makeDeps(
      { processPayment: mockProcessPayment },
      {
        validateWebhook: jest.fn().mockResolvedValue({
          valid: true,
          event: { type: 'payment_intent.created', data: {} },
        }),
      }
    );
    const event = baseEvent({
      httpMethod: 'POST',
      body: '{}',
    });

    const response = await webhookHandler(event, deps);

    expect(response.statusCode).toBe(200);
    expect(mockProcessPayment).not.toHaveBeenCalled();
  });

  it('uses x-webhook-signature header as fallback', async () => {
    const mockValidateWebhook = jest.fn().mockResolvedValue({
      valid: true,
      event: { type: 'other', data: {} },
    });
    const deps = makeDeps({}, { validateWebhook: mockValidateWebhook });
    const event = baseEvent({
      httpMethod: 'POST',
      headers: { 'x-webhook-signature': 'fallback-sig' },
      body: '{}',
    });

    await webhookHandler(event, deps);

    expect(mockValidateWebhook).toHaveBeenCalledWith(
      expect.any(Buffer),
      'fallback-sig'
    );
  });

  it('accepts signature header with different casing', async () => {
    const mockValidateWebhook = jest.fn().mockResolvedValue({
      valid: true,
      event: { type: 'other', data: {} },
    });
    const deps = makeDeps({}, { validateWebhook: mockValidateWebhook });
    const event = baseEvent({
      httpMethod: 'POST',
      headers: { 'Stripe-Signature': 'mixed-case-sig' },
      body: '{}',
    });

    await webhookHandler(event, deps);

    expect(mockValidateWebhook).toHaveBeenCalledWith(
      expect.any(Buffer),
      'mixed-case-sig'
    );
  });

  it('decodes base64-encoded webhook body before validation', async () => {
    const mockValidateWebhook = jest.fn().mockResolvedValue({
      valid: true,
      event: { type: 'other', data: {} },
    });
    const deps = makeDeps({}, { validateWebhook: mockValidateWebhook });
    const base64Payload = Buffer.from('{"hello":"world"}').toString('base64');
    const event = baseEvent({
      httpMethod: 'POST',
      headers: { 'stripe-signature': 'sig' },
      body: base64Payload,
      isBase64Encoded: true,
    });

    await webhookHandler(event, deps);

    const firstCallArgs = mockValidateWebhook.mock.calls[0];
    expect(Buffer.isBuffer(firstCallArgs[0])).toBe(true);
    expect((firstCallArgs[0] as Buffer).toString()).toBe('{"hello":"world"}');
  });

  it('returns 500 on unexpected error', async () => {
    const deps = makeDeps(
      {},
      {
        validateWebhook: jest
          .fn()
          .mockRejectedValue(new Error('Stripe SDK error')),
      }
    );
    const event = baseEvent({ httpMethod: 'POST', body: '{}' });

    const response = await webhookHandler(event, deps);

    expect(response.statusCode).toBe(500);
  });
});
