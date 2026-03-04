/**
 * Fumetti Lambda Handlers
 *
 * Endpoints:
 *   GET    /api/fumetti              -> listFumetti   (public)
 *   GET    /api/fumetti/{id}         -> getFumetto    (public)
 *   POST   /api/fumetti              -> createFumetto (admin)
 *   PUT    /api/fumetti/{id}         -> updateFumetto (admin)
 *   DELETE /api/fumetti/{id}         -> deleteFumetto (admin)
 *   POST   /api/fumetti/{id}/upload  -> uploadPage    (admin)
 */

import { DynamoDBOptimized } from '../../../../src/services/dynamodb/DynamoDBOptimized';
import { FumettoRepository } from '../../../../src/services/dynamodb/repositories/FumettoRepository';
import { S3Service } from '../../../../src/services/s3/S3Service';
import { requireAuth, AuthError } from '../auth';
import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  LIST_CACHE_HEADERS,
  ITEM_CACHE_HEADERS,
  ALLOWED_IMAGE_TYPES,
  successResponse,
  errorResponse,
} from '../types';

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

const dynamoDB = new DynamoDBOptimized({
  tableName: process.env.DYNAMODB_TABLE_NAME,
  region: process.env.AWS_REGION || 'us-east-1',
  maxRetries: 3,
  retryDelay: 100,
});

const fumettoRepository = new FumettoRepository(dynamoDB);
const s3Service = new S3Service();

function getFumettoRepository(): FumettoRepository {
  return fumettoRepository;
}

function getS3Service(): S3Service {
  return s3Service;
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

function parseId(idParam: string | undefined): number | null {
  if (!idParam) return null;
  const id = parseInt(idParam, 10);
  if (isNaN(id) || id <= 0) return null;
  return id;
}

/**
 * GET /api/fumetti
 * List fumetti sorted by order field with optional pagination.
 */
export async function listFumetti(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const qs = event.queryStringParameters || {};
    const rawLimit = parseInt(qs.limit || String(DEFAULT_LIMIT), 10);
    const limit = Math.min(MAX_LIMIT, Math.max(1, isNaN(rawLimit) ? DEFAULT_LIMIT : rawLimit));
    let lastEvaluatedKey: Record<string, unknown> | undefined;

    if (qs.last_key) {
      try {
        lastEvaluatedKey = JSON.parse(qs.last_key) as Record<string, unknown>;
      } catch {
        return errorResponse('last_key must be a valid JSON object', 400);
      }
    }

    const repo = getFumettoRepository();
    const result = await repo.findAll({ limit, lastEvaluatedKey });

    return {
      statusCode: 200,
      headers: {
        ...LIST_CACHE_HEADERS,
        ETag: `"fumetti-${result.count}"`,
      },
      body: JSON.stringify({
        fumetti: result.items,
        total: result.count,
        lastEvaluatedKey: result.lastEvaluatedKey,
      }),
    };
  } catch (error) {
    return handleError(error);
  }
}

/**
 * GET /api/fumetti/{id}
 * Get a single fumetto by ID.
 */
export async function getFumetto(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const id = parseId(event.pathParameters?.id);
    if (id === null) {
      return errorResponse('id must be a positive integer', 400);
    }

    const repo = getFumettoRepository();
    const fumetto = await repo.findById(id);

    if (!fumetto) {
      return errorResponse('Fumetto not found', 404);
    }

    return {
      statusCode: 200,
      headers: {
        ...ITEM_CACHE_HEADERS,
        ETag: `"fumetto-${fumetto.id}-${fumetto.updated_at}"`,
      },
      body: JSON.stringify(fumetto),
    };
  } catch (error) {
    return handleError(error);
  }
}

/**
 * POST /api/fumetti
 * Create a new fumetto. Requires admin authentication.
 */
export async function createFumetto(
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

    if (!body.title || typeof body.title !== 'string' || (body.title as string).trim() === '') {
      return errorResponse('title is required', 400);
    }

    const repo = getFumettoRepository();
    const fumetto = await repo.create({
      title: (body.title as string).trim(),
      description: body.description as string | undefined,
      coverImage: body.coverImage as string | undefined,
      pages: Array.isArray(body.pages) ? (body.pages as string[]) : undefined,
      order: typeof body.order === 'number' ? body.order : undefined,
    });

    return successResponse(fumetto, 201);
  } catch (error) {
    return handleError(error);
  }
}

/**
 * PUT /api/fumetti/{id}
 * Update an existing fumetto. Requires admin authentication.
 */
export async function updateFumetto(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    requireAuth(event);

    const id = parseId(event.pathParameters?.id);
    if (id === null) {
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

    const repo = getFumettoRepository();
    const fumetto = await repo.update(id, {
      title: body.title as string | undefined,
      description: body.description as string | undefined,
      coverImage: body.coverImage as string | undefined,
      pages: Array.isArray(body.pages) ? (body.pages as string[]) : undefined,
      order: typeof body.order === 'number' ? body.order : undefined,
    });

    if (!fumetto) {
      return errorResponse('Fumetto not found', 404);
    }

    return successResponse(fumetto);
  } catch (error) {
    return handleError(error);
  }
}

/**
 * DELETE /api/fumetti/{id}
 * Soft-delete a fumetto. Requires admin authentication.
 */
export async function deleteFumetto(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    requireAuth(event);

    const id = parseId(event.pathParameters?.id);
    if (id === null) {
      return errorResponse('id must be a positive integer', 400);
    }

    const repo = getFumettoRepository();
    const deleted = await repo.softDelete(id);

    if (!deleted) {
      return errorResponse('Fumetto not found', 404);
    }

    return successResponse({ message: 'Fumetto deleted' });
  } catch (error) {
    return handleError(error);
  }
}

/**
 * POST /api/fumetti/{id}/upload
 * Generate a pre-signed S3 upload URL for a fumetto page.
 * Stores the CDN URL in DynamoDB by appending it to the fumetto's pages array.
 * Requires admin authentication.
 */
export async function uploadPage(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    requireAuth(event);

    const id = parseId(event.pathParameters?.id);
    if (id === null) {
      return errorResponse('id must be a positive integer', 400);
    }

    const qs = event.queryStringParameters || {};
    const contentType = qs.content_type || 'image/jpeg';

    if (!ALLOWED_IMAGE_TYPES.includes(contentType as typeof ALLOWED_IMAGE_TYPES[number])) {
      return errorResponse(`content_type must be one of: ${ALLOWED_IMAGE_TYPES.join(', ')}`, 400);
    }

    const repo = getFumettoRepository();
    const fumetto = await repo.findById(id);

    if (!fumetto) {
      return errorResponse('Fumetto not found', 404);
    }

    const s3 = getS3Service();
    const result = await s3.generatePresignedUploadUrl(
      `fumetto-${id}`,
      contentType,
      `fumetti/${id}`
    );

    // Store CDN URL in DynamoDB by appending to pages array
    const updatedPages = [...(fumetto.pages || []), result.cdnUrl];
    await repo.update(id, { pages: updatedPages });

    return successResponse({
      upload_url: result.uploadUrl,
      cdn_url: result.cdnUrl,
      key: result.key,
      expires_in: 300,
    });
  } catch (error) {
    return handleError(error);
  }
}
