/**
 * Unit tests for Discount Service Lambda Handlers
 */

// Set environment variables before any imports
process.env.DYNAMODB_TABLE_NAME = 'test-discounts';
process.env.AWS_REGION_CUSTOM = 'us-east-1';
process.env.JWT_SECRET = 'test-secret';

import jwt from 'jsonwebtoken';

// ──────────────────────────────────────────────────────────────────────────────
// Mocks
// ──────────────────────────────────────────────────────────────────────────────

const mockFindByCode = jest.fn();
const mockFindById = jest.fn();
const mockFindAll = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockSoftDelete = jest.fn();
const mockGetStats = jest.fn();

jest.mock('../../../../src/services/dynamodb/repositories/DiscountCodeRepository', () => ({
  DiscountCodeRepository: jest.fn().mockImplementation(() => ({
    findByCode: mockFindByCode,
    findById: mockFindById,
    findAll: mockFindAll,
    create: mockCreate,
    update: mockUpdate,
    softDelete: mockSoftDelete,
    getStats: mockGetStats,
  })),
}));

jest.mock('../../../../src/services/dynamodb/DynamoDBOptimized', () => ({
  DynamoDBOptimized: jest.fn().mockImplementation(() => ({})),
}));

// ──────────────────────────────────────────────────────────────────────────────
// Import handlers AFTER mocks are set up
// ──────────────────────────────────────────────────────────────────────────────

import {
  validateCode,
  listDiscounts,
  getDiscount,
  createDiscount,
  updateDiscount,
  deleteDiscount,
  getStats,
} from '../handlers/discount.handler';

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

const NOW = new Date().toISOString();
const FUTURE = new Date(Date.now() + 86400000).toISOString();   // +1 day
const PAST = new Date(Date.now() - 86400000).toISOString();     // -1 day

const MOCK_DISCOUNT = {
  id: 1,
  code: 'SAVE10',
  description: 'Save 10%',
  discount_type: 'percentage',
  discount_value: 10,
  min_purchase_amount: undefined as number | undefined,
  max_discount_amount: undefined as number | undefined,
  valid_from: PAST,
  valid_until: FUTURE,
  max_uses: undefined as number | undefined,
  times_used: 0,
  is_active: true,
  created_at: NOW,
  updated_at: NOW,
};

// ──────────────────────────────────────────────────────────────────────────────
// validateCode
// ──────────────────────────────────────────────────────────────────────────────

