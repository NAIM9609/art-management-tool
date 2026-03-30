/**
 * Upload Lambda Handler
 *
 * Endpoints:
 *   POST /api/upload/temp  -> tempUploadPresign  (admin)
 *
 * Returns a pre-signed S3 PUT URL that the browser uses to upload the file
 * directly to S3, together with the final CDN URL that should be stored in
 * the entity payload when the form is saved.
 *
 * This is the production-compatible counterpart to the Docker Express handler
 * at backend/src/handlers/upload.ts (which does the same thing but with the
 * multer-based direct upload because Lambda cannot receive raw multipart bodies
 * at scale).
 */

import { S3Service } from '../../../../src/services/s3/S3Service';
import { requireAuth, AuthError } from '../auth';
import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  ALLOWED_IMAGE_TYPES,
  successResponse,
  errorResponse,
} from '../types';

const s3Service = new S3Service();

function handleError(error: unknown): APIGatewayProxyResult {
  if (error instanceof AuthError) {
    return errorResponse(error.message, error.statusCode);
  }
  if (error instanceof Error) {
    return errorResponse(error.message, 500);
  }
  return errorResponse('Internal server error', 500);
}

/**
 * POST /api/upload/temp
 * Generates a pre-signed S3 PUT URL for a temporary upload slot.
 * No entity ID is required — the returned cdn_url is included in the entity
 * create/update payload when the form is eventually saved.
 *
 * Query parameters:
 *   content_type  – MIME type of the file (default: image/jpeg)
 *   entity        – 'personaggi' | 'fumetti' (determines S3 folder, default: 'uploads')
 */
export async function tempUploadPresign(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    requireAuth(event);

    const qs = event.queryStringParameters || {};
    const contentType = (qs.content_type || 'image/jpeg') as string;

    if (!ALLOWED_IMAGE_TYPES.includes(contentType as typeof ALLOWED_IMAGE_TYPES[number])) {
      return errorResponse(
        `content_type must be one of: ${ALLOWED_IMAGE_TYPES.join(', ')}`,
        400
      );
    }

    const entity = qs.entity || 'uploads';
    const folder = entity === 'fumetti' ? 'uploads/fumetti/temp' : 'uploads/personaggi/temp';

    const result = await s3Service.generatePresignedUploadUrl(
      'temp-upload',
      contentType,
      folder
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
