/**
 * Discount Service Lambda Handlers
 *
 * Endpoints:
 *   POST   /api/discounts/validate          -> validateCode    (public)
 *   GET    /api/admin/discounts             -> listDiscounts   (admin)
 *   GET    /api/admin/discounts/{id}        -> getDiscount     (admin)
 *   POST   /api/admin/discounts             -> createDiscount  (admin)
 *   PUT    /api/admin/discounts/{id}        -> updateDiscount  (admin)
 *   DELETE /api/admin/discounts/{id}        -> deleteDiscount  (admin)
 *   GET    /api/admin/discounts/{id}/stats  -> getStats        (admin)
 */

import { DynamoDBOptimized } from '../../../../src/services/dynamodb/DynamoDBOptimized';
import { DiscountCodeRepository } from '../../../../src/services/dynamodb/repositories/DiscountCodeRepository';
import {
  DiscountCode,
  DiscountType,
  CreateDiscountCodeData,
  UpdateDiscountCodeData,
} from '../../../../src/services/dynamodb/repositories/types';
import { requireAuth, AuthError } from '../auth';
import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  successResponse,
  errorResponse,
} from '../types';

/**
 * DTO exposed to API consumers — omits internal DynamoDB fields.
 */
export interface DiscountDTO {
  id: number;
  code: string;
  description?: string;
  discount_type: DiscountType;
  discount_value: number;
  min_purchase_amount?: number;
  max_discount_amount?: number;
  valid_from: string;
  valid_until?: string;
  max_uses?: number;
  times_used: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

function toDTO(discount: DiscountCode): DiscountDTO {
  return {
    id: discount.id,
    code: discount.code,
    description: discount.description,
    discount_type: discount.discount_type,
    discount_value: discount.discount_value,
    min_purchase_amount: discount.min_purchase_amount,
    max_discount_amount: discount.max_discount_amount,
    valid_from: discount.valid_from,
    valid_until: discount.valid_until,
    max_uses: discount.max_uses,
    times_used: discount.times_used,
    is_active: discount.is_active,
    created_at: discount.created_at,
    updated_at: discount.updated_at,
  };
}

let discountRepo: DiscountCodeRepository | null = null;

function getRepository(): DiscountCodeRepository {
  if (!discountRepo) {
    const db = new DynamoDBOptimized({
      tableName: process.env.DYNAMODB_TABLE_NAME,
      region: process.env.AWS_REGION || 'us-east-1',
    });
    discountRepo = new DiscountCodeRepository(db);
  }
  return discountRepo;
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
      message.includes('validation') ||
      message.includes('invalid') ||
      message.includes('required') ||
      message.includes('already exists') ||
      message.includes('must be')
    ) {
      return errorResponse(error.message, 400);
    }
  }
  return errorResponse('Internal server error', 500);
}

/**
 * Calculate the discount amount for a given cart total and discount code.
 * Returns 0 when the cart total is below min_purchase_amount.
 */
function calculateDiscountAmount(discount: DiscountCode, cartTotal: number): number {
  if (discount.min_purchase_amount !== undefined && cartTotal < discount.min_purchase_amount) {
    return 0;
  }

  let amount: number;
  if (discount.discount_type === DiscountType.PERCENTAGE) {
    amount = (cartTotal * discount.discount_value) / 100;
  } else {
    amount = discount.discount_value;
  }

  if (discount.max_discount_amount !== undefined) {
    amount = Math.min(amount, discount.max_discount_amount);
  }

  // Discount cannot exceed the cart total
  return Math.min(amount, cartTotal);
}

/**
 * Check all validity conditions for a discount code against a given cart total.
 * Returns a reason string when invalid, or null when valid.
 */
