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

import { APIGatewayProxyHandler, APIGatewayProxyEventHeaders } from 'aws-lambda';
import { ProductService, ProductFilters, ProductStatus } from '../../../../src/services/ProductService';
import { requireAuth, AuthError } from '../auth';
import { respond } from '../lib/http';

const DEFAULT_PER_PAGE = 20;
const MAX_PER_PAGE = 100;

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
      msg.includes('required')
    ) {
      return respond(400, { message: error.message }, h);
    }
  }
  return respond(500, { message: 'Internal server error' }, h);
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

/** GET /api/products */
export const listProducts: APIGatewayProxyHandler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return respond(204, null, event.headers);
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
    const perPage = Math.min(
      MAX_PER_PAGE,
      Math.max(1, parseInt(qs.per_page || String(DEFAULT_PER_PAGE), 10) || DEFAULT_PER_PAGE),
    );

    const result = await productService.listProducts(filters, page, perPage);
    const base = respond(200, {
      products: result.products,
      total: result.total,
      page,
      per_page: perPage,
    }, event.headers);
    return {
      ...base,
      headers: {
        ...base.headers,
        'Cache-Control': 'public, max-age=300',
        ETag: `"products-${page}-${perPage}-${result.total}"`,
      },
    };
  } catch (error) {
    return handleError(error, event.headers);
  }
};

/** GET /api/products/{slug} */
export const getProduct: APIGatewayProxyHandler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return respond(204, null, event.headers);
  try {
    const slug = event.pathParameters?.slug;
    if (!slug) return respond(400, { message: 'slug is required' }, event.headers);

    const product = await productService.getProductBySlug(slug);
    if (!product) return respond(404, { message: 'Product not found' }, event.headers);

    const base = respond(200, product, event.headers);
    return {
      ...base,
      headers: {
        ...base.headers,
        'Cache-Control': 'public, max-age=300',
        ETag: `"product-${product.id}-${product.updated_at}"`,
      },
    };
  } catch (error) {
    return handleError(error, event.headers);
  }
};

/** POST /api/products */
export const createProduct: APIGatewayProxyHandler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return respond(204, null, event.headers);
  try {
    const user = requireAuth(event);

    if (!event.body) return respond(400, { message: 'Request body is required' }, event.headers);

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(event.body);
    } catch {
      return respond(400, { message: 'Invalid JSON in request body' }, event.headers);
    }

    const validationError = validateCreateProduct(body);
    if (validationError) return respond(400, { message: validationError }, event.headers);

    const product = await productService.createProduct(body, user.id.toString());

    return respond(201, product, event.headers);
  } catch (error) {
    return handleError(error, event.headers);
  }
};

/** PUT /api/products/{id} */
export const updateProduct: APIGatewayProxyHandler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return respond(204, null, event.headers);
  try {
    const user = requireAuth(event);

    const idParam = event.pathParameters?.id;
    if (!idParam) return respond(400, { message: 'id is required' }, event.headers);
    const id = parseInt(idParam, 10);
    if (isNaN(id) || id <= 0) return respond(400, { message: 'id must be a positive integer' }, event.headers);

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

    const product = await productService.updateProduct(id, body, user.id.toString());

    return respond(200, product, event.headers);
  } catch (error) {
    return handleError(error, event.headers);
  }
};

/** DELETE /api/products/{id} */
export const deleteProduct: APIGatewayProxyHandler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return respond(204, null, event.headers);
  try {
    const user = requireAuth(event);

    const idParam = event.pathParameters?.id;
    if (!idParam) return respond(400, { message: 'id is required' }, event.headers);
    const id = parseInt(idParam, 10);
    if (isNaN(id) || id <= 0) return respond(400, { message: 'id must be a positive integer' }, event.headers);

    await productService.deleteProduct(id, user.id.toString());

    return respond(200, { message: 'Product deleted' }, event.headers);
  } catch (error) {
    return handleError(error, event.headers);
  }
};
