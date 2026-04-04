/**
 * Health Check Lambda Handler
 *
 * Endpoint:
 *   GET /health  -> getHealth  (public)
 *
 * Returns a JSON payload describing the current health of the product service
 * and its downstream dependencies (DynamoDB, S3, memory).
 */

import {
  checkDynamoDB,
  checkS3,
  checkMemory,
  buildHealthReport,
  CheckStatus,
} from '../health-check';
import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  JSON_HEADERS,
} from '../types';

const SERVICE_NAME = 'product-service';
const SERVICE_VERSION = '1.0.0';

/**
 * GET /health
 *
 * Runs health checks for DynamoDB, S3, and memory concurrently (each with a
 * 5-second timeout) and returns a consolidated health report.
 * Always returns HTTP 200. The Route 53 health check is configured with
 * search_string matching `"status":"healthy"` so it can detect degraded or
 * unhealthy states without requiring a non-2xx response.
 */
export async function getHealth(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const tableName = process.env.PRODUCTS_TABLE_NAME || process.env.DYNAMODB_TABLE_NAME || '';
  const bucketName = process.env.S3_BUCKET_NAME ?? '';
  const region = process.env.AWS_REGION_CUSTOM ?? 'us-east-1';

  const [dynamoResult, s3Result, memoryResult] = await Promise.all([
    tableName ? checkDynamoDB(tableName, region) : Promise.resolve({ status: 'unhealthy' as CheckStatus, error: 'PRODUCTS_TABLE_NAME not set' }),
    bucketName ? checkS3(bucketName, region) : Promise.resolve({ status: 'unhealthy' as CheckStatus, error: 'S3_BUCKET_NAME not set' }),
    Promise.resolve(checkMemory()),
  ]);

  const checks: Record<string, CheckStatus> = {
    dynamodb: dynamoResult.status,
    s3: s3Result.status,
    memory: memoryResult.status,
  };

  const report = buildHealthReport(SERVICE_NAME, SERVICE_VERSION, checks);

  return {
    statusCode: 200,
    headers: {
      ...JSON_HEADERS,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
    body: JSON.stringify(report),
  };
}
