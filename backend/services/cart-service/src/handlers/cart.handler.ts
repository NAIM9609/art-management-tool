/**
 * Cart Service Lambda Handlers
 *
 * Endpoints:
 *   GET    /api/cart                  -> getCart         (session-aware)
 *   POST   /api/cart/items            -> addItem         (session-aware)
 *   PATCH  /api/cart/items/{id}       -> updateQuantity  (session-aware)
 *   DELETE /api/cart/items/{id}       -> removeItem      (session-aware)
 *   DELETE /api/cart                  -> clearCart       (session-aware)
 *   POST   /api/cart/discount         -> applyDiscount   (session-aware)
 *   DELETE /api/cart/discount         -> removeDiscount  (session-aware)
 *
 * Session management:
 *   Session ID is extracted from the `cart_session` cookie or the
 *   `x-cart-session` / `x-session-id` request headers. When a valid JWT is
 *   present the user ID is also extracted so that the session cart is merged
 *   with the authenticated user's cart (login merge).
 */

import { v4 as uuidv4 } from 'uuid';
import { CartService } from '../../../../src/services/CartService';
import { AuthError, requireAuth } from '../auth';
import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  errorResponse,
} from '../types';

const SESSION_COOKIE_NAME = 'cart_session';
const SESSION_HEADER_NAME = 'x-cart-session';
const LEGACY_SESSION_HEADER = 'x-session-id';

let cartService: CartService | null = null;

function getCartService(): CartService {
  if (!cartService) {
    cartService = new CartService();
  }
  return cartService;
}

/**
 * Parse a raw Cookie header string into a key-value map.
 * e.g. "cart_session=abc; token=xyz" -> { cart_session: 'abc', token: 'xyz' }
 */
function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  cookieHeader.split(';').forEach(pair => {
    const [key, ...valueParts] = pair.split('=');
    const trimmedKey = key.trim();
    if (trimmedKey) {
      cookies[trimmedKey] = valueParts.join('=').trim();
    }
  });
  return cookies;
}

/**
 * Extract the session ID from cookies or request headers.
 * Priority: x-cart-session header → cart_session cookie → x-session-id (legacy).
 * Generates a new UUID-based session token when none is present.
 */
function extractSessionId(event: APIGatewayProxyEvent): string {
  const headers = event.headers || {};

  // 1. Prefer the dedicated cart-session header
  const cartSessionHeader =
    headers[SESSION_HEADER_NAME] || headers[SESSION_HEADER_NAME.toLowerCase()];
  if (cartSessionHeader) return cartSessionHeader;

  // 2. Fall back to the cookie
  const cookieHeader = headers['Cookie'] || headers['cookie'] || '';
  if (cookieHeader) {
    const cookies = parseCookies(cookieHeader);
    if (cookies[SESSION_COOKIE_NAME]) {
      return cookies[SESSION_COOKIE_NAME];
    }
  }

  // 3. Fall back to legacy header
  const legacyHeader =
    headers[LEGACY_SESSION_HEADER] || headers[LEGACY_SESSION_HEADER.toLowerCase()];
  if (legacyHeader) return legacyHeader;

  // 4. Generate a new session
  return `session_${uuidv4()}`;
}

/**
 * Attempt to extract the user ID from the JWT. Returns undefined when no
 * valid token is present (unauthenticated / guest requests are allowed).
 */
function tryGetUserId(event: APIGatewayProxyEvent): number | undefined {
  try {
    const payload = requireAuth(event);
    return payload.id;
  } catch {
    return undefined;
  }
}

/**
 * Build the Set-Cookie header value for the cart session.
 */
function buildSessionCookie(sessionId: string): string {
  return `${SESSION_COOKIE_NAME}=${sessionId}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${7 * 24 * 60 * 60}`;
}

/**
 * Build a full cart response that includes items, product/variant details and
 * computed totals.
 */
async function buildCartResponse(
  service: CartService,
  cartId: string,
  sessionId: string,
  discountCode?: string
): Promise<APIGatewayProxyResult> {
  const [items, totals] = await Promise.all([
    service.getCartItems(cartId),
    service.calculateTotals(cartId),
  ]);

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': buildSessionCookie(sessionId),
    },
    body: JSON.stringify({
      cart: {
        id: cartId,
        session_id: sessionId,
        items,
        discount_code: discountCode,
      },
      subtotal: totals.subtotal,
      discount: totals.discount,
      tax: totals.tax,
      total: totals.total,
    }),
  };
}

function handleError(error: unknown): APIGatewayProxyResult {
  if (error instanceof AuthError) {
    return errorResponse(error.message, error.statusCode);
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes('not found')) {
      return errorResponse(error.message, 404);
    }
    if (
      message.includes('invalid') ||
      message.includes('insufficient') ||
      message.includes('required') ||
      message.includes('expired') ||
      message.includes('no longer active')
    ) {
      return errorResponse(error.message, 400);
    }
  }
  return errorResponse('Internal server error', 500);
}

// ─────────────────────────────────────────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/cart
 * Return the current cart for the session, merging with the user cart when
 * the request is authenticated.
 */
