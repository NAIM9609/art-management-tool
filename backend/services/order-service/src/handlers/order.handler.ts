/**
 * Order Service Lambda Handlers
 *
 * Implements Lambda handler functions for the Order Service REST API:
 *   POST   /api/orders                       -> createOrder
 *   GET    /api/orders/{orderNumber}         -> getOrder
 *   GET    /api/orders                       -> getCustomerOrders (by email query param)
 *   GET    /api/admin/orders                 -> listOrders (admin)
 *   PATCH  /api/admin/orders/{id}/status     -> updateOrderStatus (admin)
 *   POST   /api/orders/{id}/payment          -> processPayment
 *   POST   /api/webhooks/payment             -> webhookHandler
 */

import {
  OrderService,
  OrderStatus,
  CreateOrderServiceData,
  PaymentData,
} from '../../../../src/services/OrderService';
import { NotificationService } from '../../../../src/services/NotificationService';
import { MockPaymentProvider } from '../../../../src/services/payment/MockPaymentProvider';
import { StripePaymentProvider } from '../../../../src/services/payment/StripePaymentProvider';
import { PaymentProvider } from '../../../../src/services/payment/PaymentProvider';

// ---------------------------------------------------------------------------
// Lambda event / response types (API Gateway Proxy Integration compatible)
// ---------------------------------------------------------------------------

export interface LambdaEvent {
  httpMethod: string;
  path: string;
  pathParameters?: Record<string, string> | null;
  queryStringParameters?: Record<string, string> | null;
  headers?: Record<string, string> | null;
  body?: string | null;
}

export interface LambdaResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

const RESPONSE_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-user-id',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
};

function successResponse(data: unknown, statusCode = 200): LambdaResponse {
  return {
    statusCode,
    headers: RESPONSE_HEADERS,
    body: JSON.stringify(data),
  };
}

function errorResponse(message: string, statusCode = 500): LambdaResponse {
  return {
    statusCode,
    headers: RESPONSE_HEADERS,
    body: JSON.stringify({ error: message }),
  };
}

