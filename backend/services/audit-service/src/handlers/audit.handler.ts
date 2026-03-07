/**
 * Audit Service Lambda Handlers
 *
 * Endpoints (all require admin authentication):
 *   GET  /api/admin/audit/entity/{type}/{id}  -> getEntityHistory
 *   GET  /api/admin/audit/user/{userId}        -> getUserActivity
 *   GET  /api/admin/audit/date-range           -> getActivityByDate
 *
 * Query parameters for pagination:
 *   perPage           - number of items per page (default: 30)
 *   lastEvaluatedKey  - JSON-encoded pagination cursor from previous response
 *
 * Query parameters for getActivityByDate:
 *   startDate  - ISO 8601 date string (required)
 *   endDate    - ISO 8601 date string (required)
 */

import { AuditService } from '../../../../src/services/AuditService';
import { AuthError, requireAuth } from '../auth';
import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  errorResponse,
  successResponse,
} from '../types';

const DEFAULT_PER_PAGE = 30;

let auditService: AuditService | null = null;

function getAuditService(): AuditService {
  if (!auditService) {
    auditService = new AuditService();
  }
  return auditService;
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
      message.includes('invalid') ||
      message.includes('required') ||
      message.includes('must be') ||
      message.includes('exceeds')
    ) {
      return errorResponse(error.message, 400);
    }
  }
  return errorResponse('Internal server error', 500);
}

/**
 * Parse and validate the perPage query parameter.
 * Returns the parsed value, or an error response string if invalid.
 */
function parsePerPage(raw: string | undefined): number | APIGatewayProxyResult {
  if (raw === undefined) {
    return DEFAULT_PER_PAGE;
  }
  if (!/^\d+$/.test(raw)) {
    return errorResponse('perPage must be a positive integer', 400);
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return errorResponse('perPage must be a positive integer', 400);
  }
  return parsed;
}

/**
 * Parse and validate the lastEvaluatedKey query parameter.
 * Returns the parsed object, or an error response if invalid.
 */
function parseLastEvaluatedKey(
  raw: string | undefined
): Record<string, unknown> | undefined | APIGatewayProxyResult {
  if (!raw) {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return errorResponse('Invalid lastEvaluatedKey: must be a valid JSON string', 400);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return errorResponse('Invalid lastEvaluatedKey: must be a JSON object', 400);
  }
  return parsed as Record<string, unknown>;
}

/**
 * Type guard to check if a value is an error response returned by a parse helper.
 */
function isErrorResponse(val: unknown): val is APIGatewayProxyResult {
  return typeof val === 'object' && val !== null && 'statusCode' in val && 'body' in val;
}

// ─────────────────────────────────────────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/audit/entity/{type}/{id}
 * Retrieve the full audit history for a specific entity.
 *
 * Path parameters:
 *   type  - entity type (e.g. "product", "order")
 *   id    - entity ID
 *
 * Query parameters:
 *   perPage           - page size (default: 30)
 *   lastEvaluatedKey  - JSON-encoded pagination cursor
 */
export async function getEntityHistory(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    requireAuth(event);

    const entityType = event.pathParameters?.type;
    const entityId = event.pathParameters?.id;

    if (!entityType) {
      return errorResponse('type is required', 400);
    }
    if (!entityId) {
      return errorResponse('id is required', 400);
    }

    const query = event.queryStringParameters || {};

    const perPageResult = parsePerPage(query.perPage);
    if (typeof perPageResult !== 'number') {
      return perPageResult;
    }

    const lastKeyResult = parseLastEvaluatedKey(query.lastEvaluatedKey);
    if (isErrorResponse(lastKeyResult)) {
      return lastKeyResult;
    }

    const service = getAuditService();
    const result = await service.getEntityHistory(entityType, entityId, {
      limit: perPageResult,
      lastEvaluatedKey: lastKeyResult,
    });

    return successResponse({
      logs: result.items,
      count: result.count,
      lastEvaluatedKey: result.lastEvaluatedKey,
    });
  } catch (error) {
    return handleError(error);
  }
}

/**
 * GET /api/admin/audit/user/{userId}
 * Retrieve the audit activity for a specific user.
 *
 * Path parameters:
 *   userId  - user ID
 *
 * Query parameters:
 *   perPage           - page size (default: 30)
 *   lastEvaluatedKey  - JSON-encoded pagination cursor
 */
export async function getUserActivity(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    requireAuth(event);

    const userId = event.pathParameters?.userId;
    if (!userId) {
      return errorResponse('userId is required', 400);
    }

    const query = event.queryStringParameters || {};

    const perPageResult = parsePerPage(query.perPage);
    if (typeof perPageResult !== 'number') {
      return perPageResult;
    }

    const lastKeyResult = parseLastEvaluatedKey(query.lastEvaluatedKey);
    if (isErrorResponse(lastKeyResult)) {
      return lastKeyResult;
    }

    const service = getAuditService();
    const result = await service.getUserActivity(userId, {
      limit: perPageResult,
      lastEvaluatedKey: lastKeyResult,
    });

    return successResponse({
      logs: result.items,
      count: result.count,
      lastEvaluatedKey: result.lastEvaluatedKey,
    });
  } catch (error) {
    return handleError(error);
  }
}

/**
 * GET /api/admin/audit/date-range
 * Retrieve audit logs within a date range.
 *
 * Query parameters:
 *   startDate         - ISO 8601 date (required)
 *   endDate           - ISO 8601 date (required)
 *   perPage           - page size (default: 30)
 *   lastEvaluatedKey  - JSON-encoded pagination cursor
 */
export async function getActivityByDate(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    requireAuth(event);

    const query = event.queryStringParameters || {};

    const { startDate, endDate } = query;
    if (!startDate) {
      return errorResponse('startDate is required', 400);
    }
    if (!endDate) {
      return errorResponse('endDate is required', 400);
    }

    const perPageResult = parsePerPage(query.perPage);
    if (typeof perPageResult !== 'number') {
      return perPageResult;
    }

    const lastKeyResult = parseLastEvaluatedKey(query.lastEvaluatedKey);
    if (isErrorResponse(lastKeyResult)) {
      return lastKeyResult;
    }

    const service = getAuditService();
    const result = await service.getActivityByDateRange(startDate, endDate, {
      limit: perPageResult,
      lastEvaluatedKey: lastKeyResult,
    });

    return successResponse({
      logs: result.items,
      count: result.count,
      lastEvaluatedKey: result.lastEvaluatedKey,
    });
  } catch (error) {
    return handleError(error);
  }
}