export async function getCart(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const sessionId = extractSessionId(event);
    const userId = tryGetUserId(event);
    const service = getCartService();

    if (userId === undefined) {
      const sessionCart = await service.getOrCreateCart(sessionId);
      return buildCartResponse(service, sessionCart.id, sessionId, sessionCart.discount_code);
    }

    // For authenticated users, look up/create the user's cart independently from
    // session lookup, then merge guest cart items when both carts exist and differ.
    const userCart = await service.getOrCreateCart(undefined, userId);
    const sessionCart = await service.getOrCreateCart(sessionId);

    if (userCart.id !== sessionCart.id) {
      await service.mergeCarts(sessionCart.id, userCart.id);
    }

    return buildCartResponse(service, userCart.id, sessionId, userCart.discount_code);
  } catch (error) {
    return handleError(error);
  }
}

/**
 * POST /api/cart/items
 * Add an item (or increment its quantity) in the cart.
 * Body: { product_id: number, variant_id?: string, quantity?: number }
 */
export async function addItem(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    if (!event.body) {
      return errorResponse('Request body is required', 400);
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(event.body);
    } catch {
      return errorResponse('Invalid JSON in request body', 400);
    }

    if (body.product_id === undefined || body.product_id === null) {
      return errorResponse('product_id is required', 400);
    }
    const productId =
      typeof body.product_id === 'string'
        ? parseInt(body.product_id, 10)
        : (body.product_id as number);
    if (!Number.isInteger(productId) || productId <= 0) {
      return errorResponse('product_id must be a positive integer', 400);
    }

    const variantId =
      body.variant_id !== undefined && body.variant_id !== null
        ? String(body.variant_id)
        : undefined;

    const quantity =
      body.quantity !== undefined ? Number(body.quantity) : 1;
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return errorResponse('quantity must be a positive integer', 400);
    }

    const sessionId = extractSessionId(event);
    const userId = tryGetUserId(event);
    const service = getCartService();

    const cart = await service.getOrCreateCart(sessionId, userId);
    await service.addItem(cart.id, productId, variantId, quantity);

    return buildCartResponse(service, cart.id, sessionId, cart.discount_code);
  } catch (error) {
    return handleError(error);
  }
}

/**
 * PATCH /api/cart/items/{id}
 * Update the quantity of a cart item.
 * Body: { quantity: number }
 */
export async function updateQuantity(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const itemId = event.pathParameters?.id;
    if (!itemId) {
      return errorResponse('id is required', 400);
    }

    if (!event.body) {
      return errorResponse('Request body is required', 400);
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(event.body);
    } catch {
      return errorResponse('Invalid JSON in request body', 400);
    }

    if (body.quantity === undefined || body.quantity === null) {
      return errorResponse('quantity is required', 400);
    }
    const quantity = Number(body.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return errorResponse('quantity must be a positive integer', 400);
    }

    const sessionId = extractSessionId(event);
    const userId = tryGetUserId(event);
    const service = getCartService();

    const cart = await service.getOrCreateCart(sessionId, userId);
    await service.updateQuantity(cart.id, itemId, quantity);

    return buildCartResponse(service, cart.id, sessionId, cart.discount_code);
  } catch (error) {
    return handleError(error);
  }
}

/**
 * DELETE /api/cart/items/{id}
 * Remove a single item from the cart.
 */
export async function removeItem(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const itemId = event.pathParameters?.id;
    if (!itemId) {
      return errorResponse('id is required', 400);
    }

    const sessionId = extractSessionId(event);
    const userId = tryGetUserId(event);
    const service = getCartService();

    const cart = await service.getOrCreateCart(sessionId, userId);
    await service.removeItem(cart.id, itemId);

    return buildCartResponse(service, cart.id, sessionId, cart.discount_code);
  } catch (error) {
    return handleError(error);
  }
}

/**
 * DELETE /api/cart
 * Remove all items from the cart.
 */
export async function clearCart(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const sessionId = extractSessionId(event);
    const userId = tryGetUserId(event);
    const service = getCartService();

    const cart = await service.getOrCreateCart(sessionId, userId);
    await service.clearCart(cart.id);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': buildSessionCookie(sessionId),
      },
      body: JSON.stringify({ message: 'Cart cleared' }),
    };
  } catch (error) {
    return handleError(error);
  }
}

/**
 * POST /api/cart/discount
 * Apply a discount code to the cart.
 * Body: { code: string }
 */
export async function applyDiscount(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    if (!event.body) {
      return errorResponse('Request body is required', 400);
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(event.body);
    } catch {
      return errorResponse('Invalid JSON in request body', 400);
    }

    if (!body.code || typeof body.code !== 'string' || body.code.trim() === '') {
      return errorResponse('code is required', 400);
    }

    const sessionId = extractSessionId(event);
    const userId = tryGetUserId(event);
    const service = getCartService();

    const cart = await service.getOrCreateCart(sessionId, userId);
    const updatedCart = await service.applyDiscount(cart.id, body.code.trim());

    return buildCartResponse(service, updatedCart.id, sessionId, updatedCart.discount_code);
  } catch (error) {
    return handleError(error);
  }
}

/**
 * DELETE /api/cart/discount
 * Remove the applied discount code from the cart.
 */
export async function removeDiscount(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const sessionId = extractSessionId(event);
    const userId = tryGetUserId(event);
    const service = getCartService();

    const cart = await service.getOrCreateCart(sessionId, userId);
    const updatedCart = await service.removeDiscount(cart.id);

    return buildCartResponse(service, updatedCart.id, sessionId, updatedCart.discount_code);
  } catch (error) {
    return handleError(error);
  }
}
