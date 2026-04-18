/**
 * Category Lambda Handlers
 *
 * Endpoints:
 *   GET    /api/categories          -> listCategories  (public)
 *   GET    /api/categories/{slug}   -> getCategory     (public)
 *   POST   /api/categories          -> createCategory  (admin)
 *   PUT    /api/categories/{id}     -> updateCategory  (admin)
 *   DELETE /api/categories/{id}     -> deleteCategory  (admin)
 */

import { APIGatewayProxyResult, APIGatewayProxyEvent } from '../types';
import { DynamoDBOptimized } from '../../../../src/services/dynamodb/DynamoDBOptimized';
import { CategoryRepository } from '../../../../src/services/dynamodb/repositories/CategoryRepository';
import { requireAuth, AuthError } from '../auth';
import { respond } from '../lib/http';

const DEFAULT_CATEGORY_LIMIT = 50;
const MAX_CATEGORY_LIMIT = 100;

const dynamoDB = new DynamoDBOptimized({
  tableName: process.env.PRODUCTS_TABLE_NAME || process.env.DYNAMODB_TABLE_NAME,
  region: process.env.AWS_REGION_CUSTOM,
  maxRetries: 3,
  retryDelay: 100,
});

const categoryRepository = new CategoryRepository(dynamoDB);

function handleError(error: unknown, h: APIGatewayProxyEvent['headers']) {
  if (error instanceof AuthError) {
    return respond(error.statusCode, { error: error.message }, h);
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('not found')) return respond(404, { error: error.message }, h);
    if (
      msg.includes('validation') ||
      msg.includes('invalid') ||
      msg.includes('required') ||
      msg.includes('already exists') ||
      msg.includes('circular') ||
      msg.includes('does not exist') ||
      msg.includes('deleted')
    ) {
      return respond(400, { error: error.message }, h);
    }
  }
  return respond(500, { error: 'Internal server error' }, h);
}

function validateCreateCategory(body: Record<string, unknown>): string | null {
  if (!body.name || typeof body.name !== 'string' || body.name.trim() === '') {
    return 'name is required';
  }
  if (!body.slug || typeof body.slug !== 'string' || body.slug.trim() === '') {
    return 'slug is required';
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.slug as string)) {
    return 'slug must contain only lowercase letters, numbers, and hyphens';
  }
  return null;
}

/** GET /api/categories */
export const listCategories = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  if (event.httpMethod === 'OPTIONS') return respond(204, null, event.headers);
  try {
    const qs = event.queryStringParameters || {};
    const limit = Math.min(
      MAX_CATEGORY_LIMIT,
      Math.max(1, parseInt(qs.limit || String(DEFAULT_CATEGORY_LIMIT), 10) || DEFAULT_CATEGORY_LIMIT),
    );
    let lastEvaluatedKey: Record<string, unknown> | undefined;
    if (qs.last_key) {
      try {
        lastEvaluatedKey = JSON.parse(qs.last_key) as Record<string, unknown>;
      } catch {
        return respond(400, { error: 'last_key must be a valid JSON object' }, event.headers);
      }
    }

    const result = await categoryRepository.findAll({ limit, lastEvaluatedKey });
    const base = respond(200, {
      categories: result.items,
      total: result.items.length,
      lastEvaluatedKey: result.lastEvaluatedKey,
    }, event.headers);
    return {
      ...base,
      headers: {
        ...base.headers,
        'Cache-Control': 'public, max-age=300',
        ETag: `"categories-${result.items.length}"`,
      },
    };
  } catch (error) {
    return handleError(error, event.headers);
  }
};

/** GET /api/categories/{slug} */
export const getCategory = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  if (event.httpMethod === 'OPTIONS') return respond(204, null, event.headers);
  try {
    const slug = event.pathParameters?.slug;
    if (!slug) return respond(400, { error: 'slug is required' }, event.headers);

    const category = await categoryRepository.findBySlug(slug);
    if (!category) return respond(404, { error: 'Category not found' }, event.headers);

    const base = respond(200, category, event.headers);
    return {
      ...base,
      headers: {
        ...base.headers,
        'Cache-Control': 'public, max-age=300',
        ETag: `"category-${category.id}-${category.updated_at}"`,
      },
    };
  } catch (error) {
    return handleError(error, event.headers);
  }
};

/** POST /api/categories */
export const createCategory = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  if (event.httpMethod === 'OPTIONS') return respond(204, null, event.headers);
  try {
    requireAuth(event);

    if (!event.body) return respond(400, { error: 'Request body is required' }, event.headers);

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(event.body);
    } catch {
      return respond(400, { error: 'Invalid JSON in request body' }, event.headers);
    }

    const validationError = validateCreateCategory(body);
    if (validationError) return respond(400, { error: validationError }, event.headers);

    const category = await categoryRepository.create({
      name: body.name as string,
      slug: body.slug as string,
      description: body.description as string | undefined,
      parent_id: body.parent_id as number | undefined,
    });

    return respond(201, category, event.headers);
  } catch (error) {
    return handleError(error, event.headers);
  }
};

/** PUT /api/categories/{id} */
export const updateCategory = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  if (event.httpMethod === 'OPTIONS') return respond(204, null, event.headers);
  try {
    requireAuth(event);

    const idParam = event.pathParameters?.id;
    if (!idParam) return respond(400, { error: 'id is required' }, event.headers);
    const id = parseInt(idParam, 10);
    if (isNaN(id) || id <= 0) return respond(400, { error: 'id must be a positive integer' }, event.headers);

    if (!event.body) return respond(400, { error: 'Request body is required' }, event.headers);

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(event.body);
    } catch {
      return respond(400, { error: 'Invalid JSON in request body' }, event.headers);
    }

    if (Object.keys(body).length === 0) {
      return respond(400, { error: 'At least one field is required for update' }, event.headers);
    }

    if (body.slug !== undefined) {
      if (typeof body.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.slug)) {
        return respond(400, { error: 'slug must contain only lowercase letters, numbers, and hyphens' }, event.headers);
      }
    }

    const category = await categoryRepository.update(id, {
      name: body.name as string | undefined,
      slug: body.slug as string | undefined,
      description: body.description as string | undefined,
      parent_id: body.parent_id as number | undefined,
    });

    if (!category) return respond(404, { error: 'Category not found' }, event.headers);

    return respond(200, category, event.headers);
  } catch (error) {
    return handleError(error, event.headers);
  }
};

/** DELETE /api/categories/{id} */
export const deleteCategory = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  if (event.httpMethod === 'OPTIONS') return respond(204, null, event.headers);
  try {
    requireAuth(event);

    const idParam = event.pathParameters?.id;
    if (!idParam) return respond(400, { error: 'id is required' }, event.headers);
    const id = parseInt(idParam, 10);
    if (isNaN(id) || id <= 0) return respond(400, { error: 'id must be a positive integer' }, event.headers);

    const deleted = await categoryRepository.softDelete(id);
    if (!deleted) return respond(404, { error: 'Category not found' }, event.headers);

    return respond(200, { message: 'Category deleted' }, event.headers);
  } catch (error) {
    return handleError(error, event.headers);
  }
};
