/**
 * Product Lambda Handlers
 *
 * Endpoints:
 *   GET    /api/products          -> listProducts  (public)
 *   GET    /api/products/{slug}   -> getProduct    (public)
 *   POST   /api/products          -> createProduct (admin)
 *   PUT    /api/products/{id}     -> updateProduct (admin)
 *   DELETE /api/products/{id}     -> deleteProduct (admin)
 */

import { ProductService, ProductFilters, ProductStatus } from '../../../../src/services/ProductService';
import { requireAuth, AuthError } from '../auth';
import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  PUBLIC_CACHE_HEADERS,
  successResponse,
  errorResponse,
} from '../types';

const DEFAULT_PER_PAGE = 20;
const MAX_PER_PAGE = 100;

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

function validateCreateProduct(body: Record<string, unknown>): string | null {
  if (!body.title || typeof body.title !== 'string' || body.title.trim() === '') {
    return 'title is required';
  }
  if (!body.slug || typeof body.slug !== 'string' || body.slug.trim() === '') {
    return 'slug is required';
  }
  if (body.base_price === undefined || body.base_price === null) {
    return 'base_price is required';
  }
  if (typeof body.base_price !== 'number' || body.base_price < 0) {
    return 'base_price must be a non-negative number';
  }
  return null;
}

/**
 * GET /api/products
 * List products with optional filters and pagination.
 */
export async function listProducts(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const qs = event.queryStringParameters || {};
    const filters: ProductFilters = {};

    if (qs.category) filters.category = qs.category;
    if (qs.search) filters.search = qs.search;
    if (qs.status && Object.values(ProductStatus).includes(qs.status as ProductStatus)) {
      filters.status = qs.status as ProductStatus;
    }
    if (qs.min_price) {
      const min = parseFloat(qs.min_price);
      if (!isNaN(min)) filters.minPrice = min;
    }
    if (qs.max_price) {
      const max = parseFloat(qs.max_price);
      if (!isNaN(max)) filters.maxPrice = max;
    }

    const page = Math.max(1, parseInt(qs.page || '1', 10) || 1);
    const perPage = Math.min(MAX_PER_PAGE, Math.max(1, parseInt(qs.per_page || String(DEFAULT_PER_PAGE), 10) || DEFAULT_PER_PAGE));

    const service = getProductService();
    const result = await service.listProducts(filters, page, perPage);

    return {
      statusCode: 200,
      headers: {
        ...PUBLIC_CACHE_HEADERS,
        ETag: `"products-${page}-${perPage}-${result.total}"`,
      },
      body: JSON.stringify({
        products: result.products,
        total: result.total,
        page,
        per_page: perPage,
      }),
    };
  } catch (error) {
    return handleError(error);
  }
}

/**
 * GET /api/products/{slug}
 * Get a single product by slug.
 */
export async function getProduct(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const slug = event.pathParameters?.slug;
    if (!slug) {
      return errorResponse('slug is required', 400);
    }

    const service = getProductService();
    const product = await service.getProductBySlug(slug);

    if (!product) {
      return errorResponse('Product not found', 404);
    }

    return {
      statusCode: 200,
      headers: {
        ...PUBLIC_CACHE_HEADERS,
        ETag: `"product-${product.id}-${product.updated_at}"`,
      },
      body: JSON.stringify(product),
    };
  } catch (error) {
    return handleError(error);
  }
}

/**
 * POST /api/products
 * Create a new product. Requires admin authentication.
 */
export async function createProduct(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const user = requireAuth(event);

    if (!event.body) {
      return errorResponse('Request body is required', 400);
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(event.body);
    } catch {
      return errorResponse('Invalid JSON in request body', 400);
    }

    const validationError = validateCreateProduct(body);
    if (validationError) {
      return errorResponse(validationError, 400);
    }

    const service = getProductService();
    const product = await service.createProduct(body, user.id.toString());

    return successResponse(product, 201);
  } catch (error) {
    return handleError(error);
  }
}

/**
 * PUT /api/products/{id}
 * Update an existing product. Requires admin authentication.
 */
export async function updateProduct(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const user = requireAuth(event);

    const idParam = event.pathParameters?.id;
    if (!idParam) {
      return errorResponse('id is required', 400);
    }
    const id = parseInt(idParam, 10);
    if (isNaN(id) || id <= 0) {
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

    // Prevent updating with empty body
    if (Object.keys(body).length === 0) {
      return errorResponse('At least one field is required for update', 400);
    }

    const service = getProductService();
    const product = await service.updateProduct(id, body, user.id.toString());

    return successResponse(product);
  } catch (error) {
    return handleError(error);
  }
}

/**
 * DELETE /api/products/{id}
 * Delete a product. Requires admin authentication.
 */
export async function deleteProduct(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const user = requireAuth(event);

    const idParam = event.pathParameters?.id;
    if (!idParam) {
      return errorResponse('id is required', 400);
    }
    const id = parseInt(idParam, 10);
    if (isNaN(id) || id <= 0) {
      return errorResponse('id must be a positive integer', 400);
    }

    const service = getProductService();
    await service.deleteProduct(id, user.id.toString());

    return successResponse({ message: 'Product deleted' });
  } catch (error) {
    return handleError(error);
  }
}
