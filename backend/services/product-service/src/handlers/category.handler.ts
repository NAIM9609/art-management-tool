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

import { DynamoDBOptimized } from '../../../../src/services/dynamodb/DynamoDBOptimized';
import { CategoryRepository } from '../../../../src/services/dynamodb/repositories/CategoryRepository';
import { requireAuth, AuthError } from '../auth';
import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  PUBLIC_CACHE_HEADERS,
  successResponse,
  errorResponse,
} from '../types';

const DEFAULT_CATEGORY_LIMIT = 50;
const MAX_CATEGORY_LIMIT = 100;

const dynamoDB = new DynamoDBOptimized({
  tableName: process.env.PRODUCTS_TABLE_NAME || process.env.DYNAMODB_TABLE_NAME,
  region: process.env.AWS_REGION_CUSTOM,
  maxRetries: 3,
  retryDelay: 100,
});

const categoryRepository = new CategoryRepository(dynamoDB);

function getCategoryRepository(): CategoryRepository {
  return categoryRepository;
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
      message.includes('required') ||
      message.includes('already exists') ||
      message.includes('circular') ||
      message.includes('does not exist') ||
      message.includes('deleted')
    ) {
      return errorResponse(error.message, 400);
    }
  }
  return errorResponse('Internal server error', 500);
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

/**
 * GET /api/categories
 * List all root categories.
 */
export async function listCategories(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const qs = event.queryStringParameters || {};
    const limit = Math.min(MAX_CATEGORY_LIMIT, Math.max(1, parseInt(qs.limit || String(DEFAULT_CATEGORY_LIMIT), 10) || DEFAULT_CATEGORY_LIMIT));
    let lastEvaluatedKey: Record<string, unknown> | undefined;

    if (qs.last_key) {
      try {
        lastEvaluatedKey = JSON.parse(qs.last_key) as Record<string, unknown>;
      } catch {
        return errorResponse('last_key must be a valid JSON object', 400);
      }
    }

    const repo = getCategoryRepository();
    const result = await repo.findAll({ limit, lastEvaluatedKey });

    return {
      statusCode: 200,
      headers: {
        ...PUBLIC_CACHE_HEADERS,
        ETag: `"categories-${result.items.length}"`,
      },
      body: JSON.stringify({
        categories: result.items,
        total: result.items.length,
        lastEvaluatedKey: result.lastEvaluatedKey,
      }),
    };
  } catch (error) {
    return handleError(error);
  }
}

/**
 * GET /api/categories/{slug}
 * Get a single category by slug.
 */
export async function getCategory(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const slug = event.pathParameters?.slug;
    if (!slug) {
      return errorResponse('slug is required', 400);
    }

    const repo = getCategoryRepository();
    const category = await repo.findBySlug(slug);

    if (!category) {
      return errorResponse('Category not found', 404);
    }

    return {
      statusCode: 200,
      headers: {
        ...PUBLIC_CACHE_HEADERS,
        ETag: `"category-${category.id}-${category.updated_at}"`,
      },
      body: JSON.stringify(category),
    };
  } catch (error) {
    return handleError(error);
  }
}

/**
 * POST /api/categories
 * Create a new category. Requires admin authentication.
 */
export async function createCategory(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    requireAuth(event);

    if (!event.body) {
      return errorResponse('Request body is required', 400);
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(event.body);
    } catch {
      return errorResponse('Invalid JSON in request body', 400);
    }

    const validationError = validateCreateCategory(body);
    if (validationError) {
      return errorResponse(validationError, 400);
    }

    const repo = getCategoryRepository();
    const category = await repo.create({
      name: body.name as string,
      slug: body.slug as string,
      description: body.description as string | undefined,
      parent_id: body.parent_id as number | undefined,
    });

    return successResponse(category, 201);
  } catch (error) {
    return handleError(error);
  }
}

/**
 * PUT /api/categories/{id}
 * Update a category. Requires admin authentication.
 */
export async function updateCategory(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    requireAuth(event);

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

    if (Object.keys(body).length === 0) {
      return errorResponse('At least one field is required for update', 400);
    }

    // Validate slug format if provided
    if (body.slug !== undefined) {
      if (typeof body.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.slug)) {
        return errorResponse('slug must contain only lowercase letters, numbers, and hyphens', 400);
      }
    }

    const repo = getCategoryRepository();
    const category = await repo.update(id, {
      name: body.name as string | undefined,
      slug: body.slug as string | undefined,
      description: body.description as string | undefined,
      parent_id: body.parent_id as number | undefined,
    });

    if (!category) {
      return errorResponse('Category not found', 404);
    }

    return successResponse(category);
  } catch (error) {
    return handleError(error);
  }
}

/**
 * DELETE /api/categories/{id}
 * Soft-delete a category. Requires admin authentication.
 */
export async function deleteCategory(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    requireAuth(event);

    const idParam = event.pathParameters?.id;
    if (!idParam) {
      return errorResponse('id is required', 400);
    }
    const id = parseInt(idParam, 10);
    if (isNaN(id) || id <= 0) {
      return errorResponse('id must be a positive integer', 400);
    }

    const repo = getCategoryRepository();
    const deleted = await repo.softDelete(id);

    if (!deleted) {
      return errorResponse('Category not found', 404);
    }

    return successResponse({ message: 'Category deleted' });
  } catch (error) {
    return handleError(error);
  }
}