function parseBody(event: LambdaEvent): Record<string, any> {
  if (!event.body) return {};
  try {
    return JSON.parse(event.body);
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Service factory
// ---------------------------------------------------------------------------

/** Typed filters accepted by the listOrders handler. */
interface OrderListFilters {
  status?: string;
}

export interface OrderServiceDeps {
  orderService: OrderService;
  paymentProvider: PaymentProvider;
}

/**
 * Creates service instances from environment variables.
 * Exported so tests can spy on / replace it.
 */
export function createOrderServiceDeps(): OrderServiceDeps {
  const notificationService = new NotificationService();

  let paymentProvider: PaymentProvider;
  const providerName = process.env.PAYMENT_PROVIDER ?? 'mock';

  if (providerName === 'stripe' && process.env.STRIPE_API_KEY) {
    paymentProvider = new StripePaymentProvider();
  } else {
    paymentProvider = new MockPaymentProvider();
  }

  const orderService = new OrderService(paymentProvider, notificationService);
  return { orderService, paymentProvider };
}

// ---------------------------------------------------------------------------
// Handler: POST /api/orders
// ---------------------------------------------------------------------------

/**
 * Create a new order.
 * Wraps createOrder in a DynamoDB transaction (via OrderService).
 * Rolls back atomically if stock is insufficient.
 * Creates a notification on success.
 */
export async function createOrder(
  event: LambdaEvent,
  deps?: OrderServiceDeps
): Promise<LambdaResponse> {
  try {
    const { orderService: svc } = deps ?? createOrderServiceDeps();
    const body = parseBody(event);

    if (!body.customer_email || !body.customer_name) {
      return errorResponse('customer_email and customer_name are required', 400);
    }
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return errorResponse('items must be a non-empty array', 400);
    }

    const totals = svc.calculateTotals(body.items);

    const orderData: CreateOrderServiceData = {
      customer_email: body.customer_email,
      customer_name: body.customer_name,
      subtotal: totals.subtotal,
      tax: totals.tax,
      discount: totals.discount,
      total: totals.total,
      currency: body.currency ?? 'EUR',
      status: body.status ?? OrderStatus.PENDING,
      payment_method: body.payment_method,
      shipping_address: body.shipping_address,
      billing_address: body.billing_address,
      notes: body.notes,
      items: body.items,
    };

    const result = await svc.createOrder(orderData);
    return successResponse(result, 201);
  } catch (err: any) {
    const msg: string = err?.message ?? 'Internal server error';
    if (
      msg.includes('Insufficient stock') ||
      msg.includes('must also supply product_id') ||
      msg.includes('Order creation failed')
    ) {
      return errorResponse(msg, 400);
    }
    return errorResponse(msg);
  }
}

// ---------------------------------------------------------------------------
// Handler: GET /api/orders/{orderNumber}
// ---------------------------------------------------------------------------

/**
 * Retrieve a single order by its order number (e.g. ORD-20240101-0001).
 */
export async function getOrder(
  event: LambdaEvent,
  deps?: OrderServiceDeps
): Promise<LambdaResponse> {
  try {
    const { orderService: svc } = deps ?? createOrderServiceDeps();
    const orderNumber = event.pathParameters?.orderNumber;

    if (!orderNumber) {
      return errorResponse('orderNumber path parameter is required', 400);
    }

    const order = await svc.getOrderByNumber(orderNumber);
    if (!order) {
      return errorResponse('Order not found', 404);
    }

    return successResponse(order);
  } catch (err: any) {
    return errorResponse(err?.message ?? 'Internal server error');
  }
}

// ---------------------------------------------------------------------------
// Handler: GET /api/admin/orders  (admin)
// ---------------------------------------------------------------------------

/**
 * List orders with optional status filter and pagination.
 * Admin-only endpoint.
 */
export async function listOrders(
  event: LambdaEvent,
  deps?: OrderServiceDeps
): Promise<LambdaResponse> {
  try {
    const { orderService: svc } = deps ?? createOrderServiceDeps();
    const query = event.queryStringParameters ?? {};
    const page = parseInt(query.page ?? '1', 10);
    const perPage = parseInt(query.per_page ?? '20', 10);
    const filters: OrderListFilters = {};
    if (query.status) filters.status = query.status;

    const result = await svc.listOrders(filters, page, perPage);
    return successResponse(result);
  } catch (err: any) {
    return errorResponse(err?.message ?? 'Internal server error');
  }
}

// ---------------------------------------------------------------------------
// Handler: PATCH /api/admin/orders/{id}/status  (admin)
// ---------------------------------------------------------------------------

/**
 * Update the fulfillment / lifecycle status of an order.
 * Admin-only endpoint.
 */
export async function updateOrderStatus(
  event: LambdaEvent,
  deps?: OrderServiceDeps
): Promise<LambdaResponse> {
  try {
    const { orderService: svc } = deps ?? createOrderServiceDeps();
    const id = event.pathParameters?.id;

    if (!id) {
      return errorResponse('id path parameter is required', 400);
    }

    const body = parseBody(event);
    if (!body.status) {
      return errorResponse('status is required', 400);
    }

    const validStatuses = Object.values(OrderStatus);
    if (!validStatuses.includes(body.status)) {
      return errorResponse(
        `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
        400
      );
    }

    const userId = event.headers?.['x-user-id'] ?? undefined;
    const updated = await svc.updateOrderStatus(
      id,
      body.status as OrderStatus,
      userId
    );

    if (!updated) {
      return errorResponse('Order not found', 404);
    }

    return successResponse(updated);
  } catch (err: any) {
    return errorResponse(err?.message ?? 'Internal server error');
  }
}

// ---------------------------------------------------------------------------
// Handler: GET /api/orders  (by customer email)
// ---------------------------------------------------------------------------

/**
 * List orders belonging to a specific customer email.
 * Requires ?email=<address> query parameter.
 */
export async function getCustomerOrders(
  event: LambdaEvent,
  deps?: OrderServiceDeps
): Promise<LambdaResponse> {
  try {
    const { orderService: svc } = deps ?? createOrderServiceDeps();
    const query = event.queryStringParameters ?? {};
    const email = query.email;

    if (!email) {
      return errorResponse('email query parameter is required', 400);
    }

    const limit = query.limit ? parseInt(query.limit, 10) : 20;
    const result = await svc.getOrdersByCustomer(email, { limit });
    return successResponse(result);
  } catch (err: any) {
    return errorResponse(err?.message ?? 'Internal server error');
  }
}

// ---------------------------------------------------------------------------
// Handler: POST /api/orders/{id}/payment
// ---------------------------------------------------------------------------

/**
 * Process payment for an existing order.
 * Fetches the order total and delegates to the configured PaymentProvider.
 * Updates the order payment_status to "paid" on success.
 */
export async function processPayment(
  event: LambdaEvent,
  deps?: OrderServiceDeps
): Promise<LambdaResponse> {
  try {
    const { orderService: svc, paymentProvider: provider } =
      deps ?? createOrderServiceDeps();

    const id = event.pathParameters?.id;
    if (!id) {
      return errorResponse('id path parameter is required', 400);
    }

    const orderResult = await svc.getOrderById(id);
    if (!orderResult) {
      return errorResponse('Order not found', 404);
    }

    const body = parseBody(event);
    const paymentResult = await provider.processPayment(
      orderResult.order.total,
      orderResult.order.currency,
      body.payment_details ?? {}
    );

    if (!paymentResult.success) {
      return errorResponse(paymentResult.error ?? 'Payment failed', 400);
    }

    const paymentData: PaymentData = {
      payment_status: 'paid',
      payment_intent_id: paymentResult.transactionId,
    };

    const updatedOrder = await svc.processPayment(id, paymentData);
    return successResponse({
      order: updatedOrder,
      transaction_id: paymentResult.transactionId,
    });
  } catch (err: any) {
    return errorResponse(err?.message ?? 'Internal server error');
  }
}

// ---------------------------------------------------------------------------
// Handler: POST /api/webhooks/payment
// ---------------------------------------------------------------------------

/**
 * Handle incoming payment provider webhook events.
 * Validates the webhook signature then processes payment_intent.succeeded events.
 */
export async function webhookHandler(
  event: LambdaEvent,
  deps?: OrderServiceDeps
): Promise<LambdaResponse> {
  try {
    const { orderService: svc, paymentProvider: provider } =
      deps ?? createOrderServiceDeps();

    const signature =
      event.headers?.['stripe-signature'] ??
      event.headers?.['x-webhook-signature'] ??
      '';
    const rawBody = event.body ?? '';

    const validation = await provider.validateWebhook(
      Buffer.from(rawBody),
      signature
    );

    if (!validation.valid) {
      return errorResponse(
        validation.error ?? 'Invalid webhook signature',
        401
      );
    }

    const webhookEvent = validation.event;
    const eventType: string = webhookEvent?.type ?? '';

    if (
      eventType === 'payment_intent.succeeded' ||
      eventType === 'mock_webhook'
    ) {
      const orderId: string | undefined =
        webhookEvent?.data?.object?.metadata?.order_id;
      const paymentIntentId: string | undefined =
        webhookEvent?.data?.object?.id ??
        webhookEvent?.data?.object?.transactionId;

      if (orderId) {
        await svc.processPayment(orderId, {
          payment_status: 'paid',
          payment_intent_id: paymentIntentId,
        });
      }
    }

    return successResponse({ received: true });
  } catch (err: any) {
    return errorResponse(err?.message ?? 'Internal server error');
  }
}
