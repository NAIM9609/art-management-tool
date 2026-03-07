/**
 * Unit tests for Audit Service Lambda Handlers
 */

// Set environment variables before any imports
process.env.DYNAMODB_TABLE_NAME = 'test-audit';
process.env.AWS_REGION = 'us-east-1';
process.env.JWT_SECRET = 'test-secret';

import jwt from 'jsonwebtoken';

// ──────────────────────────────────────────────────────────────────────────────
// Mocks
// ──────────────────────────────────────────────────────────────────────────────

const mockGetEntityHistory = jest.fn();
const mockGetUserActivity = jest.fn();
const mockGetActivityByDateRange = jest.fn();

jest.mock('../../../../src/services/AuditService', () => ({
  AuditService: jest.fn().mockImplementation(() => ({
    getEntityHistory: mockGetEntityHistory,
    getUserActivity: mockGetUserActivity,
    getActivityByDateRange: mockGetActivityByDateRange,
  })),
}));

jest.mock('../../../../src/services/dynamodb/DynamoDBOptimized', () => ({
  DynamoDBOptimized: jest.fn().mockImplementation(() => ({})),
}));

// ──────────────────────────────────────────────────────────────────────────────
// Import handlers AFTER mocks are set up
// ──────────────────────────────────────────────────────────────────────────────

import {
  getEntityHistory,
  getUserActivity,
  getActivityByDate,
} from '../handlers/audit.handler';

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

const MOCK_AUDIT_LOG = {
  id: 'audit-uuid-1',
  entity_type: 'product',
  entity_id: 'prod-uuid-1',
  user_id: 'user-1',
  action: 'UPDATE',
  changes: { title: { old: 'Old Title', new: 'New Title' } },
  metadata: { ip_address: '127.0.0.1' },
  created_at: '2024-01-15T10:00:00.000Z',
  expires_at: 9999999999,
};

// ──────────────────────────────────────────────────────────────────────────────
// getEntityHistory
// ──────────────────────────────────────────────────────────────────────────────

