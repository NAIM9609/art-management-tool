/**
 * Variant Lambda Handlers
 *
 * Endpoints:
 *   GET   /api/products/{id}/variants   -> listVariants  (public)
 *   POST  /api/products/{id}/variants   -> createVariant (admin)
 *   PUT   /api/variants/{id}            -> updateVariant (admin)
 *   PATCH /api/variants/{id}/stock      -> updateStock   (admin)
 */

import { APIGatewayProxyHandler, APIGatewayProxyEventHeaders } from 'aws-lambda';
import { ProductService } from '../../../../src/services/ProductService';
import { requireAuth, AuthError } from '../auth';
import { respond } from '../lib/http';

const productService = new ProductService();

function handleError(error: unknown, h: APIGatewayProxyEventHeaders | null) {
  if (error instanceof AuthError) {
    return respond(error.statusCode, { message: error.message }, h);
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('not found')) return respond(404, { message: error.message }, h);
    if (
      msg.includes('validation') ||
      msg.includes('invalid') ||
      msg.includes('required') ||
      msg.includes('negative') ||
      msg.includes('cannot')
    ) {
      return respond(400, { message: error.message }, h);
    }
  }
  return respond(500, { message: 'Internal server error' }, h);
}

function validateCreateVariant(body: Record<string, unknown>): string | null {
  if (!body.sku || typeof body.sku !== 'string' || body.sku.trim() === '') {
    return 'sku is required';
  }
  if (!body.name || typeof body.name !== 'string' || body.name.trim() === '') {
    return 'name is required';
  }
  if (body.stock !== undefined && (typeof body.stock !== 'number' || body.stock < 0)) {
    return 'stock must be a non-negative number';
  }
  if (body.price_adjustment !== undefined && typeof body.price_adjustment !== 'number') {
    return 'price_adjustment must be a number';
  }
  return null;
}

/** GET /api/products/{id}/variants */
export const listVariants: APIGatewayProxyHandler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return respond(204, null, event.headers);
  try {
    const idParam = event.pathParameters?.id;
    if (!idParam) return respond(400, { message: 'id is required' }, event.headers);
    const productId = parseInt(idParam, 10);
    if (isNaN(productId) || productId <= 0) {
      return respond(400, { message: 'id must be a positive integer' }, event.headers);
    }

    const product = await productService.getProductById(productId);
    if (!product) return respond(404, { message: 'Product not found' }, event.headers);

    return respond(200, { variants: product.variants || [] }, event.headers);
  } catch (error) {
    return handleError(error, event.headers);
  }
};

/** POST /api/products/{id}/variants */
export const createVariant: APIGatewayProxyHandler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return respond(204, null, event.headers);
  try {
    requireAuth(event);

    const idParam = event.pathParameters?.id;
    if (!idParam) return respond(400, { message: 'id is required' }, event.headers);
    const productId = parseInt(idParam, 10);
    if (isNaN(productId) || productId <= 0) {
      return respond(400, { message: 'id must be a positive integer' }, event.headers);
    }

    if (!event.body) return respond(400, { message: 'Request body is required' }, event.headers);

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(event.body);
    } catch {
      return respond(400, { message: 'Invalid JSON in request body' }, event.headers);
    }

    const validationError = validateCreateVariant(body);
    if (validationError) return respond(400, { message: validationError }, event.headers);

    const variant = await productService.addVariant(productId, {
      sku: body.sku as string,
      name: body.name as string,
      attributes: body.attributes as Record<string, string> | undefined,
      price_adjustment: typeof body.price_adjustment === 'number' ? body.price_adjustment : 0,
      stock: typeof body.stock === 'number' ? body.stock : 0,
    });

    return respond(201, variant, event.headers);
  } catch (error) {
    return handleError(error, event.headers);
  }
};

/** PUT /api/variants/{id} */
export const updateVariant: APIGatewayProxyHandler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return respond(204, null, event.headers);
  try {
    requireAuth(event);

    const variantId = event.pathParameters?.id;
    if (!variantId) return respond(400, { message: 'id is required' }, event.headers);

    if (!event.body) return respond(400, { message: 'Request body is required' }, event.headers);

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(event.body);
    } catch {
      return respond(400, { message: 'Invalid JSON in request body' }, event.headers);
    }

    if (Object.keys(body).length === 0) {
      return respond(400, { message: 'At least one field is required for update' }, event.headers);
    }

    const variant = await productService.updateVariant(variantId, body);

    return respond(200, variant, event.headers);
  } catch (error) {
    return handleError(error, event.headers);
  }
};

/** PATCH /api/variants/{id}/stock */
export const updateStock: APIGatewayProxyHandler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return respond(204, null, event.headers);
  try {
    requireAuth(event);

    const variantId = event.pathParameters?.id;
    if (!variantId) return respond(400, { message: 'id is required' }, event.headers);

    if (!event.body) return respond(400, { message: 'Request body is required' }, event.headers);

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(event.body);
    } catch {
      return respond(400, { message: 'Invalid JSON in request body' }, event.headers);
    }

    if (body.quantity === undefined || body.quantity === null) {
      return respond(400, { message: 'quantity is required' }, event.headers);
    }
    if (typeof body.quantity !== 'number') {
      return respond(400, { message: 'quantity must be a number' }, event.headers);
    }
    if (body.quantity < 0) {
      return respond(400, { message: 'quantity must be non-negative' }, event.headers);
    }

    const variant = await productService.updateVariant(variantId, { stock: body.quantity as number });

    return respond(200, variant, event.headers);
  } catch (error) {
    return handleError(error, event.headers);
  }
};
