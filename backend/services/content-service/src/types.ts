/**
 * Lambda handler type definitions for API Gateway Proxy integration
 */

export interface APIGatewayProxyEvent {
  httpMethod: string;
  path: string;
  pathParameters?: Record<string, string> | null;
  queryStringParameters?: Record<string, string> | null;
  multiValueQueryStringParameters?: Record<string, string[]> | null;
  headers?: Record<string, string> | null;
  body?: string | null;
  isBase64Encoded?: boolean;
  requestContext?: {
    requestId?: string;
    [key: string]: unknown;
  };
}

export interface APIGatewayProxyResult {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
}

export interface JWTPayload {
  id: number;
  username: string;
  iat?: number;
  exp?: number;
}

export const JSON_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
};

/** Cache headers for list endpoints: 1 hour */
export const LIST_CACHE_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'Cache-Control': 'public, max-age=3600',
};

/** Cache headers for individual item endpoints: 1 day */
export const ITEM_CACHE_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'Cache-Control': 'public, max-age=86400',
};

/** Allowed MIME types for image uploads */
export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/avif',
] as const;

export function successResponse(
  data: unknown,
  statusCode = 200,
  extraHeaders: Record<string, string> = {}
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { ...JSON_HEADERS, ...extraHeaders },
    body: JSON.stringify(data),
  };
}

export function errorResponse(
  message: string,
  statusCode: number,
  extraHeaders: Record<string, string> = {}
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { ...JSON_HEADERS, ...extraHeaders },
    body: JSON.stringify({ error: message }),
  };
}