describe('validateCode', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 400 when body is missing', async () => {
    const result = await validateCode(makeEvent());
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/body is required/i);
  });

  it('returns 400 for invalid JSON', async () => {
    const result = await validateCode(makeEvent({ body: '{bad json' }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/invalid json/i);
  });

  it('returns 400 when code is missing', async () => {
    const result = await validateCode(
      makeEvent({ body: JSON.stringify({ cartTotal: 100 }) })
    );
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/code is required/i);
  });

  it('returns 400 when code is an empty string', async () => {
    const result = await validateCode(
      makeEvent({ body: JSON.stringify({ code: '  ', cartTotal: 100 }) })
    );
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/code is required/i);
  });

  it('returns 400 when cartTotal is missing', async () => {
    const result = await validateCode(
      makeEvent({ body: JSON.stringify({ code: 'SAVE10' }) })
    );
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/cartTotal is required/i);
  });

  it('returns 400 when cartTotal is negative', async () => {
    const result = await validateCode(
      makeEvent({ body: JSON.stringify({ code: 'SAVE10', cartTotal: -5 }) })
    );
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/non-negative/i);
  });

  it('returns 400 when cartTotal is not a number', async () => {
    const result = await validateCode(
      makeEvent({ body: JSON.stringify({ code: 'SAVE10', cartTotal: 'abc' }) })
    );
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/non-negative/i);
  });

  it('returns valid=false with null discount when code does not exist', async () => {
    mockFindByCode.mockResolvedValue(null);

    const result = await validateCode(
      makeEvent({ body: JSON.stringify({ code: 'NOPE', cartTotal: 100 }) })
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.valid).toBe(false);
    expect(body.discount).toBeNull();
    expect(body.calculatedAmount).toBe(0);
  });

  it('returns valid=true with calculated amount for a percentage discount', async () => {
    mockFindByCode.mockResolvedValue(MOCK_DISCOUNT);

    const result = await validateCode(
      makeEvent({ body: JSON.stringify({ code: 'SAVE10', cartTotal: 200 }) })
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.valid).toBe(true);
    expect(body.calculatedAmount).toBe(20); // 10% of 200
    expect(body.discount.code).toBe('SAVE10');
  });

  it('returns valid=true with calculated amount for a fixed discount', async () => {
    const fixedDiscount = { ...MOCK_DISCOUNT, discount_type: 'fixed', discount_value: 15 };
    mockFindByCode.mockResolvedValue(fixedDiscount);

    const result = await validateCode(
      makeEvent({ body: JSON.stringify({ code: 'FLAT15', cartTotal: 100 }) })
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.valid).toBe(true);
    expect(body.calculatedAmount).toBe(15);
  });

  it('caps fixed discount at the cart total', async () => {
    const fixedDiscount = { ...MOCK_DISCOUNT, discount_type: 'fixed', discount_value: 200 };
    mockFindByCode.mockResolvedValue(fixedDiscount);

    const result = await validateCode(
      makeEvent({ body: JSON.stringify({ code: 'BIG', cartTotal: 50 }) })
    );

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).calculatedAmount).toBe(50);
  });

  it('applies max_discount_amount cap', async () => {
    const discount = { ...MOCK_DISCOUNT, discount_value: 50, max_discount_amount: 30 };
    mockFindByCode.mockResolvedValue(discount);

    const result = await validateCode(
      makeEvent({ body: JSON.stringify({ code: 'SAVE10', cartTotal: 200 }) })
    );

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).calculatedAmount).toBe(30); // capped at max_discount_amount
  });

  it('returns valid=false when discount is inactive', async () => {
    mockFindByCode.mockResolvedValue({ ...MOCK_DISCOUNT, is_active: false });

    const result = await validateCode(
      makeEvent({ body: JSON.stringify({ code: 'SAVE10', cartTotal: 100 }) })
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.valid).toBe(false);
    expect(body.calculatedAmount).toBe(0);
    expect(body.reason).toMatch(/not active/i);
  });

  it('returns valid=false when discount is not yet valid (valid_from in future)', async () => {
    mockFindByCode.mockResolvedValue({ ...MOCK_DISCOUNT, valid_from: FUTURE });

    const result = await validateCode(
      makeEvent({ body: JSON.stringify({ code: 'SAVE10', cartTotal: 100 }) })
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.valid).toBe(false);
    expect(body.reason).toMatch(/not yet valid/i);
  });

  it('returns valid=false when discount has expired (valid_until in past)', async () => {
    mockFindByCode.mockResolvedValue({ ...MOCK_DISCOUNT, valid_until: PAST });

    const result = await validateCode(
      makeEvent({ body: JSON.stringify({ code: 'SAVE10', cartTotal: 100 }) })
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.valid).toBe(false);
    expect(body.reason).toMatch(/expired/i);
  });

  it('returns valid=false when max_uses is reached', async () => {
    mockFindByCode.mockResolvedValue({ ...MOCK_DISCOUNT, max_uses: 5, times_used: 5 });

    const result = await validateCode(
      makeEvent({ body: JSON.stringify({ code: 'SAVE10', cartTotal: 100 }) })
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.valid).toBe(false);
    expect(body.reason).toMatch(/maximum number of uses/i);
  });

  it('returns valid=false when cart total is below min_purchase_amount', async () => {
    mockFindByCode.mockResolvedValue({ ...MOCK_DISCOUNT, min_purchase_amount: 100 });

    const result = await validateCode(
      makeEvent({ body: JSON.stringify({ code: 'SAVE10', cartTotal: 50 }) })
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.valid).toBe(false);
    expect(body.reason).toMatch(/minimum order value/i);
  });

  it('normalises code to uppercase before lookup', async () => {
    mockFindByCode.mockResolvedValue(MOCK_DISCOUNT);

    await validateCode(
      makeEvent({ body: JSON.stringify({ code: 'save10', cartTotal: 100 }) })
    );

    expect(mockFindByCode).toHaveBeenCalledWith('SAVE10');
  });

  it('returns 500 on unexpected service error', async () => {
    mockFindByCode.mockRejectedValue(new Error('DynamoDB failure'));

    const result = await validateCode(
      makeEvent({ body: JSON.stringify({ code: 'SAVE10', cartTotal: 100 }) })
    );

    expect(result.statusCode).toBe(500);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// listDiscounts
// ──────────────────────────────────────────────────────────────────────────────

describe('listDiscounts', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when no auth header is provided', async () => {
    const result = await listDiscounts(makeEvent());
    expect(result.statusCode).toBe(401);
  });

  it('returns 200 with list of discounts', async () => {
    mockFindAll.mockResolvedValue({ items: [MOCK_DISCOUNT], count: 1, lastEvaluatedKey: undefined });

    const result = await listDiscounts(
      makeEvent({ headers: AUTH_HEADERS })
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.count).toBe(1);
    expect(body.discounts).toHaveLength(1);
    expect(body.discounts[0].code).toBe('SAVE10');
  });

  it('filters by is_active=true when query param provided', async () => {
    mockFindAll.mockResolvedValue({ items: [], count: 0, lastEvaluatedKey: undefined });

    await listDiscounts(
      makeEvent({
        headers: AUTH_HEADERS,
        queryStringParameters: { is_active: 'true' },
      })
    );

    expect(mockFindAll).toHaveBeenCalledWith(
      { is_active: true },
      expect.objectContaining({ limit: 30 })
    );
  });

  it('filters by is_active=false when query param provided', async () => {
    mockFindAll.mockResolvedValue({ items: [], count: 0, lastEvaluatedKey: undefined });

    await listDiscounts(
      makeEvent({
        headers: AUTH_HEADERS,
        queryStringParameters: { is_active: 'false' },
      })
    );

    expect(mockFindAll).toHaveBeenCalledWith(
      { is_active: false },
      expect.objectContaining({ limit: 30 })
    );
  });

  it('returns 400 when is_active query param is invalid', async () => {
    const result = await listDiscounts(
      makeEvent({
        headers: AUTH_HEADERS,
        queryStringParameters: { is_active: 'foo' },
      })
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/is_active/i);
  });

  it('returns 400 when cursor is malformed', async () => {
    const result = await listDiscounts(
      makeEvent({
        headers: AUTH_HEADERS,
        queryStringParameters: { cursor: 'not-valid-base64' },
      })
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/invalid cursor/i);
  });

  it('returns 400 when cursor decodes to non-object JSON', async () => {
    const cursor = Buffer.from(JSON.stringify(['bad', 'cursor']), 'utf8').toString('base64');
    const result = await listDiscounts(
      makeEvent({
        headers: AUTH_HEADERS,
        queryStringParameters: { cursor },
      })
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/invalid cursor/i);
  });

  it('returns nextCursor when there is a lastEvaluatedKey', async () => {
    const key = { PK: 'DISCOUNT#5', SK: 'METADATA' };
    mockFindAll.mockResolvedValue({ items: [], count: 0, lastEvaluatedKey: key });

    const result = await listDiscounts(makeEvent({ headers: AUTH_HEADERS }));

    const body = JSON.parse(result.body);
    expect(body.nextCursor).toBeDefined();
    const decoded = JSON.parse(Buffer.from(body.nextCursor, 'base64').toString('utf8'));
    expect(decoded).toEqual(key);
  });

  it('returns 500 on service error', async () => {
    mockFindAll.mockRejectedValue(new Error('DynamoDB failure'));

    const result = await listDiscounts(makeEvent({ headers: AUTH_HEADERS }));

    expect(result.statusCode).toBe(500);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// getDiscount
// ──────────────────────────────────────────────────────────────────────────────

describe('getDiscount', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    const result = await getDiscount(makeEvent({ pathParameters: { id: '1' } }));
    expect(result.statusCode).toBe(401);
  });

  it('returns 400 when id is missing', async () => {
    const result = await getDiscount(makeEvent({ headers: AUTH_HEADERS }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/id is required/i);
  });

  it('returns 400 when id is not a positive integer', async () => {
    const result = await getDiscount(
      makeEvent({ headers: AUTH_HEADERS, pathParameters: { id: 'abc' } })
    );
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/positive integer/i);
  });

  it('returns 400 when id is zero', async () => {
    const result = await getDiscount(
      makeEvent({ headers: AUTH_HEADERS, pathParameters: { id: '0' } })
    );
    expect(result.statusCode).toBe(400);
  });

  it('returns 404 when discount is not found', async () => {
    mockFindById.mockResolvedValue(null);

    const result = await getDiscount(
      makeEvent({ headers: AUTH_HEADERS, pathParameters: { id: '99' } })
    );

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).error).toMatch(/not found/i);
  });

  it('returns 200 with the discount DTO', async () => {
    mockFindById.mockResolvedValue(MOCK_DISCOUNT);

    const result = await getDiscount(
      makeEvent({ headers: AUTH_HEADERS, pathParameters: { id: '1' } })
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.id).toBe(1);
    expect(body.code).toBe('SAVE10');
  });

  it('returns 500 on service error', async () => {
    mockFindById.mockRejectedValue(new Error('DynamoDB failure'));

    const result = await getDiscount(
      makeEvent({ headers: AUTH_HEADERS, pathParameters: { id: '1' } })
    );

    expect(result.statusCode).toBe(500);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// createDiscount
// ──────────────────────────────────────────────────────────────────────────────

describe('createDiscount', () => {
  beforeEach(() => jest.clearAllMocks());

  const validBody = JSON.stringify({
    code: 'NEWYEAR',
    discount_type: 'percentage',
    discount_value: 20,
  });

  it('returns 401 when not authenticated', async () => {
    const result = await createDiscount(makeEvent({ body: validBody }));
    expect(result.statusCode).toBe(401);
  });

  it('returns 400 when body is missing', async () => {
    const result = await createDiscount(makeEvent({ headers: AUTH_HEADERS }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/body is required/i);
  });

  it('returns 400 for invalid JSON', async () => {
    const result = await createDiscount(
      makeEvent({ headers: AUTH_HEADERS, body: '{bad json' })
    );
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/invalid json/i);
  });

  it('returns 400 when code is missing', async () => {
    const result = await createDiscount(
      makeEvent({
        headers: AUTH_HEADERS,
        body: JSON.stringify({ discount_type: 'percentage', discount_value: 10 }),
      })
    );
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/code is required/i);
  });

  it('returns 400 when discount_type is missing', async () => {
    const result = await createDiscount(
      makeEvent({
        headers: AUTH_HEADERS,
        body: JSON.stringify({ code: 'NEWYEAR', discount_value: 10 }),
      })
    );
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/discount_type is required/i);
  });

  it('returns 400 when discount_type is invalid', async () => {
    const result = await createDiscount(
      makeEvent({
        headers: AUTH_HEADERS,
        body: JSON.stringify({ code: 'NEWYEAR', discount_type: 'invalid', discount_value: 10 }),
      })
    );
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/discount_type must be one of/i);
  });

  it('returns 400 when discount_value is missing', async () => {
    const result = await createDiscount(
      makeEvent({
        headers: AUTH_HEADERS,
        body: JSON.stringify({ code: 'NEWYEAR', discount_type: 'percentage' }),
      })
    );
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/discount_value is required/i);
  });

  it('returns 400 when discount_value is not a number', async () => {
    const result = await createDiscount(
      makeEvent({
        headers: AUTH_HEADERS,
        body: JSON.stringify({ code: 'NEWYEAR', discount_type: 'percentage', discount_value: 'big' }),
      })
    );
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/must be a number/i);
  });

  it('uppercases the code before storing', async () => {
    mockCreate.mockResolvedValue({ ...MOCK_DISCOUNT, code: 'NEWYEAR' });

    await createDiscount(
      makeEvent({
        headers: AUTH_HEADERS,
        body: JSON.stringify({ code: 'newyear', discount_type: 'percentage', discount_value: 20 }),
      })
    );

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'NEWYEAR' })
    );
  });

  it('returns 201 with the created discount', async () => {
    const created = { ...MOCK_DISCOUNT, code: 'NEWYEAR', discount_value: 20 };
    mockCreate.mockResolvedValue(created);

    const result = await createDiscount(
      makeEvent({ headers: AUTH_HEADERS, body: validBody })
    );

    expect(result.statusCode).toBe(201);
    const body = JSON.parse(result.body);
    expect(body.code).toBe('NEWYEAR');
    expect(body.discount_value).toBe(20);
  });

  it('returns 400 when repository throws a validation error', async () => {
    mockCreate.mockRejectedValue(new Error('Discount value must be positive'));

    const result = await createDiscount(
      makeEvent({ headers: AUTH_HEADERS, body: validBody })
    );

    expect(result.statusCode).toBe(400);
  });

  it('returns 400 when discount code already exists', async () => {
    mockCreate.mockRejectedValue(new Error("Discount code 'NEWYEAR' already exists"));

    const result = await createDiscount(
      makeEvent({ headers: AUTH_HEADERS, body: validBody })
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/already exists/i);
  });

  it('returns 500 on unexpected service error', async () => {
    mockCreate.mockRejectedValue(new Error('DynamoDB failure'));

    const result = await createDiscount(
      makeEvent({ headers: AUTH_HEADERS, body: validBody })
    );

    expect(result.statusCode).toBe(500);
  });

  it('returns 400 when description is not a string', async () => {
    const result = await createDiscount(
      makeEvent({
        headers: AUTH_HEADERS,
        body: JSON.stringify({
          code: 'NEWYEAR',
          discount_type: 'percentage',
          discount_value: 20,
          description: 123,
        }),
      })
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/description must be a string/i);
  });

  it('returns 400 when valid_from is not a valid date string', async () => {
    const result = await createDiscount(
      makeEvent({
        headers: AUTH_HEADERS,
        body: JSON.stringify({
          code: 'NEWYEAR',
          discount_type: 'percentage',
          discount_value: 20,
          valid_from: 'not-a-date',
        }),
      })
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/valid_from must be a valid date string/i);
  });

  it('returns 400 when max_uses is not a positive integer', async () => {
    const result = await createDiscount(
      makeEvent({
        headers: AUTH_HEADERS,
        body: JSON.stringify({
          code: 'NEWYEAR',
          discount_type: 'percentage',
          discount_value: 20,
          max_uses: 0,
        }),
      })
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/max_uses must be a positive integer/i);
  });

  it('returns 400 when is_active is not a boolean', async () => {
    const result = await createDiscount(
      makeEvent({
        headers: AUTH_HEADERS,
        body: JSON.stringify({
          code: 'NEWYEAR',
          discount_type: 'percentage',
          discount_value: 20,
          is_active: 'true',
        }),
      })
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/is_active must be a boolean/i);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// updateDiscount
// ──────────────────────────────────────────────────────────────────────────────

describe('updateDiscount', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    const result = await updateDiscount(
      makeEvent({ pathParameters: { id: '1' }, body: JSON.stringify({ is_active: false }) })
    );
    expect(result.statusCode).toBe(401);
  });

  it('returns 400 when id is missing', async () => {
    const result = await updateDiscount(
      makeEvent({ headers: AUTH_HEADERS, body: JSON.stringify({ is_active: false }) })
    );
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/id is required/i);
  });

  it('returns 400 when id is not a positive integer', async () => {
    const result = await updateDiscount(
      makeEvent({
        headers: AUTH_HEADERS,
        pathParameters: { id: 'xyz' },
        body: JSON.stringify({ is_active: false }),
      })
    );
    expect(result.statusCode).toBe(400);
  });

  it('returns 400 when body is missing', async () => {
    const result = await updateDiscount(
      makeEvent({ headers: AUTH_HEADERS, pathParameters: { id: '1' } })
    );
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/body is required/i);
  });

  it('returns 400 when body is empty object', async () => {
    const result = await updateDiscount(
      makeEvent({
        headers: AUTH_HEADERS,
        pathParameters: { id: '1' },
        body: JSON.stringify({}),
      })
    );
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/at least one field/i);
  });

  it('returns 400 when discount_type is invalid', async () => {
    const result = await updateDiscount(
      makeEvent({
        headers: AUTH_HEADERS,
        pathParameters: { id: '1' },
        body: JSON.stringify({ discount_type: 'bogus' }),
      })
    );
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/discount_type must be one of/i);
  });

  it('returns 404 when discount is not found', async () => {
    mockUpdate.mockResolvedValue(null);

    const result = await updateDiscount(
      makeEvent({
        headers: AUTH_HEADERS,
        pathParameters: { id: '99' },
        body: JSON.stringify({ is_active: false }),
      })
    );

    expect(result.statusCode).toBe(404);
  });

  it('returns 200 with updated discount', async () => {
    const updated = { ...MOCK_DISCOUNT, is_active: false };
    mockUpdate.mockResolvedValue(updated);

    const result = await updateDiscount(
      makeEvent({
        headers: AUTH_HEADERS,
        pathParameters: { id: '1' },
        body: JSON.stringify({ is_active: false }),
      })
    );

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).is_active).toBe(false);
  });

  it('uppercases code when updating it', async () => {
    mockUpdate.mockResolvedValue({ ...MOCK_DISCOUNT, code: 'NEWCODE' });

    await updateDiscount(
      makeEvent({
        headers: AUTH_HEADERS,
        pathParameters: { id: '1' },
        body: JSON.stringify({ code: 'newcode' }),
      })
    );

    expect(mockUpdate).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ code: 'NEWCODE' })
    );
  });

  it('returns 400 when code is not a string', async () => {
    const result = await updateDiscount(
      makeEvent({
        headers: AUTH_HEADERS,
        pathParameters: { id: '1' },
        body: JSON.stringify({ code: 12345 }),
      })
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/code must be a non-empty string/i);
  });

  it('returns 400 when code is an empty string', async () => {
    const result = await updateDiscount(
      makeEvent({
        headers: AUTH_HEADERS,
        pathParameters: { id: '1' },
        body: JSON.stringify({ code: '   ' }),
      })
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/code must be a non-empty string/i);
  });

  it('returns 400 when discount_value is not a finite number', async () => {
    const result = await updateDiscount(
      makeEvent({
        headers: AUTH_HEADERS,
        pathParameters: { id: '1' },
        body: JSON.stringify({ discount_value: 'abc' }),
      })
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/discount_value must be a finite number/i);
  });

  it('returns 400 when max_uses is not a positive integer', async () => {
    const result = await updateDiscount(
      makeEvent({
        headers: AUTH_HEADERS,
        pathParameters: { id: '1' },
        body: JSON.stringify({ max_uses: 1.5 }),
      })
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/max_uses must be a positive integer/i);
  });

  it('returns 400 when is_active is not a boolean', async () => {
    const result = await updateDiscount(
      makeEvent({
        headers: AUTH_HEADERS,
        pathParameters: { id: '1' },
        body: JSON.stringify({ is_active: 'false' }),
      })
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/is_active must be a boolean/i);
  });

  it('returns 400 when valid_until is not a valid date string', async () => {
    const result = await updateDiscount(
      makeEvent({
        headers: AUTH_HEADERS,
        pathParameters: { id: '1' },
        body: JSON.stringify({ valid_until: 'not-a-date' }),
      })
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/valid_until must be a valid date string/i);
  });

  it('returns 500 on service error', async () => {
    mockUpdate.mockRejectedValue(new Error('DynamoDB failure'));

    const result = await updateDiscount(
      makeEvent({
        headers: AUTH_HEADERS,
        pathParameters: { id: '1' },
        body: JSON.stringify({ is_active: false }),
      })
    );

    expect(result.statusCode).toBe(500);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// deleteDiscount
// ──────────────────────────────────────────────────────────────────────────────

describe('deleteDiscount', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    const result = await deleteDiscount(makeEvent({ pathParameters: { id: '1' } }));
    expect(result.statusCode).toBe(401);
  });

  it('returns 400 when id is missing', async () => {
    const result = await deleteDiscount(makeEvent({ headers: AUTH_HEADERS }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/id is required/i);
  });

  it('returns 400 when id is not a positive integer', async () => {
    const result = await deleteDiscount(
      makeEvent({ headers: AUTH_HEADERS, pathParameters: { id: '-1' } })
    );
    expect(result.statusCode).toBe(400);
  });

  it('returns 404 when discount is not found', async () => {
    mockSoftDelete.mockResolvedValue(null);

    const result = await deleteDiscount(
      makeEvent({ headers: AUTH_HEADERS, pathParameters: { id: '99' } })
    );

    expect(result.statusCode).toBe(404);
  });

  it('returns 200 with success message', async () => {
    mockSoftDelete.mockResolvedValue({ ...MOCK_DISCOUNT, deleted_at: NOW });

    const result = await deleteDiscount(
      makeEvent({ headers: AUTH_HEADERS, pathParameters: { id: '1' } })
    );

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).message).toMatch(/deleted/i);
  });

  it('returns 500 on service error', async () => {
    mockSoftDelete.mockRejectedValue(new Error('DynamoDB failure'));

    const result = await deleteDiscount(
      makeEvent({ headers: AUTH_HEADERS, pathParameters: { id: '1' } })
    );

    expect(result.statusCode).toBe(500);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// getStats
// ──────────────────────────────────────────────────────────────────────────────

describe('getStats', () => {
  beforeEach(() => jest.clearAllMocks());

  const MOCK_STATS = {
    code: 'SAVE10',
    times_used: 3,
    max_uses: 10,
    usage_percentage: 30,
    is_active: true,
    is_expired: false,
    is_max_uses_reached: false,
  };

  it('returns 401 when not authenticated', async () => {
    const result = await getStats(makeEvent({ pathParameters: { id: '1' } }));
    expect(result.statusCode).toBe(401);
  });

  it('returns 400 when id is missing', async () => {
    const result = await getStats(makeEvent({ headers: AUTH_HEADERS }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/id is required/i);
  });

  it('returns 400 when id is not a positive integer', async () => {
    const result = await getStats(
      makeEvent({ headers: AUTH_HEADERS, pathParameters: { id: '0' } })
    );
    expect(result.statusCode).toBe(400);
  });

  it('returns 404 when discount is not found', async () => {
    mockFindById.mockResolvedValue(null);

    const result = await getStats(
      makeEvent({ headers: AUTH_HEADERS, pathParameters: { id: '99' } })
    );

    expect(result.statusCode).toBe(404);
  });

  it('returns 200 with stats including usage info', async () => {
    mockFindById.mockResolvedValue(MOCK_DISCOUNT);
    mockGetStats.mockResolvedValue(MOCK_STATS);

    const result = await getStats(
      makeEvent({ headers: AUTH_HEADERS, pathParameters: { id: '1' } })
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.code).toBe('SAVE10');
    expect(body.times_used).toBe(3);
    expect(body.max_uses).toBe(10);
    expect(body.usage_percentage).toBe(30);
    expect(body.is_active).toBe(true);
    expect(body.is_expired).toBe(false);
    expect(body.is_max_uses_reached).toBe(false);
    // discount DTO is embedded
    expect(body.discount.id).toBe(1);
    expect(body.discount.code).toBe('SAVE10');
  });

  it('returns 404 when getStats returns null (code disappeared after findById)', async () => {
    mockFindById.mockResolvedValue(MOCK_DISCOUNT);
    mockGetStats.mockResolvedValue(null);

    const result = await getStats(
      makeEvent({ headers: AUTH_HEADERS, pathParameters: { id: '1' } })
    );

    expect(result.statusCode).toBe(404);
  });

  it('returns 500 on service error', async () => {
    mockFindById.mockRejectedValue(new Error('DynamoDB failure'));

    const result = await getStats(
      makeEvent({ headers: AUTH_HEADERS, pathParameters: { id: '1' } })
    );

    expect(result.statusCode).toBe(500);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Auth middleware (requireAuth)
// ──────────────────────────────────────────────────────────────────────────────

describe('Auth middleware (requireAuth)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('accepts the demo-token for backward compatibility', async () => {
    mockFindAll.mockResolvedValue({ items: [], count: 0, lastEvaluatedKey: undefined });

    const result = await listDiscounts(
      makeEvent({ headers: { Authorization: 'Bearer demo-token-12345' } })
    );

    expect(result.statusCode).toBe(200);
  });

  it('returns 401 for a malformed Authorization header', async () => {
    const result = await listDiscounts(
      makeEvent({ headers: { Authorization: 'Token abc' } })
    );
    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body).error).toMatch(/invalid authorization header format/i);
  });

  it('returns 401 for an expired JWT', async () => {
    const expired = jwt.sign({ id: 1, username: 'artadmin' }, 'test-secret', { expiresIn: -1 });

    const result = await listDiscounts(
      makeEvent({ headers: { Authorization: `Bearer ${expired}` } })
    );

    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body).error).toMatch(/invalid or expired/i);
  });

  it('accepts a lowercase authorization header (API Gateway normalisation)', async () => {
    mockFindAll.mockResolvedValue({ items: [], count: 0, lastEvaluatedKey: undefined });

    const result = await listDiscounts(
      makeEvent({ headers: { authorization: `Bearer ${makeAuthToken()}` } })
    );

    expect(result.statusCode).toBe(200);
  });
});
