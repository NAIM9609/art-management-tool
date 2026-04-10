/**
 * Personaggi Lambda Handlers
 *
 * Endpoints:
 *   GET    /api/personaggi              -> listPersonaggi   (public)
 *   GET    /api/personaggi/{id}         -> getPersonaggio   (public)
 *   POST   /api/personaggi              -> createPersonaggio (admin)
 *   PUT    /api/personaggi/{id}         -> updatePersonaggio (admin)
 *   DELETE /api/personaggi/{id}         -> deletePersonaggio (admin)
 *   POST   /api/personaggi/{id}/upload  -> uploadImage       (admin)
 */

import { DynamoDBOptimized } from '../../../../src/services/dynamodb/DynamoDBOptimized';
import { PersonaggioRepository } from '../../../../src/services/dynamodb/repositories/PersonaggioRepository';
import { S3Service } from '../../../../src/services/s3/S3Service';
import { createHash } from 'crypto';
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

const dynamoDB = new DynamoDBOptimized({
  tableName: process.env.CONTENT_TABLE_NAME || process.env.DYNAMODB_TABLE_NAME,
  region: process.env.AWS_REGION_CUSTOM,
  maxRetries: 3,
  retryDelay: 100,
});

const personaggioRepository = new PersonaggioRepository(dynamoDB);
const s3Service = new S3Service();

function getPersonaggioRepository(): PersonaggioRepository {
  return personaggioRepository;
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

function makeEtag(prefix: string, payload: unknown): string {
  const hash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  return `"${prefix}-${hash}"`;
}

/**
 * GET /api/personaggi
 * List all personaggi sorted by order field.
 */
export async function listPersonaggi(
  _event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const repo = getPersonaggioRepository();
    const personaggi = await repo.findAll(false);
    const responseBody = {
      personaggi,
      total: personaggi.length,
    };

    return {
      statusCode: 200,
      headers: {
        ...LIST_CACHE_HEADERS,
        ETag: makeEtag('personaggi', responseBody),
      },
      body: JSON.stringify(responseBody),
    };
  } catch (error) {
    return handleError(error);
  }
}

/**
 * GET /api/personaggi/{id}
 * Get a single personaggio by ID.
 */
export async function getPersonaggio(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const id = parseId(event.pathParameters?.id);
    if (id === null) {
      return errorResponse('id must be a positive integer', 400);
    }

    const repo = getPersonaggioRepository();
    const personaggio = await repo.findById(id);

    if (!personaggio) {
      return errorResponse('Personaggio not found', 404);
    }

    return {
      statusCode: 200,
      headers: {
        ...ITEM_CACHE_HEADERS,
        ETag: `"personaggio-${personaggio.id}-${personaggio.updated_at}"`,
      },
      body: JSON.stringify(personaggio),
    };
  } catch (error) {
    return handleError(error);
  }
}

/**
 * POST /api/personaggi
 * Create a new personaggio. Requires admin authentication.
 */
export async function createPersonaggio(
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

    if (!body.name || typeof body.name !== 'string' || (body.name as string).trim() === '') {
      return errorResponse('name is required', 400);
    }

    const repo = getPersonaggioRepository();
    const personaggio = await repo.create({
      name: (body.name as string).trim(),
      description: body.description as string | undefined,
      images: Array.isArray(body.images) ? (body.images as string[]) : undefined,
      order: typeof body.order === 'number' ? body.order : undefined,
    });

    return successResponse(personaggio, 201);
  } catch (error) {
    return handleError(error);
  }
}

/**
 * PUT /api/personaggi/{id}
 * Update an existing personaggio. Requires admin authentication.
 */
export async function updatePersonaggio(
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

    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || body.name.trim() === '') {
        return errorResponse('name must be a non-empty string when provided', 400);
      }
    }

    const repo = getPersonaggioRepository();
    const personaggio = await repo.update(id, {
      name: typeof body.name === 'string' ? body.name.trim() : undefined,
      description: body.description as string | undefined,
      images: Array.isArray(body.images) ? (body.images as string[]) : undefined,
      order: typeof body.order === 'number' ? body.order : undefined,
    });

    if (!personaggio) {
      return errorResponse('Personaggio not found', 404);
    }

    return successResponse(personaggio);
  } catch (error) {
    return handleError(error);
  }
}

/**
 * DELETE /api/personaggi/{id}
 * Soft-delete a personaggio. Requires admin authentication.
 */
export async function deletePersonaggio(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    requireAuth(event);

    const id = parseId(event.pathParameters?.id);
    if (id === null) {
      return errorResponse('id must be a positive integer', 400);
    }

    const repo = getPersonaggioRepository();
    const deleted = await repo.softDelete(id);

    if (!deleted) {
      return errorResponse('Personaggio not found', 404);
    }

    return successResponse({ message: 'Personaggio deleted' });
  } catch (error) {
    return handleError(error);
  }
}

/**
 * POST /api/personaggi/{id}/upload
 * Generate a pre-signed S3 upload URL for a personaggio image.
 * Requires admin authentication.
 */
export async function uploadImage(
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

    const repo = getPersonaggioRepository();
    const personaggio = await repo.findById(id);

    if (!personaggio) {
      return errorResponse('Personaggio not found', 404);
    }

    const s3 = getS3Service();
    const result = await s3.generatePresignedUploadUrl(
      `personaggio-${id}`,
      contentType,
      `personaggi/${id}`
    );

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
