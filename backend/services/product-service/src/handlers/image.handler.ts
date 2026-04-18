/**
 * Image Lambda Handlers
 *
 * Endpoints:
 *   GET    /api/products/{id}/upload-url          -> getUploadUrl  (admin)
 *   GET    /api/products/{id}/images              -> listImages    (public)
 *   DELETE /api/products/{id}/images/{imageId}   -> deleteImage   (admin)
 */

import { APIGatewayProxyResult, APIGatewayProxyEvent } from '../types';
import { ProductService } from '../../../../src/services/ProductService';
import { S3Service } from '../../../../src/services/s3/S3Service';
import { requireAuth, AuthError } from '../auth';
import { respond } from '../lib/http';

const productService = new ProductService();
const s3Service = new S3Service();

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
      msg.includes('required')
    ) {
      return respond(400, { error: error.message }, h);
    }
  }
  return respond(500, { error: 'Internal server error' }, h);
}

/** GET /api/products/{id}/upload-url */
export const getUploadUrl = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  if (event.httpMethod === 'OPTIONS') return respond(204, null, event.headers);
  try {
    requireAuth(event);

    const idParam = event.pathParameters?.id;
    if (!idParam) return respond(400, { error: 'id is required' }, event.headers);
    const productId = parseInt(idParam, 10);
    if (isNaN(productId) || productId <= 0) {
      return respond(400, { error: 'id must be a positive integer' }, event.headers);
    }

    const qs = event.queryStringParameters || {};
    const contentType = qs.content_type || 'image/jpeg';
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/avif'];
    if (!allowedTypes.includes(contentType)) {
      return respond(400, { error: `content_type must be one of: ${allowedTypes.join(', ')}` }, event.headers);
    }

    const result = await s3Service.generatePresignedUploadUrl(
      `product-${productId}`,
      contentType,
      `products/${productId}`,
    );

    return respond(200, {
      upload_url: result.uploadUrl,
      cdn_url: result.cdnUrl,
      key: result.key,
      expires_in: 300,
    }, event.headers);
  } catch (error) {
    return handleError(error, event.headers);
  }
};

/** GET /api/products/{id}/images */
export const listImages = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  if (event.httpMethod === 'OPTIONS') return respond(204, null, event.headers);
  try {
    const idParam = event.pathParameters?.id;
    if (!idParam) return respond(400, { error: 'id is required' }, event.headers);
    const productId = parseInt(idParam, 10);
    if (isNaN(productId) || productId <= 0) {
      return respond(400, { error: 'id must be a positive integer' }, event.headers);
    }

    const images = await productService.listImages(productId);

    return respond(200, { images }, event.headers);
  } catch (error) {
    return handleError(error, event.headers);
  }
};

/** DELETE /api/products/{id}/images/{imageId} */
export const deleteImage = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  if (event.httpMethod === 'OPTIONS') return respond(204, null, event.headers);
  try {
    requireAuth(event);

    const idParam = event.pathParameters?.id;
    if (!idParam) return respond(400, { error: 'id is required' }, event.headers);
    const productId = parseInt(idParam, 10);
    if (isNaN(productId) || productId <= 0) {
      return respond(400, { error: 'id must be a positive integer' }, event.headers);
    }

    const imageId = event.pathParameters?.imageId;
    if (!imageId) return respond(400, { error: 'imageId is required' }, event.headers);

    await productService.deleteImage(productId, imageId);

    return respond(200, { message: 'Image deleted' }, event.headers);
  } catch (error) {
    return handleError(error, event.headers);
  }
};
