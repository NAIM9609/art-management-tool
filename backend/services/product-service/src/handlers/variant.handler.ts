/**
 * Variant Lambda Handlers
 *
 * Endpoints:
 *   GET   /api/products/{id}/variants   -> listVariants  (public)
 *   POST  /api/products/{id}/variants   -> createVariant (admin)
 *   PUT   /api/variants/{id}            -> updateVariant (admin)
 *   PATCH /api/variants/{id}/stock      -> updateStock   (admin)
 */

import { ProductService } from '../../../../src/services/ProductService';
import { requireAuth, AuthError } from '../auth';
import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  successResponse,
  errorResponse,
} from '../types';

function getProductService(): ProductService {
  return new ProductService();
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
      message.includes('validation') ||
      message.includes('invalid') ||
      message.includes('required')
    ) {
      return errorResponse(error.message, 400);
    }
  }
  return errorResponse('Internal server error', 500);
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
  return null;
}

/**
 * GET /api/products/{id}/variants
 * List all variants for a product.
 */
export async function listVariants(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const idParam = event.pathParameters?.id;
    if (!idParam) {
      return errorResponse('id is required', 400);
    }
    const productId = parseInt(idParam, 10);
    if (isNaN(productId) || productId <= 0) {
      return errorResponse('id must be a positive integer', 400);
    }

    const service = getProductService();
    const product = await service.getProductById(productId);
    if (!product) {
      return errorResponse('Product not found', 404);
    }

    return successResponse({ variants: product.variants || [] });
  } catch (error) {
    return handleError(error);
  }
}

/**
 * POST /api/products/{id}/variants
 * Create a new variant for a product. Requires admin authentication.
 */
export async function createVariant(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    requireAuth(event);

    const idParam = event.pathParameters?.id;
    if (!idParam) {
      return errorResponse('id is required', 400);
    }
    const productId = parseInt(idParam, 10);
    if (isNaN(productId) || productId <= 0) {
      return errorResponse('id must be a positive integer', 400);
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

    const validationError = validateCreateVariant(body);
    if (validationError) {
      return errorResponse(validationError, 400);
    }

    const service = getProductService();
    const variant = await service.addVariant(productId, {
      sku: body.sku as string,
      name: body.name as string,
      attributes: body.attributes as Record<string, string> | undefined,
      price_adjustment: typeof body.price_adjustment === 'number' ? body.price_adjustment : 0,
      stock: typeof body.stock === 'number' ? body.stock : 0,
    });

    return successResponse(variant, 201);
  } catch (error) {
    return handleError(error);
  }
}

/**
 * PUT /api/variants/{id}
 * Update a variant. Requires admin authentication.
 */
export async function updateVariant(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    requireAuth(event);

    const variantId = event.pathParameters?.id;
    if (!variantId) {
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

    if (Object.keys(body).length === 0) {
      return errorResponse('At least one field is required for update', 400);
    }

    const service = getProductService();
    const variant = await service.updateVariant(variantId, body);

    return successResponse(variant);
  } catch (error) {
    return handleError(error);
  }
}

/**
 * PATCH /api/variants/{id}/stock
 * Update stock for a variant. Requires admin authentication.
 */
export async function updateStock(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    requireAuth(event);

    const variantId = event.pathParameters?.id;
    if (!variantId) {
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
    if (typeof body.quantity !== 'number') {
      return errorResponse('quantity must be a number', 400);
    }

    const service = getProductService();
    const variant = await service.updateVariant(variantId, { stock: body.quantity as number });

    return successResponse(variant);
  } catch (error) {
    return handleError(error);
  }
}
