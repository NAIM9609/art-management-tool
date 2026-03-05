/**
 * Notification Service Lambda Handlers
 *
 * Endpoints (all require admin authentication):
 *   GET    /api/admin/notifications                  -> listNotifications
 *   PATCH  /api/admin/notifications/{id}/read        -> markAsRead
 *   POST   /api/admin/notifications/mark-all-read    -> markAllAsRead
 *   DELETE /api/admin/notifications/{id}             -> deleteNotification
 *
 * Query filters for listNotifications:
 *   unreadOnly: boolean          - return only unread notifications
 *   type: NotificationType       - filter by notification type
 *   perPage: number              - page size (default 20)
 *   lastEvaluatedKey: string     - cursor for next page (JSON-encoded)
 */

import { NotificationService } from '../../../../src/services/NotificationService';
import { NotificationType } from '../../../../src/services/dynamodb/repositories/types';
import { AuthError, requireAuth } from '../auth';
import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  errorResponse,
  successResponse,
} from '../types';

let notificationService: NotificationService | null = null;

function getNotificationService(): NotificationService {
  if (!notificationService) {
    notificationService = new NotificationService();
  }
  return notificationService;
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
      message.includes('required')
    ) {
      return errorResponse(error.message, 400);
    }
  }
  return errorResponse('Internal server error', 500);
}

// ─────────────────────────────────────────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/notifications
 * List notifications with optional filters and cursor-based pagination.
 *
 * Query parameters:
 *   unreadOnly        - "true" to return only unread notifications
 *   type              - filter by NotificationType value
 *   perPage           - number of items per page (default: 20)
 *   lastEvaluatedKey  - JSON-encoded pagination cursor from previous response
 */
export async function listNotifications(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    requireAuth(event);

    const query = event.queryStringParameters || {};

    const unreadOnly = query.unreadOnly === 'true';
    const typeFilter = query.type as NotificationType | undefined;
    let perPage = 20;
    if (query.perPage !== undefined) {
      const parsed = parseInt(query.perPage, 10);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        return errorResponse('perPage must be a positive integer', 400);
      }
      perPage = parsed;
    }

    let lastEvaluatedKey: Record<string, unknown> | undefined;
    if (query.lastEvaluatedKey) {
      try {
        lastEvaluatedKey = JSON.parse(query.lastEvaluatedKey) as Record<string, unknown>;
      } catch {
        return errorResponse('Invalid lastEvaluatedKey: must be a valid JSON string', 400);
      }
    }

    const service = getNotificationService();
    const result = await service.getNotifications(unreadOnly, lastEvaluatedKey, perPage);

    let notifications = result.notifications;

    // Apply type filter in memory (NotificationRepository doesn't support type filtering)
    if (typeFilter) {
      notifications = notifications.filter(n => n.type === typeFilter);
    }

    return successResponse({
      notifications,
      count: notifications.length,
      lastEvaluatedKey: result.lastEvaluatedKey,
    });
  } catch (error) {
    return handleError(error);
  }
}

/**
 * PATCH /api/admin/notifications/{id}/read
 * Mark a single notification as read.
 */
export async function markAsRead(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    requireAuth(event);

    const id = event.pathParameters?.id;
    if (!id) {
      return errorResponse('id is required', 400);
    }

    const service = getNotificationService();
    const notification = await service.markAsRead(id);

    if (!notification) {
      return errorResponse('Notification not found', 404);
    }

    return successResponse({ notification });
  } catch (error) {
    return handleError(error);
  }
}

/**
 * POST /api/admin/notifications/mark-all-read
 * Mark all unread notifications as read.
 */
export async function markAllAsRead(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    requireAuth(event);

    const service = getNotificationService();
    await service.markAllAsRead();

    return successResponse({ message: 'All notifications marked as read' });
  } catch (error) {
    return handleError(error);
  }
}

/**
 * DELETE /api/admin/notifications/{id}
 * Permanently delete a notification.
 */
export async function deleteNotification(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    requireAuth(event);

    const id = event.pathParameters?.id;
    if (!id) {
      return errorResponse('id is required', 400);
    }

    const service = getNotificationService();
    await service.deleteNotification(id);

    return successResponse({ message: 'Notification deleted' });
  } catch (error) {
    return handleError(error);
  }
}
