/**
 * Unit tests for the Health Check Lambda Handler
 */

// Set environment variables before any imports
process.env.DYNAMODB_TABLE_NAME = 'test-table';
process.env.S3_BUCKET_NAME = 'test-bucket';
process.env.AWS_REGION_CUSTOM = 'us-east-1';

// ──────────────────────────────────────────────────────────────────────────────
// Mocks
// ──────────────────────────────────────────────────────────────────────────────

const mockCheckDynamoDB = jest.fn();
const mockCheckS3 = jest.fn();
const mockCheckMemory = jest.fn();

jest.mock('../health-check', () => {
  const actual = jest.requireActual('../health-check');
  return {
    __esModule: true,
    ...actual,
    checkDynamoDB: (...args: unknown[]) => mockCheckDynamoDB(...args),
    checkS3: (...args: unknown[]) => mockCheckS3(...args),
    checkMemory: () => mockCheckMemory(),
  };
});

// ──────────────────────────────────────────────────────────────────────────────
// Import handler AFTER mocks
// ──────────────────────────────────────────────────────────────────────────────

import { getHealth } from '../handlers/health.handler';

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    httpMethod: 'GET',
    path: '/health',
    pathParameters: null,
    queryStringParameters: null,
    headers: {},
    body: null,
    ...overrides,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe('Health handler – getHealth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns HTTP 200 with healthy status when all checks pass', async () => {
    mockCheckDynamoDB.mockResolvedValue({ status: 'healthy', latencyMs: 10 });
    mockCheckS3.mockResolvedValue({ status: 'healthy', latencyMs: 15 });
    mockCheckMemory.mockReturnValue({ status: 'healthy' });

    const result = await getHealth(makeEvent());

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.status).toBe('healthy');
    expect(body.service).toBe('product-service');
    expect(body.version).toBe('1.0.0');
    expect(body.checks).toEqual({
      dynamodb: 'healthy',
      s3: 'healthy',
      memory: 'healthy',
    });
    expect(typeof body.uptime).toBe('number');
    expect(typeof body.timestamp).toBe('string');
  });

  it('returns HTTP 200 with degraded status when one check is degraded', async () => {
    mockCheckDynamoDB.mockResolvedValue({ status: 'degraded', latencyMs: 4800, error: 'Health check timed out' });
    mockCheckS3.mockResolvedValue({ status: 'healthy', latencyMs: 20 });
    mockCheckMemory.mockReturnValue({ status: 'healthy' });

    const result = await getHealth(makeEvent());

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.status).toBe('degraded');
    expect(body.checks.dynamodb).toBe('degraded');
  });

  it('returns HTTP 200 with unhealthy status when a check fails', async () => {
    mockCheckDynamoDB.mockResolvedValue({ status: 'unhealthy', latencyMs: 5, error: 'ResourceNotFoundException' });
    mockCheckS3.mockResolvedValue({ status: 'healthy', latencyMs: 10 });
    mockCheckMemory.mockReturnValue({ status: 'healthy' });

    const result = await getHealth(makeEvent());

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.status).toBe('unhealthy');
    expect(body.checks.dynamodb).toBe('unhealthy');
  });

  it('includes no-cache headers in the response', async () => {
    mockCheckDynamoDB.mockResolvedValue({ status: 'healthy' });
    mockCheckS3.mockResolvedValue({ status: 'healthy' });
    mockCheckMemory.mockReturnValue({ status: 'healthy' });

    const result = await getHealth(makeEvent());

    expect(result.headers?.['Cache-Control']).toContain('no-cache');
  });

  it('invokes DynamoDB check with configured table and region', async () => {
    mockCheckDynamoDB.mockResolvedValue({ status: 'healthy' });
    mockCheckS3.mockResolvedValue({ status: 'healthy' });
    mockCheckMemory.mockReturnValue({ status: 'healthy' });

    await getHealth(makeEvent());

    expect(mockCheckDynamoDB).toHaveBeenCalledWith('test-table', 'us-east-1');
    expect(mockCheckS3).toHaveBeenCalledWith('test-bucket', 'us-east-1');
  });

  it('reports unhealthy dynamodb when PRODUCTS_TABLE_NAME is not set', async () => {
    const original = process.env.PRODUCTS_TABLE_NAME;
    const originalFallback = process.env.DYNAMODB_TABLE_NAME;
    delete process.env.PRODUCTS_TABLE_NAME;
    delete process.env.DYNAMODB_TABLE_NAME;

    mockCheckS3.mockResolvedValue({ status: 'healthy' });
    mockCheckMemory.mockReturnValue({ status: 'healthy' });

    const result = await getHealth(makeEvent());

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.checks.dynamodb).toBe('unhealthy');

    process.env.DYNAMODB_TABLE_NAME = originalFallback;
    if (original !== undefined) {
      process.env.PRODUCTS_TABLE_NAME = original;
    } else {
      delete process.env.PRODUCTS_TABLE_NAME;
    }
  });

  it('reports unhealthy s3 when S3_BUCKET_NAME is not set', async () => {
    const original = process.env.S3_BUCKET_NAME;
    delete process.env.S3_BUCKET_NAME;

    mockCheckDynamoDB.mockResolvedValue({ status: 'healthy' });
    mockCheckMemory.mockReturnValue({ status: 'healthy' });

    const result = await getHealth(makeEvent());

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.checks.s3).toBe('unhealthy');

    process.env.S3_BUCKET_NAME = original;
  });

  it('falls back to us-east-1 region when AWS_REGION_CUSTOM is not set', async () => {
    const original = process.env.AWS_REGION_CUSTOM;
    delete process.env.AWS_REGION_CUSTOM;

    mockCheckDynamoDB.mockResolvedValue({ status: 'healthy' });
    mockCheckS3.mockResolvedValue({ status: 'healthy' });
    mockCheckMemory.mockReturnValue({ status: 'healthy' });

    await getHealth(makeEvent());

    expect(mockCheckDynamoDB).toHaveBeenCalledWith('test-table', 'us-east-1');
    expect(mockCheckS3).toHaveBeenCalledWith('test-bucket', 'us-east-1');

    process.env.AWS_REGION_CUSTOM = original;
  });
});