function getInvalidReason(discount: DiscountCode, cartTotal: number): string | null {
  if (!discount.is_active) {
    return 'Discount code is not active';
  }

  const now = new Date().toISOString();

  if (discount.valid_from && now < discount.valid_from) {
    return 'Discount code is not yet valid';
  }

  if (discount.valid_until && now > discount.valid_until) {
    return 'Discount code has expired';
  }

  if (discount.max_uses !== undefined && discount.times_used >= discount.max_uses) {
    return 'Discount code has reached its maximum number of uses';
  }

  if (discount.min_purchase_amount !== undefined && cartTotal < discount.min_purchase_amount) {
    return `Minimum order value of ${discount.min_purchase_amount} is required`;
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public Handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/discounts/validate
 * Validate a discount code against the provided cart total.
 * Does NOT increment the usage counter — that should happen at checkout.
 */
export async function validateCode(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    if (!event.body) {
      return errorResponse('Request body is required', 400);
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(event.body);
    } catch {
      return errorResponse('Invalid JSON in request body', 400);
    }

    const { code, cartTotal } = body;

    if (!code || typeof code !== 'string' || code.trim() === '') {
      return errorResponse('code is required', 400);
    }

    if (cartTotal === undefined || cartTotal === null) {
      return errorResponse('cartTotal is required', 400);
    }

    if (typeof cartTotal !== 'number' || cartTotal < 0) {
      return errorResponse('cartTotal must be a non-negative number', 400);
    }

    const repo = getRepository();
    const discount = await repo.findByCode(code.trim().toUpperCase());

    if (!discount) {
      return successResponse({ valid: false, discount: null, calculatedAmount: 0 });
    }

    const invalidReason = getInvalidReason(discount, cartTotal);
    if (invalidReason) {
      return successResponse({
        valid: false,
        discount: toDTO(discount),
        calculatedAmount: 0,
        reason: invalidReason,
      });
    }

    const calculatedAmount = calculateDiscountAmount(discount, cartTotal);

    return successResponse({
      valid: true,
      discount: toDTO(discount),
      calculatedAmount,
    });
  } catch (error) {
    return handleError(error);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin Handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/discounts
 * List discount codes with optional filtering and cursor-based pagination.
 */
export async function listDiscounts(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    requireAuth(event);

    const qs = event.queryStringParameters || {};
    const filters: { is_active?: boolean } = {};

    if (qs.is_active !== undefined) {
      filters.is_active = qs.is_active === 'true';
    }

    const limit = qs.limit ? Math.min(100, Math.max(1, parseInt(qs.limit, 10) || 30)) : 30;
    const lastEvaluatedKey = qs.cursor
      ? JSON.parse(Buffer.from(qs.cursor, 'base64').toString('utf8'))
      : undefined;

    const repo = getRepository();
    const result = await repo.findAll(filters, { limit, lastEvaluatedKey });

    const nextCursor = result.lastEvaluatedKey
      ? Buffer.from(JSON.stringify(result.lastEvaluatedKey)).toString('base64')
      : undefined;

    return successResponse({
      discounts: result.items.map(toDTO),
      count: result.count,
      nextCursor,
    });
  } catch (error) {
    return handleError(error);
  }
}

/**
 * GET /api/admin/discounts/{id}
 * Get a single discount code by numeric ID.
 */
export async function getDiscount(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    requireAuth(event);

    const idParam = event.pathParameters?.id;
    if (!idParam) {
      return errorResponse('id is required', 400);
    }

    const id = parseInt(idParam, 10);
    if (isNaN(id) || id <= 0) {
      return errorResponse('id must be a positive integer', 400);
    }

    const repo = getRepository();
    const discount = await repo.findById(id);

    if (!discount) {
      return errorResponse('Discount code not found', 404);
    }

    return successResponse(toDTO(discount));
  } catch (error) {
    return handleError(error);
  }
}

/**
 * POST /api/admin/discounts
 * Create a new discount code.
 */
export async function createDiscount(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    requireAuth(event);

    if (!event.body) {
      return errorResponse('Request body is required', 400);
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(event.body);
    } catch {
      return errorResponse('Invalid JSON in request body', 400);
    }

    if (!body.code || typeof body.code !== 'string' || body.code.trim() === '') {
      return errorResponse('code is required', 400);
    }

    if (!body.discount_type) {
      return errorResponse('discount_type is required', 400);
    }

    if (!Object.values(DiscountType).includes(body.discount_type as DiscountType)) {
      return errorResponse(
        `discount_type must be one of: ${Object.values(DiscountType).join(', ')}`,
        400
      );
    }

    if (body.discount_value === undefined || body.discount_value === null) {
      return errorResponse('discount_value is required', 400);
    }

    if (typeof body.discount_value !== 'number') {
      return errorResponse('discount_value must be a number', 400);
    }

    const data: CreateDiscountCodeData = {
      code: (body.code as string).trim().toUpperCase(),
      discount_type: body.discount_type as DiscountType,
      discount_value: body.discount_value as number,
    };

    if (body.description !== undefined) data.description = body.description as string;
    if (body.min_purchase_amount !== undefined)
      data.min_purchase_amount = body.min_purchase_amount as number;
    if (body.max_discount_amount !== undefined)
      data.max_discount_amount = body.max_discount_amount as number;
    if (body.valid_from !== undefined) data.valid_from = body.valid_from as string;
    if (body.valid_until !== undefined) data.valid_until = body.valid_until as string;
    if (body.max_uses !== undefined) data.max_uses = body.max_uses as number;
    if (body.is_active !== undefined) data.is_active = body.is_active as boolean;

    const repo = getRepository();
    const discount = await repo.create(data);

    return successResponse(toDTO(discount), 201);
  } catch (error) {
    return handleError(error);
  }
}

