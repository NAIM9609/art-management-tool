/**
 * Unit tests for Notification Service Lambda Handlers
 */

// Set environment variables before any imports
process.env.DYNAMODB_TABLE_NAME = 'test-notifications';
process.env.AWS_REGION = 'us-east-1';
process.env.JWT_SECRET = 'test-secret';

import jwt from 'jsonwebtoken';

// ──────────────────────────────────────────────────────────────────────────────
// Mocks
// ──────────────────────────────────────────────────────────────────────────────

const mockGetNotifications = jest.fn();
const mockGetNotificationById = jest.fn();
const mockMarkAsRead = jest.fn();
const mockMarkAllAsRead = jest.fn();
const mockDeleteNotification = jest.fn();

jest.mock('../../../../src/services/NotificationService', () => ({
  NotificationService: jest.fn().mockImplementation(() => ({
    getNotifications: mockGetNotifications,
    getNotificationById: mockGetNotificationById,
    markAsRead: mockMarkAsRead,
    markAllAsRead: mockMarkAllAsRead,
    deleteNotification: mockDeleteNotification,
  })),
}));

jest.mock('../../../../src/services/dynamodb/DynamoDBOptimized', () => ({
  DynamoDBOptimized: jest.fn().mockImplementation(() => ({})),
}));

// ──────────────────────────────────────────────────────────────────────────────
// Import handlers AFTER mocks are set up
// ──────────────────────────────────────────────────────────────────────────────

import {
  listNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} from '../handlers/notification.handler';

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function makeAuthToken(): string {
  return jwt.sign({ id: 1, username: 'artadmin' }, 'test-secret');
}

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    httpMethod: 'GET',
    path: '/',
    pathParameters: null,
    queryStringParameters: null,
    headers: {},
    body: null,
    ...overrides,
  };
}

const AUTH_HEADERS = { Authorization: `Bearer ${makeAuthToken()}` };

const MOCK_NOTIFICATION = {
  id: 'notif-uuid-1',
  type: 'order_created',
  title: 'New Order',
  message: 'Order #ORD-001 created',
  metadata: { orderId: 'order-uuid-1' },
  is_read: false,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  expires_at: 9999999999,
};

const MOCK_READ_NOTIFICATION = {
  ...MOCK_NOTIFICATION,
  is_read: true,
  read_at: '2024-01-02T00:00:00.000Z',
};

// ──────────────────────────────────────────────────────────────────────────────
// listNotifications
// ──────────────────────────────────────────────────────────────────────────────

