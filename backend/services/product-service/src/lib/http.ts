import { APIGatewayProxyEventHeaders, APIGatewayProxyResult } from 'aws-lambda';

const CORS_ALLOWED_HEADERS = 'Content-Type,Authorization';
const CORS_ALLOWED_METHODS = 'OPTIONS,GET,POST,PUT,PATCH,DELETE';

/**
 * Exact origins allowed. Add your frontend URLs here.
 * In production, also populate via env var: CORS_ALLOWED_ORIGINS (comma-separated).
 */
const ALLOWED_ORIGINS: string[] = [
  'http://localhost:3000',
  'http://localhost:5173',
  ...(process.env.CORS_ALLOWED_ORIGINS?.split(',').map((o) => o.trim()) ?? []),
];

/**
 * Regex patterns for dynamic sub-domains (e.g. Amplify preview URLs).
 * Add entries here as needed, e.g. /^https:\/\/[\w-]+\.yourdomain\.com$/
 */
const ALLOWED_ORIGIN_PATTERNS: RegExp[] = [];

function getCorsOrigin(
  requestHeaders: APIGatewayProxyEventHeaders | undefined,
): string {
  const origin = requestHeaders?.origin ?? requestHeaders?.Origin ?? '';
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  if (ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(origin))) return origin;
  // Fall back to the first listed origin so the header is always present.
  return ALLOWED_ORIGINS[0];
}

/**
 * Build a Lambda proxy response with CORS headers.
 *
 * @param statusCode     - HTTP status code
 * @param body           - Response body (serialised to JSON). Pass `null` for no body (e.g. 204).
 * @param requestHeaders - The incoming event headers used to echo back the
 *                         correct `Access-Control-Allow-Origin`.
 */
export function respond(
  statusCode: number,
  body: unknown,
  requestHeaders?: APIGatewayProxyEventHeaders,
): APIGatewayProxyResult {
  const corsOrigin = getCorsOrigin(requestHeaders);
  return {
    statusCode,
    headers: {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Headers': CORS_ALLOWED_HEADERS,
      'Access-Control-Allow-Methods': CORS_ALLOWED_METHODS,
      'Access-Control-Allow-Credentials': 'true',
      'Content-Type': 'application/json',
    },
    body: body !== null ? JSON.stringify(body) : '',
  };
}