/**
 * PUT /api/admin/discounts/{id}
 * Update an existing discount code.
 */
export async function updateDiscount(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    requireAuth(event);

    const idParam = event.pathParameters?.id;
    if (!idParam) {
      return errorResponse('id is required', 400);
    }

    const id = parseInt(idParam, 10);
    if (isNaN(id) || id <= 0) {
      return errorResponse('id must be a positive integer', 400);
    }

    if (!event.body) {
      return errorResponse('Request body is required', 400);
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(event.body);
    } catch {
      return errorResponse('Invalid JSON in request body', 400);
    }

    if (Object.keys(body).length === 0) {
      return errorResponse('At least one field is required for update', 400);
    }

    if (
      body.discount_type !== undefined &&
      !Object.values(DiscountType).includes(body.discount_type as DiscountType)
    ) {
      return errorResponse(
        `discount_type must be one of: ${Object.values(DiscountType).join(', ')}`,
        400
      );
    }

    const data: UpdateDiscountCodeData = {};

    if (body.code !== undefined) data.code = (body.code as string).trim().toUpperCase();
    if (body.description !== undefined) data.description = body.description as string;
    if (body.discount_type !== undefined) data.discount_type = body.discount_type as DiscountType;
    if (body.discount_value !== undefined) data.discount_value = body.discount_value as number;
    if (body.min_purchase_amount !== undefined)
      data.min_purchase_amount = body.min_purchase_amount as number;
    if (body.max_discount_amount !== undefined)
      data.max_discount_amount = body.max_discount_amount as number;
    if (body.valid_from !== undefined) data.valid_from = body.valid_from as string;
    if (body.valid_until !== undefined) data.valid_until = body.valid_until as string;
    if (body.max_uses !== undefined) data.max_uses = body.max_uses as number;
    if (body.is_active !== undefined) data.is_active = body.is_active as boolean;

    const repo = getRepository();
    const discount = await repo.update(id, data);

    if (!discount) {
      return errorResponse('Discount code not found', 404);
    }

    return successResponse(toDTO(discount));
  } catch (error) {
    return handleError(error);
  }
}

/**
 * DELETE /api/admin/discounts/{id}
 * Soft-delete a discount code.
 */
export async function deleteDiscount(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    requireAuth(event);

    const idParam = event.pathParameters?.id;
    if (!idParam) {
      return errorResponse('id is required', 400);
    }

    const id = parseInt(idParam, 10);
    if (isNaN(id) || id <= 0) {
      return errorResponse('id must be a positive integer', 400);
    }

    const repo = getRepository();
    const deleted = await repo.softDelete(id);

    if (!deleted) {
      return errorResponse('Discount code not found', 404);
    }

    return successResponse({ message: 'Discount code deleted' });
  } catch (error) {
    return handleError(error);
  }
}

/**
 * GET /api/admin/discounts/{id}/stats
 * Return usage statistics for a discount code.
 */
export async function getStats(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    requireAuth(event);

    const idParam = event.pathParameters?.id;
    if (!idParam) {
      return errorResponse('id is required', 400);
    }

    const id = parseInt(idParam, 10);
    if (isNaN(id) || id <= 0) {
      return errorResponse('id must be a positive integer', 400);
    }

    const repo = getRepository();
    const discount = await repo.findById(id);

    if (!discount) {
      return errorResponse('Discount code not found', 404);
    }

    const stats = await repo.getStats(discount.code);

    if (!stats) {
      return errorResponse('Discount code not found', 404);
    }

    return successResponse({
      ...stats,
      discount: toDTO(discount),
    });
  } catch (error) {
    return handleError(error);
  }
}
