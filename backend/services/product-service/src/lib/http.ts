import { APIGatewayProxyEventHeaders, APIGatewayProxyResult } from 'aws-lambda';

const CORS_ALLOWED_HEADERS = 'Content-Type,Authorization';
const CORS_ALLOWED_METHODS = 'OPTIONS,GET,POST,PUT,PATCH,DELETE';

const ALLOWED_ORIGINS: string[] = [
  'http://localhost:3000',
  'http://localhost:5173',
];

const ALLOWED_ORIGIN_PATTERNS: RegExp[] = [
  /^https:\/\/[\w-]+\.yourdomain\.com$/,
];

function getCorsOrigin(requestHeaders: APIGatewayProxyEventHeaders | undefined): string {
  const origin = requestHeaders?.origin ?? requestHeaders?.Origin ?? '';
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  if (ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(origin))) return origin;
  return ALLOWED_ORIGINS[0];
}

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