describe('getEntityHistory', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with audit logs for entity', async () => {
    mockGetEntityHistory.mockResolvedValueOnce({
      items: [MOCK_AUDIT_LOG],
      count: 1,
      lastEvaluatedKey: undefined,
    });

    const result = await getEntityHistory(
      makeEvent({
        headers: AUTH_HEADERS,
        pathParameters: { type: 'product', id: 'prod-uuid-1' },
      })
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.logs).toHaveLength(1);
    expect(body.logs[0].id).toBe('audit-uuid-1');
    expect(body.count).toBe(1);
    expect(body.lastEvaluatedKey).toBeUndefined();
    expect(mockGetEntityHistory).toHaveBeenCalledWith('product', 'prod-uuid-1', {
      limit: 30,
      lastEvaluatedKey: undefined,
    });
  });

  it('returns 400 when type is missing', async () => {
    const result = await getEntityHistory(
      makeEvent({
        headers: AUTH_HEADERS,
        pathParameters: { id: 'prod-uuid-1' },
      })
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/type/i);
  });

  it('returns 400 when id is missing', async () => {
    const result = await getEntityHistory(
      makeEvent({
        headers: AUTH_HEADERS,
        pathParameters: { type: 'product' },
      })
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/id/i);
  });

  it('parses perPage query parameter', async () => {
    mockGetEntityHistory.mockResolvedValueOnce({
      items: [],
      count: 0,
      lastEvaluatedKey: undefined,
    });

    await getEntityHistory(
      makeEvent({
        headers: AUTH_HEADERS,
        pathParameters: { type: 'product', id: 'prod-uuid-1' },
        queryStringParameters: { perPage: '10' },
      })
    );

    expect(mockGetEntityHistory).toHaveBeenCalledWith('product', 'prod-uuid-1', {
      limit: 10,
      lastEvaluatedKey: undefined,
    });
  });

  it('clamps perPage to 100 when value is too large', async () => {
    mockGetEntityHistory.mockResolvedValueOnce({
      items: [],
      count: 0,
      lastEvaluatedKey: undefined,
    });

    await getEntityHistory(
      makeEvent({
        headers: AUTH_HEADERS,
        pathParameters: { type: 'product', id: 'prod-uuid-1' },
        queryStringParameters: { perPage: '1000' },
      })
    );

    expect(mockGetEntityHistory).toHaveBeenCalledWith('product', 'prod-uuid-1', {
      limit: 100,
      lastEvaluatedKey: undefined,
    });
  });

  it('parses lastEvaluatedKey query parameter', async () => {
    const cursor = { GSI1PK: 'AUDIT_ENTITY#product#prod-uuid-1', GSI1SK: '2024-01-15T10:00:00.000Z' };
    mockGetEntityHistory.mockResolvedValueOnce({
      items: [],
      count: 0,
      lastEvaluatedKey: undefined,
    });

    await getEntityHistory(
      makeEvent({
        headers: AUTH_HEADERS,
        pathParameters: { type: 'product', id: 'prod-uuid-1' },
        queryStringParameters: { lastEvaluatedKey: JSON.stringify(cursor) },
      })
    );

    expect(mockGetEntityHistory).toHaveBeenCalledWith('product', 'prod-uuid-1', {
      limit: 30,
      lastEvaluatedKey: cursor,
    });
  });

  it('returns 400 for invalid perPage', async () => {
    const result = await getEntityHistory(
      makeEvent({
        headers: AUTH_HEADERS,
        pathParameters: { type: 'product', id: 'prod-uuid-1' },
        queryStringParameters: { perPage: 'abc' },
      })
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/perPage/i);
  });

  it('returns 400 for perPage with trailing non-digit characters', async () => {
    const result = await getEntityHistory(
      makeEvent({
        headers: AUTH_HEADERS,
        pathParameters: { type: 'product', id: 'prod-uuid-1' },
        queryStringParameters: { perPage: '10abc' },
      })
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/perPage/i);
  });

  it('returns 400 for invalid lastEvaluatedKey', async () => {
    const result = await getEntityHistory(
      makeEvent({
        headers: AUTH_HEADERS,
        pathParameters: { type: 'product', id: 'prod-uuid-1' },
        queryStringParameters: { lastEvaluatedKey: 'not-json' },
      })
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/lastEvaluatedKey/i);
  });

  it('returns 400 for non-object lastEvaluatedKey', async () => {
    const result = await getEntityHistory(
      makeEvent({
        headers: AUTH_HEADERS,
        pathParameters: { type: 'product', id: 'prod-uuid-1' },
        queryStringParameters: { lastEvaluatedKey: JSON.stringify([1, 2, 3]) },
      })
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/lastEvaluatedKey/i);
  });

  it('includes lastEvaluatedKey in response when present', async () => {
    const cursor = { GSI1PK: 'AUDIT_ENTITY#product#prod-uuid-1', GSI1SK: '2024-01-14T00:00:00.000Z' };
    mockGetEntityHistory.mockResolvedValueOnce({
      items: [MOCK_AUDIT_LOG],
      count: 1,
      lastEvaluatedKey: cursor,
    });

    const result = await getEntityHistory(
      makeEvent({
        headers: AUTH_HEADERS,
        pathParameters: { type: 'product', id: 'prod-uuid-1' },
      })
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.lastEvaluatedKey).toEqual(cursor);
  });

  it('returns 401 when no auth header', async () => {
    const result = await getEntityHistory(
      makeEvent({ pathParameters: { type: 'product', id: 'prod-uuid-1' } })
    );

    expect(result.statusCode).toBe(401);
  });

  it('returns 500 on service error', async () => {
    mockGetEntityHistory.mockRejectedValueOnce(new Error('DynamoDB error'));

    const result = await getEntityHistory(
      makeEvent({
        headers: AUTH_HEADERS,
        pathParameters: { type: 'product', id: 'prod-uuid-1' },
      })
    );

    expect(result.statusCode).toBe(500);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// getUserActivity
// ──────────────────────────────────────────────────────────────────────────────

describe('getUserActivity', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with audit logs for user', async () => {
    mockGetUserActivity.mockResolvedValueOnce({
      items: [MOCK_AUDIT_LOG],
      count: 1,
      lastEvaluatedKey: undefined,
    });

    const result = await getUserActivity(
      makeEvent({
        headers: AUTH_HEADERS,
        pathParameters: { userId: 'user-1' },
      })
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.logs).toHaveLength(1);
    expect(body.logs[0].id).toBe('audit-uuid-1');
    expect(body.count).toBe(1);
    expect(body.lastEvaluatedKey).toBeUndefined();
    expect(mockGetUserActivity).toHaveBeenCalledWith('user-1', {
      limit: 30,
      lastEvaluatedKey: undefined,
    });
  });

  it('returns 400 when userId is missing', async () => {
    const result = await getUserActivity(
      makeEvent({ headers: AUTH_HEADERS })
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/userId/i);
  });

  it('parses perPage query parameter', async () => {
    mockGetUserActivity.mockResolvedValueOnce({
      items: [],
      count: 0,
      lastEvaluatedKey: undefined,
    });

    await getUserActivity(
      makeEvent({
        headers: AUTH_HEADERS,
        pathParameters: { userId: 'user-1' },
        queryStringParameters: { perPage: '50' },
      })
    );

    expect(mockGetUserActivity).toHaveBeenCalledWith('user-1', {
      limit: 50,
      lastEvaluatedKey: undefined,
    });
  });

  it('clamps perPage to 100 when value is too large', async () => {
    mockGetUserActivity.mockResolvedValueOnce({
      items: [],
      count: 0,
      lastEvaluatedKey: undefined,
    });

    await getUserActivity(
      makeEvent({
        headers: AUTH_HEADERS,
        pathParameters: { userId: 'user-1' },
        queryStringParameters: { perPage: '500' },
      })
    );

    expect(mockGetUserActivity).toHaveBeenCalledWith('user-1', {
      limit: 100,
      lastEvaluatedKey: undefined,
    });
  });

  it('parses lastEvaluatedKey query parameter', async () => {
    const cursor = { GSI2PK: 'AUDIT_USER#user-1', GSI2SK: '2024-01-15T10:00:00.000Z' };
    mockGetUserActivity.mockResolvedValueOnce({
      items: [],
      count: 0,
      lastEvaluatedKey: undefined,
    });

    await getUserActivity(
      makeEvent({
        headers: AUTH_HEADERS,
        pathParameters: { userId: 'user-1' },
        queryStringParameters: { lastEvaluatedKey: JSON.stringify(cursor) },
      })
    );

    expect(mockGetUserActivity).toHaveBeenCalledWith('user-1', {
      limit: 30,
      lastEvaluatedKey: cursor,
    });
  });

  it('returns 400 for invalid perPage', async () => {
    const result = await getUserActivity(
      makeEvent({
        headers: AUTH_HEADERS,
        pathParameters: { userId: 'user-1' },
        queryStringParameters: { perPage: '-5' },
      })
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/perPage/i);
  });

  it('returns 400 for invalid lastEvaluatedKey', async () => {
    const result = await getUserActivity(
      makeEvent({
        headers: AUTH_HEADERS,
        pathParameters: { userId: 'user-1' },
        queryStringParameters: { lastEvaluatedKey: '{bad json' },
      })
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/lastEvaluatedKey/i);
  });

  it('includes lastEvaluatedKey in response when present', async () => {
    const cursor = { GSI2PK: 'AUDIT_USER#user-1', GSI2SK: '2024-01-10T00:00:00.000Z' };
    mockGetUserActivity.mockResolvedValueOnce({
      items: [MOCK_AUDIT_LOG],
      count: 1,
      lastEvaluatedKey: cursor,
    });

    const result = await getUserActivity(
      makeEvent({
        headers: AUTH_HEADERS,
        pathParameters: { userId: 'user-1' },
      })
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.lastEvaluatedKey).toEqual(cursor);
  });

  it('returns 401 when no auth header', async () => {
    const result = await getUserActivity(
      makeEvent({ pathParameters: { userId: 'user-1' } })
    );

    expect(result.statusCode).toBe(401);
  });

  it('returns 500 on service error', async () => {
    mockGetUserActivity.mockRejectedValueOnce(new Error('DynamoDB error'));

    const result = await getUserActivity(
      makeEvent({
        headers: AUTH_HEADERS,
        pathParameters: { userId: 'user-1' },
      })
    );

    expect(result.statusCode).toBe(500);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// getActivityByDate
// ──────────────────────────────────────────────────────────────────────────────

describe('getActivityByDate', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with audit logs for date range', async () => {
    mockGetActivityByDateRange.mockResolvedValueOnce({
      items: [MOCK_AUDIT_LOG],
      count: 1,
      lastEvaluatedKey: undefined,
    });

    const result = await getActivityByDate(
      makeEvent({
        headers: AUTH_HEADERS,
        queryStringParameters: {
          startDate: '2024-01-01',
          endDate: '2024-01-31',
        },
      })
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.logs).toHaveLength(1);
    expect(body.logs[0].id).toBe('audit-uuid-1');
    expect(body.count).toBe(1);
    expect(body.lastEvaluatedKey).toBeUndefined();
    expect(mockGetActivityByDateRange).toHaveBeenCalledWith(
      '2024-01-01',
      '2024-01-31',
      { limit: 30, lastEvaluatedKey: undefined }
    );
  });

  it('returns 400 when startDate is missing', async () => {
    const result = await getActivityByDate(
      makeEvent({
        headers: AUTH_HEADERS,
        queryStringParameters: { endDate: '2024-01-31' },
      })
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/startDate/i);
  });

  it('returns 400 when endDate is missing', async () => {
    const result = await getActivityByDate(
      makeEvent({
        headers: AUTH_HEADERS,
        queryStringParameters: { startDate: '2024-01-01' },
      })
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/endDate/i);
  });

  it('returns 400 when both dates are missing', async () => {
    const result = await getActivityByDate(
      makeEvent({ headers: AUTH_HEADERS })
    );

    expect(result.statusCode).toBe(400);
  });

  it('parses perPage query parameter', async () => {
    mockGetActivityByDateRange.mockResolvedValueOnce({
      items: [],
      count: 0,
      lastEvaluatedKey: undefined,
    });

    await getActivityByDate(
      makeEvent({
        headers: AUTH_HEADERS,
        queryStringParameters: {
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          perPage: '100',
        },
      })
    );

    expect(mockGetActivityByDateRange).toHaveBeenCalledWith(
      '2024-01-01',
      '2024-01-31',
      { limit: 100, lastEvaluatedKey: undefined }
    );
  });

  it('clamps perPage to 100 when value is too large', async () => {
    mockGetActivityByDateRange.mockResolvedValueOnce({
      items: [],
      count: 0,
      lastEvaluatedKey: undefined,
    });

    await getActivityByDate(
      makeEvent({
        headers: AUTH_HEADERS,
        queryStringParameters: {
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          perPage: '999',
        },
      })
    );

    expect(mockGetActivityByDateRange).toHaveBeenCalledWith(
      '2024-01-01',
      '2024-01-31',
      { limit: 100, lastEvaluatedKey: undefined }
    );
  });

  it('parses lastEvaluatedKey query parameter', async () => {
    const cursor = { created_at: '2024-01-15T10:00:00.000Z' };
    mockGetActivityByDateRange.mockResolvedValueOnce({
      items: [],
      count: 0,
      lastEvaluatedKey: undefined,
    });

    await getActivityByDate(
      makeEvent({
        headers: AUTH_HEADERS,
        queryStringParameters: {
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          lastEvaluatedKey: JSON.stringify(cursor),
        },
      })
    );

    expect(mockGetActivityByDateRange).toHaveBeenCalledWith(
      '2024-01-01',
      '2024-01-31',
      { limit: 30, lastEvaluatedKey: cursor }
    );
  });

  it('returns 400 for invalid perPage', async () => {
    const result = await getActivityByDate(
      makeEvent({
        headers: AUTH_HEADERS,
        queryStringParameters: {
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          perPage: 'large',
        },
      })
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/perPage/i);
  });

  it('returns 400 for invalid lastEvaluatedKey', async () => {
    const result = await getActivityByDate(
      makeEvent({
        headers: AUTH_HEADERS,
        queryStringParameters: {
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          lastEvaluatedKey: 'not-valid-json',
        },
      })
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/lastEvaluatedKey/i);
  });

  it('returns 400 when service throws invalid date range error', async () => {
    mockGetActivityByDateRange.mockRejectedValueOnce(
      new Error('startDate must be less than or equal to endDate')
    );

    const result = await getActivityByDate(
      makeEvent({
        headers: AUTH_HEADERS,
        queryStringParameters: {
          startDate: '2024-01-31',
          endDate: '2024-01-01',
        },
      })
    );

    expect(result.statusCode).toBe(400);
  });

  it('returns 400 when service throws date range exceeds maximum error', async () => {
    mockGetActivityByDateRange.mockRejectedValueOnce(
      new Error('Date range exceeds maximum allowed (90 days).')
    );

    const result = await getActivityByDate(
      makeEvent({
        headers: AUTH_HEADERS,
        queryStringParameters: {
          startDate: '2023-01-01',
          endDate: '2024-01-01',
        },
      })
    );

    expect(result.statusCode).toBe(400);
  });

  it('includes lastEvaluatedKey in response when present', async () => {
    const cursor = { created_at: '2024-01-10T00:00:00.000Z' };
    mockGetActivityByDateRange.mockResolvedValueOnce({
      items: [MOCK_AUDIT_LOG],
      count: 1,
      lastEvaluatedKey: cursor,
    });

    const result = await getActivityByDate(
      makeEvent({
        headers: AUTH_HEADERS,
        queryStringParameters: {
          startDate: '2024-01-01',
          endDate: '2024-01-31',
        },
      })
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.lastEvaluatedKey).toEqual(cursor);
  });

  it('returns 401 when no auth header', async () => {
    const result = await getActivityByDate(
      makeEvent({
        queryStringParameters: {
          startDate: '2024-01-01',
          endDate: '2024-01-31',
        },
      })
    );

    expect(result.statusCode).toBe(401);
  });

  it('returns 500 on service error', async () => {
    mockGetActivityByDateRange.mockRejectedValueOnce(new Error('DynamoDB error'));

    const result = await getActivityByDate(
      makeEvent({
        headers: AUTH_HEADERS,
        queryStringParameters: {
          startDate: '2024-01-01',
          endDate: '2024-01-31',
        },
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

  it('accepts demo-token', async () => {
    mockGetEntityHistory.mockResolvedValueOnce({
      items: [],
      count: 0,
      lastEvaluatedKey: undefined,
    });

    const result = await getEntityHistory(
      makeEvent({
        headers: { Authorization: 'Bearer demo-token-12345' },
        pathParameters: { type: 'product', id: 'prod-uuid-1' },
      })
    );

    expect(result.statusCode).toBe(200);
  });

  it('returns 401 for malformed authorization header', async () => {
    const result = await getEntityHistory(
      makeEvent({
        headers: { Authorization: 'NotBearer token' },
        pathParameters: { type: 'product', id: 'prod-uuid-1' },
      })
    );

    expect(result.statusCode).toBe(401);
  });

  it('returns 401 for expired JWT', async () => {
    const expiredToken = jwt.sign(
      { id: 1, username: 'artadmin' },
      'test-secret',
      { expiresIn: -1 }
    );

    const result = await getEntityHistory(
      makeEvent({
        headers: { Authorization: `Bearer ${expiredToken}` },
        pathParameters: { type: 'product', id: 'prod-uuid-1' },
      })
    );

    expect(result.statusCode).toBe(401);
  });

  it('accepts lowercase authorization header', async () => {
    mockGetEntityHistory.mockResolvedValueOnce({
      items: [],
      count: 0,
      lastEvaluatedKey: undefined,
    });

    const result = await getEntityHistory(
      makeEvent({
        headers: { authorization: `Bearer ${makeAuthToken()}` },
        pathParameters: { type: 'product', id: 'prod-uuid-1' },
      })
    );

    expect(result.statusCode).toBe(200);
  });
});
