import { DynamoDBHelper, EntityPrefix, GSI } from '../database/dynamodb-client';

export enum DiscountType {
  PERCENTAGE = 'percentage',
  FIXED = 'fixed',
}

export interface DiscountCode {
  id: number;
  code: string;
  type: DiscountType;
  value: number;
  min_order_value?: number;
  max_uses?: number;
  times_used: number;
  valid_from?: string;
  valid_until?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export class DiscountCodeRepository {
  
  /**
   * Create a new discount code
   */
  static async create(data: Omit<DiscountCode, 'id' | 'times_used' | 'created_at' | 'updated_at'>): Promise<DiscountCode> {
    const id = await DynamoDBHelper.getNextId(EntityPrefix.DISCOUNT);
    const now = new Date().toISOString();
    
    const discount: DiscountCode = {
      ...data,
      id,
      times_used: 0,
      created_at: now,
      updated_at: now,
    };

    await DynamoDBHelper.put({
      PK: `${EntityPrefix.DISCOUNT}#${id}`,
      SK: 'METADATA',
      GSI1PK: `DISCOUNT_CODE#${data.code.toUpperCase()}`,
      GSI1SK: 'METADATA',
      GSI2PK: `DISCOUNT_ACTIVE#${data.is_active}`,
      GSI2SK: now,
      entity_type: 'DiscountCode',
      ...discount,
    });

    return discount;
  }

  /**
   * Find discount by ID
   */
  static async findById(id: number, includeDeleted: boolean = false): Promise<DiscountCode | null> {
    const item = await DynamoDBHelper.get(`${EntityPrefix.DISCOUNT}#${id}`, 'METADATA');
    if (!item) return null;
    if (!includeDeleted && item.deleted_at) return null;
    return this.mapToDiscountCode(item);
  }

  /**
   * Find discount by code
   */
  static async findByCode(code: string): Promise<DiscountCode | null> {
    const items = await DynamoDBHelper.query({
      indexName: GSI.GSI1,
      keyConditionExpression: 'GSI1PK = :pk',
      expressionAttributeValues: {
        ':pk': `DISCOUNT_CODE#${code.toUpperCase()}`,
      },
      limit: 1,
    });

    if (items.length === 0 || items[0].deleted_at) return null;
    return this.mapToDiscountCode(items[0]);
  }

  /**
   * Find all active discount codes
   */
  static async findActive(): Promise<DiscountCode[]> {
    const items = await DynamoDBHelper.query({
      indexName: GSI.GSI2,
      keyConditionExpression: 'GSI2PK = :pk',
      expressionAttributeValues: {
        ':pk': 'DISCOUNT_ACTIVE#true',
      },
    });

    const now = new Date().toISOString();
    return items
      .filter(item => !item.deleted_at)
      .filter(item => !item.valid_from || item.valid_from <= now)
      .filter(item => !item.valid_until || item.valid_until >= now)
      .map(this.mapToDiscountCode);
  }

  /**
   * Find all discount codes
   */
  static async findAll(includeDeleted: boolean = false): Promise<DiscountCode[]> {
    const items = await DynamoDBHelper.scan({
      filterExpression: 'entity_type = :type',
      expressionAttributeValues: {
        ':type': 'DiscountCode',
      },
    });

    return items
      .filter(item => includeDeleted || !item.deleted_at)
      .map(this.mapToDiscountCode);
  }

  /**
   * Validate a discount code
   */
  static async validate(code: string, orderTotal: number): Promise<{ valid: boolean; discount?: DiscountCode; error?: string }> {
    const discount = await this.findByCode(code);
    
    if (!discount) {
      return { valid: false, error: 'Invalid discount code' };
    }

    if (!discount.is_active) {
      return { valid: false, error: 'Discount code is inactive' };
    }

    const now = new Date().toISOString();
    if (discount.valid_from && discount.valid_from > now) {
      return { valid: false, error: 'Discount code is not yet valid' };
    }

    if (discount.valid_until && discount.valid_until < now) {
      return { valid: false, error: 'Discount code has expired' };
    }

    if (discount.max_uses && discount.times_used >= discount.max_uses) {
      return { valid: false, error: 'Discount code has reached maximum uses' };
    }

    if (discount.min_order_value && orderTotal < discount.min_order_value) {
      return { valid: false, error: `Minimum order value is ${discount.min_order_value}` };
    }

    return { valid: true, discount };
  }

  /**
   * Calculate discount amount
   */
  static calculateDiscount(discount: DiscountCode, orderTotal: number): number {
    if (discount.type === DiscountType.PERCENTAGE) {
      return orderTotal * (discount.value / 100);
    } else {
      return Math.min(discount.value, orderTotal);
    }
  }

  /**
   * Increment usage count
   */
  static async incrementUsage(id: number): Promise<void> {
    await DynamoDBHelper.update(
      `${EntityPrefix.DISCOUNT}#${id}`,
      'METADATA',
      'SET times_used = times_used + :inc, updated_at = :updated_at',
      {
        ':inc': 1,
        ':updated_at': new Date().toISOString(),
      }
    );
  }

  /**
   * Update a discount code
   */
  static async update(id: number, data: Partial<DiscountCode>): Promise<DiscountCode> {
    const { id: _, created_at: __, ...updateData } = data as any;
    
    const { updateExpression, expressionAttributeValues, expressionAttributeNames } = 
      DynamoDBHelper.buildUpdateExpression(updateData);

    const result = await DynamoDBHelper.update(
      `${EntityPrefix.DISCOUNT}#${id}`,
      'METADATA',
      updateExpression,
      expressionAttributeValues,
      expressionAttributeNames
    );

    return this.mapToDiscountCode(result);
  }

  /**
   * Soft delete
   */
  static async softDelete(id: number): Promise<void> {
    await DynamoDBHelper.softDelete(`${EntityPrefix.DISCOUNT}#${id}`, 'METADATA');
  }

  private static mapToDiscountCode(item: any): DiscountCode {
    const { PK, SK, GSI1PK, GSI1SK, GSI2PK, GSI2SK, entity_type, ...discount } = item;
    return discount as DiscountCode;
  }
}