describe('listNotifications', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns notifications with 200', async () => {
    mockGetNotifications.mockResolvedValueOnce({
      notifications: [MOCK_NOTIFICATION],
      count: 1,
      lastEvaluatedKey: undefined,
    });

    const result = await listNotifications(
      makeEvent({ headers: AUTH_HEADERS })
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.notifications).toHaveLength(1);
    expect(body.notifications[0].id).toBe('notif-uuid-1');
    expect(body.count).toBe(1);
    expect(body.lastEvaluatedKey).toBeUndefined();
  });

  it('passes unreadOnly=true to service', async () => {
    mockGetNotifications.mockResolvedValueOnce({
      notifications: [MOCK_NOTIFICATION],
      count: 1,
      lastEvaluatedKey: undefined,
    });

    await listNotifications(
      makeEvent({
        headers: AUTH_HEADERS,
        queryStringParameters: { unreadOnly: 'true' },
      })
    );

    expect(mockGetNotifications).toHaveBeenCalledWith(true, undefined, 20);
  });

  it('applies type filter in memory', async () => {
    const otherNotification = { ...MOCK_NOTIFICATION, id: 'notif-2', type: 'low_stock' };
    mockGetNotifications.mockResolvedValueOnce({
      notifications: [MOCK_NOTIFICATION, otherNotification],
      count: 2,
      lastEvaluatedKey: undefined,
    });

    const result = await listNotifications(
      makeEvent({
        headers: AUTH_HEADERS,
        queryStringParameters: { type: 'order_created' },
      })
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.notifications).toHaveLength(1);
    expect(body.notifications[0].type).toBe('order_created');
  });

  it('parses perPage query parameter', async () => {
    mockGetNotifications.mockResolvedValueOnce({
      notifications: [],
      count: 0,
      lastEvaluatedKey: undefined,
    });

    await listNotifications(
      makeEvent({
        headers: AUTH_HEADERS,
        queryStringParameters: { perPage: '10' },
      })
    );

    expect(mockGetNotifications).toHaveBeenCalledWith(false, undefined, 10);
  });

  it('parses lastEvaluatedKey query parameter', async () => {
    const cursor = { PK: 'NOTIFICATION#abc', SK: 'METADATA' };
    mockGetNotifications.mockResolvedValueOnce({
      notifications: [],
      count: 0,
      lastEvaluatedKey: undefined,
    });

    await listNotifications(
      makeEvent({
        headers: AUTH_HEADERS,
        queryStringParameters: { lastEvaluatedKey: JSON.stringify(cursor) },
      })
    );

    expect(mockGetNotifications).toHaveBeenCalledWith(false, cursor, 20);
  });

  it('returns 400 for invalid perPage', async () => {
    const result = await listNotifications(
      makeEvent({
        headers: AUTH_HEADERS,
        queryStringParameters: { perPage: 'abc' },
      })
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/perPage/i);
  });

  it('returns 400 for perPage with trailing non-digit characters', async () => {
    const result = await listNotifications(
      makeEvent({
        headers: AUTH_HEADERS,
        queryStringParameters: { perPage: '10abc' },
      })
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/perPage/i);
  });

  it('returns 400 for invalid notification type filter', async () => {
    const result = await listNotifications(
      makeEvent({
        headers: AUTH_HEADERS,
        queryStringParameters: { type: 'not-a-valid-type' },
      })
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/invalid notification type/i);
  });

  it('returns 400 for invalid lastEvaluatedKey', async () => {
    const result = await listNotifications(
      makeEvent({
        headers: AUTH_HEADERS,
        queryStringParameters: { lastEvaluatedKey: 'not-json' },
      })
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/lastEvaluatedKey/i);
  });

  it('returns 401 when no auth header', async () => {
    const result = await listNotifications(makeEvent());
    expect(result.statusCode).toBe(401);
  });

  it('returns 500 on service error', async () => {
    mockGetNotifications.mockRejectedValueOnce(new Error('DynamoDB error'));

    const result = await listNotifications(
      makeEvent({ headers: AUTH_HEADERS })
    );

    expect(result.statusCode).toBe(500);
  });

  it('includes lastEvaluatedKey in response when present', async () => {
    const cursor = { PK: 'NOTIFICATION#abc', SK: 'METADATA' };
    mockGetNotifications.mockResolvedValueOnce({
      notifications: [MOCK_NOTIFICATION],
      count: 1,
      lastEvaluatedKey: cursor,
    });

    const result = await listNotifications(
      makeEvent({ headers: AUTH_HEADERS })
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.lastEvaluatedKey).toEqual(cursor);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// markAsRead
// ──────────────────────────────────────────────────────────────────────────────

describe('markAsRead', () => {
  beforeEach(() => jest.clearAllMocks());

  it('marks notification as read and returns 200', async () => {
    mockMarkAsRead.mockResolvedValueOnce(MOCK_READ_NOTIFICATION);

    const result = await markAsRead(
      makeEvent({
        headers: AUTH_HEADERS,
        pathParameters: { id: 'notif-uuid-1' },
      })
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.notification.is_read).toBe(true);
    expect(mockMarkAsRead).toHaveBeenCalledWith('notif-uuid-1');
  });

  it('returns 404 when notification not found', async () => {
    mockMarkAsRead.mockResolvedValueOnce(null);

    const result = await markAsRead(
      makeEvent({
        headers: AUTH_HEADERS,
        pathParameters: { id: 'missing-id' },
      })
    );

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).error).toMatch(/not found/i);
  });

  it('returns 400 when id is missing', async () => {
    const result = await markAsRead(
      makeEvent({ headers: AUTH_HEADERS })
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/id is required/i);
  });

  it('returns 401 when not authenticated', async () => {
    const result = await markAsRead(
      makeEvent({ pathParameters: { id: 'notif-uuid-1' } })
    );

    expect(result.statusCode).toBe(401);
  });

  it('returns 500 on service error', async () => {
    mockMarkAsRead.mockRejectedValueOnce(new Error('DynamoDB error'));

    const result = await markAsRead(
      makeEvent({
        headers: AUTH_HEADERS,
        pathParameters: { id: 'notif-uuid-1' },
      })
    );

    expect(result.statusCode).toBe(500);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// markAllAsRead
// ──────────────────────────────────────────────────────────────────────────────

describe('markAllAsRead', () => {
  beforeEach(() => jest.clearAllMocks());

  it('marks all as read and returns 200', async () => {
    mockMarkAllAsRead.mockResolvedValueOnce(undefined);

    const result = await markAllAsRead(
      makeEvent({ headers: AUTH_HEADERS })
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.message).toMatch(/marked as read/i);
    expect(mockMarkAllAsRead).toHaveBeenCalledTimes(1);
  });

  it('returns 401 when not authenticated', async () => {
    const result = await markAllAsRead(makeEvent());
    expect(result.statusCode).toBe(401);
  });

  it('returns 500 on service error', async () => {
    mockMarkAllAsRead.mockRejectedValueOnce(new Error('DynamoDB error'));

    const result = await markAllAsRead(
      makeEvent({ headers: AUTH_HEADERS })
    );

    expect(result.statusCode).toBe(500);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// deleteNotification
// ──────────────────────────────────────────────────────────────────────────────

describe('deleteNotification', () => {
  beforeEach(() => jest.clearAllMocks());

  it('deletes notification and returns 200', async () => {
    mockGetNotificationById.mockResolvedValueOnce(MOCK_NOTIFICATION);
    mockDeleteNotification.mockResolvedValueOnce(undefined);

    const result = await deleteNotification(
      makeEvent({
        headers: AUTH_HEADERS,
        pathParameters: { id: 'notif-uuid-1' },
      })
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.message).toMatch(/deleted/i);
    expect(mockDeleteNotification).toHaveBeenCalledWith('notif-uuid-1');
  });

  it('returns 404 when notification does not exist', async () => {
    mockGetNotificationById.mockResolvedValueOnce(null);

    const result = await deleteNotification(
      makeEvent({
        headers: AUTH_HEADERS,
        pathParameters: { id: 'missing-id' },
      })
    );

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).error).toMatch(/not found/i);
    expect(mockDeleteNotification).not.toHaveBeenCalled();
  });

  it('returns 400 when id is missing', async () => {
    const result = await deleteNotification(
      makeEvent({ headers: AUTH_HEADERS })
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/id is required/i);
  });

  it('returns 401 when not authenticated', async () => {
    const result = await deleteNotification(
      makeEvent({ pathParameters: { id: 'notif-uuid-1' } })
    );

    expect(result.statusCode).toBe(401);
  });

  it('returns 500 on service error', async () => {
    mockGetNotificationById.mockResolvedValueOnce(MOCK_NOTIFICATION);
    mockDeleteNotification.mockRejectedValueOnce(new Error('DynamoDB error'));

    const result = await deleteNotification(
      makeEvent({
        headers: AUTH_HEADERS,
        pathParameters: { id: 'notif-uuid-1' },
      })
    );

    expect(result.statusCode).toBe(500);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Auth middleware (requireAuth)
// ──────────────────────────────────────────────────────────────────────────────

describe('Auth middleware (requireAuth)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('accepts demo-token-12345 for backward compatibility', async () => {
    mockMarkAllAsRead.mockResolvedValueOnce(undefined);

    const result = await markAllAsRead(
      makeEvent({ headers: { Authorization: 'Bearer demo-token-12345' } })
    );

    expect(result.statusCode).toBe(200);
  });

  it('rejects malformed Authorization header', async () => {
    const result = await markAllAsRead(
      makeEvent({ headers: { Authorization: 'Token bad-format' } })
    );

    expect(result.statusCode).toBe(401);
  });

  it('rejects expired JWT', async () => {
    const expiredToken = jwt.sign({ id: 1, username: 'admin' }, 'test-secret', {
      expiresIn: -1,
    });

    const result = await markAllAsRead(
      makeEvent({ headers: { Authorization: `Bearer ${expiredToken}` } })
    );

    expect(result.statusCode).toBe(401);
  });

  it('accepts lowercase authorization header', async () => {
    mockMarkAllAsRead.mockResolvedValueOnce(undefined);

    const token = makeAuthToken();
    const result = await markAllAsRead(
      makeEvent({ headers: { authorization: `Bearer ${token}` } })
    );

    expect(result.statusCode).toBe(200);
  });
});
