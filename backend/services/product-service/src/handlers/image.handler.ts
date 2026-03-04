/**
 * Image Lambda Handlers
 *
 * Endpoints:
 *   GET    /api/products/{id}/upload-url          -> getUploadUrl  (admin)
 *   GET    /api/products/{id}/images              -> listImages    (public)
 *   DELETE /api/products/{id}/images/{imageId}   -> deleteImage   (admin)
 */

import { ProductService } from '../../../../src/services/ProductService';
import { S3Service } from '../../../../src/services/s3/S3Service';
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

function getS3Service(): S3Service {
  return new S3Service();
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

/**
 * GET /api/products/{id}/upload-url
 * Generate a pre-signed S3 upload URL for a product image.
 * Requires admin authentication.
 */
export async function getUploadUrl(
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

    const qs = event.queryStringParameters || {};
    const contentType = qs.content_type || 'image/jpeg';

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/avif'];
    if (!allowedTypes.includes(contentType)) {
      return errorResponse(`content_type must be one of: ${allowedTypes.join(', ')}`, 400);
    }

    const s3Service = getS3Service();
    const result = await s3Service.generatePresignedUploadUrl(
      `product-${productId}`,
      contentType,
      `products/${productId}`
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

/**
 * GET /api/products/{id}/images
 * List all images for a product.
 */
export async function listImages(
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
    const images = await service.listImages(productId);

    return successResponse({ images });
  } catch (error) {
    return handleError(error);
  }
}

/**
 * DELETE /api/products/{id}/images/{imageId}
 * Delete a product image. Requires admin authentication.
 */
export async function deleteImage(
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

    const imageId = event.pathParameters?.imageId;
    if (!imageId) {
      return errorResponse('imageId is required', 400);
    }

    const service = getProductService();
    await service.deleteImage(productId, imageId);

    return successResponse({ message: 'Image deleted' });
  } catch (error) {
    return handleError(error);
  }
}
