/**
 * DiscountCodeRepository - DynamoDB implementation for Discount Code CRUD operations
 * 
 * DynamoDB Structure:
 * PK: "DISCOUNT#${id}"
 * SK: "METADATA"
 * GSI1PK: "DISCOUNT_CODE#${code}"
 * GSI2PK: "DISCOUNT_ACTIVE#${is_active}"
 * GSI2SK: "${valid_until || '9999-12-31'}"
 */

import { DynamoDBOptimized } from '../DynamoDBOptimized';
import {
  DiscountCode,
  DiscountType,
  CreateDiscountCodeData,
  UpdateDiscountCodeData,
  DiscountCodeFilters,
  DiscountCodeStats,
  PaginationParams,
  PaginatedResponse,
} from './types';

export class DiscountCodeRepository {
  private dynamoDB: DynamoDBOptimized;
  private readonly COUNTER_PK = 'COUNTER';
  private readonly COUNTER_SK = 'DISCOUNT_ID';
  
  constructor(dynamoDB: DynamoDBOptimized) {
    this.dynamoDB = dynamoDB;
  }

  /**
   * Get next auto-increment ID using atomic counter
   */
  async getNextId(): Promise<number> {
    const { UpdateCommand } = await import('@aws-sdk/lib-dynamodb');
    const command = new UpdateCommand({
      TableName: (this.dynamoDB as any).tableName || process.env.DYNAMODB_TABLE_NAME,
      Key: {
        PK: this.COUNTER_PK,
        SK: this.COUNTER_SK,
      },
      UpdateExpression: 'SET #v = if_not_exists(#v, :zero) + :one',
      ExpressionAttributeNames: {
        '#v': 'value',
      },
      ExpressionAttributeValues: {
        ':zero': 0,
        ':one': 1,
      },
      ReturnValues: 'ALL_NEW',
    });

    const client = (this.dynamoDB as any).client;
    const result = await client.send(command);
    return result.Attributes?.value || 1;
  }

  /**
   * Map DynamoDB item to DiscountCode interface
   */
  mapToDiscountCode(item: Record<string, any>): DiscountCode {
    return {
      id: item.id,
      code: item.code,
      description: item.description,
      discount_type: item.discount_type as DiscountType,
      discount_value: item.discount_value,
      min_purchase_amount: item.min_purchase_amount,
      max_discount_amount: item.max_discount_amount,
      valid_from: item.valid_from,
      valid_until: item.valid_until,
      max_uses: item.max_uses,
      times_used: item.times_used || 0,
      is_active: item.is_active,
      created_at: item.created_at,
      updated_at: item.updated_at,
      deleted_at: item.deleted_at,
    };
  }

  /**
   * Build DynamoDB item from DiscountCode
   */
  buildDiscountCodeItem(discountCode: DiscountCode): Record<string, any> {
    const item: Record<string, any> = {
      PK: `DISCOUNT#${discountCode.id}`,
      SK: 'METADATA',
      id: discountCode.id,
      code: discountCode.code,
      discount_type: discountCode.discount_type,
      discount_value: discountCode.discount_value,
      times_used: discountCode.times_used,
      is_active: discountCode.is_active,
      valid_from: discountCode.valid_from,
      created_at: discountCode.created_at,
      updated_at: discountCode.updated_at,
      // GSI1 - Discount by code (for uniqueness and lookups)
      GSI1PK: `DISCOUNT_CODE#${discountCode.code}`,
      // GSI2 - Active discounts sorted by expiration
      GSI2PK: `DISCOUNT_ACTIVE#${discountCode.is_active}`,
      GSI2SK: discountCode.valid_until || '9999-12-31',
    };

    // Add optional fields
    if (discountCode.description !== undefined) item.description = discountCode.description;
    if (discountCode.min_purchase_amount !== undefined) item.min_purchase_amount = discountCode.min_purchase_amount;
    if (discountCode.max_discount_amount !== undefined) item.max_discount_amount = discountCode.max_discount_amount;
    if (discountCode.valid_until !== undefined) item.valid_until = discountCode.valid_until;
    if (discountCode.max_uses !== undefined) item.max_uses = discountCode.max_uses;
    if (discountCode.deleted_at !== undefined) item.deleted_at = discountCode.deleted_at;

    return item;
  }

  /**
   * Create a new discount code with auto-increment ID
   * Enforces code uniqueness by checking GSI1 first
   */
  async create(data: CreateDiscountCodeData): Promise<DiscountCode> {
    const now = new Date().toISOString();
    
    // Check if code already exists (enforces uniqueness)
    const existing = await this.findByCode(data.code);
    if (existing) {
      throw new Error(`Discount code '${data.code}' already exists`);
    }

    const id = await this.getNextId();

    const discountCode: DiscountCode = {
      id,
      code: data.code,
      description: data.description,
      discount_type: data.discount_type,
      discount_value: data.discount_value,
      min_purchase_amount: data.min_purchase_amount,
      max_discount_amount: data.max_discount_amount,
      valid_from: data.valid_from || now,
      valid_until: data.valid_until,
      max_uses: data.max_uses,
      times_used: 0,
      is_active: data.is_active !== undefined ? data.is_active : true,
      created_at: now,
      updated_at: now,
    };

    const item = this.buildDiscountCodeItem(discountCode);

    await this.dynamoDB.put({
      item,
      conditionExpression: 'attribute_not_exists(PK)',
    });

    return discountCode;
  }

  /**
   * Find discount code by code using GSI1 (eventually consistent)
   */
  async findByCode(code: string): Promise<DiscountCode | null> {
    const result = await this.dynamoDB.queryEventuallyConsistent({
      indexName: 'GSI1',
      keyConditionExpression: 'GSI1PK = :gsi1pk',
      expressionAttributeValues: {
        ':gsi1pk': `DISCOUNT_CODE#${code}`,
      },
      limit: 1,
    });

    if (result.data.length === 0) {
      return null;
    }

    return this.mapToDiscountCode(result.data[0]);
  }

  /**
   * Find discount code by ID (strongly consistent read)
   */
  async findById(id: number): Promise<DiscountCode | null> {
    const result = await this.dynamoDB.get({
      key: {
        PK: `DISCOUNT#${id}`,
        SK: 'METADATA',
      },
      consistentRead: true,
    });

    if (!result.data) {
      return null;
    }

    return this.mapToDiscountCode(result.data);
  }

  /**
   * Find all discount codes with optional filtering
   * Excludes soft-deleted codes
   */
  async findAll(
    filters?: DiscountCodeFilters,
    params: PaginationParams = {}
  ): Promise<PaginatedResponse<DiscountCode>> {
    // If filtering by is_active, use GSI2 for better performance
    if (filters?.is_active !== undefined) {
      const result = await this.dynamoDB.queryEventuallyConsistent({
        indexName: 'GSI2',
        keyConditionExpression: 'GSI2PK = :gsi2pk',
        expressionAttributeValues: {
          ':gsi2pk': `DISCOUNT_ACTIVE#${filters.is_active}`,
        },
        limit: params.limit || 30,
        exclusiveStartKey: params.lastEvaluatedKey,
        filterExpression: 'attribute_not_exists(deleted_at)',
      });

      return {
        items: result.data.map(item => this.mapToDiscountCode(item)),
        lastEvaluatedKey: result.lastEvaluatedKey,
        count: result.count,
      };
    }

    // Otherwise, query all discounts using a scan-like approach
    // Note: In production, you may want to use a scan or a different GSI
    // For now, we'll query active codes only as a default
    const result = await this.dynamoDB.queryEventuallyConsistent({
      indexName: 'GSI2',
      keyConditionExpression: 'GSI2PK = :gsi2pk',
      expressionAttributeValues: {
        ':gsi2pk': 'DISCOUNT_ACTIVE#true',
      },
      limit: params.limit || 30,
      exclusiveStartKey: params.lastEvaluatedKey,
      filterExpression: 'attribute_not_exists(deleted_at)',
    });

    return {
      items: result.data.map(item => this.mapToDiscountCode(item)),
      lastEvaluatedKey: result.lastEvaluatedKey,
      count: result.count,
    };
  }

  /**
   * Update discount code by ID
   */
  async update(id: number, data: UpdateDiscountCodeData): Promise<DiscountCode | null> {
    const now = new Date().toISOString();
    
    // If updating code, check for uniqueness
    if (data.code !== undefined) {
      const existing = await this.findByCode(data.code);
      if (existing && existing.id !== id) {
        throw new Error(`Discount code '${data.code}' already exists`);
      }
    }

    const updates: Record<string, any> = {
      updated_at: now,
    };

    // Build updates object with only provided fields
    if (data.code !== undefined) updates.code = data.code;
    if (data.description !== undefined) updates.description = data.description;
    if (data.discount_type !== undefined) updates.discount_type = data.discount_type;
    if (data.discount_value !== undefined) updates.discount_value = data.discount_value;
    if (data.min_purchase_amount !== undefined) updates.min_purchase_amount = data.min_purchase_amount;
    if (data.max_discount_amount !== undefined) updates.max_discount_amount = data.max_discount_amount;
    if (data.valid_from !== undefined) updates.valid_from = data.valid_from;
    if (data.valid_until !== undefined) updates.valid_until = data.valid_until;
    if (data.max_uses !== undefined) updates.max_uses = data.max_uses;
    if (data.is_active !== undefined) updates.is_active = data.is_active;

    // Update GSI attributes if relevant fields are changed
    if (data.code !== undefined) {
      updates.GSI1PK = `DISCOUNT_CODE#${data.code}`;
    }

    // For GSI2, we need to update both PK and SK if is_active or valid_until changes
    const needsGSI2Update = data.is_active !== undefined || data.valid_until !== undefined;
    
    if (needsGSI2Update) {
      const current = await this.findById(id);
      if (!current) return null;
      
      const newIsActive = data.is_active !== undefined ? data.is_active : current.is_active;
      const newValidUntil = data.valid_until !== undefined ? data.valid_until : current.valid_until;
      
      updates.GSI2PK = `DISCOUNT_ACTIVE#${newIsActive}`;
      updates.GSI2SK = newValidUntil || '9999-12-31';
    }

    try {
      const result = await this.dynamoDB.update({
        key: {
          PK: `DISCOUNT#${id}`,
          SK: 'METADATA',
        },
        updates,
        conditionExpression: 'attribute_exists(PK)',
        returnValues: 'ALL_NEW',
      });

      if (!result.data) {
        return null;
      }

      return this.mapToDiscountCode(result.data);
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException' || error.code === 'ConditionalCheckFailedException') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Soft delete discount code (set deleted_at)
   */
  async softDelete(id: number): Promise<DiscountCode | null> {
    try {
      const result = await this.dynamoDB.softDelete({
        key: {
          PK: `DISCOUNT#${id}`,
          SK: 'METADATA',
        },
        deletedAtField: 'deleted_at',
      });

      if (!result.data) {
        return null;
      }

      return this.mapToDiscountCode(result.data);
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException' || error.code === 'ConditionalCheckFailedException') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Check if discount code is valid
   * A code is valid if it's active, not expired, and hasn't reached max uses
   */
  async isValid(code: string): Promise<boolean> {
    const discountCode = await this.findByCode(code);
    
    if (!discountCode || discountCode.deleted_at) {
      return false;
    }

    // Check if active
    if (!discountCode.is_active) {
      return false;
    }

    // Check if expired
    const now = new Date().toISOString();
    if (discountCode.valid_from && now < discountCode.valid_from) {
      return false;
    }
    if (discountCode.valid_until && now > discountCode.valid_until) {
      return false;
    }

    // Check if max uses reached
    if (discountCode.max_uses !== undefined && discountCode.times_used >= discountCode.max_uses) {
      return false;
    }

    return true;
  }

  /**
   * Increment usage counter atomically
   * Returns the updated discount code or null if code doesn't exist or is invalid
   */
  async incrementUsage(code: string): Promise<DiscountCode | null> {
    // First verify the code is valid
    const isCodeValid = await this.isValid(code);
    if (!isCodeValid) {
      return null;
    }

    const discountCode = await this.findByCode(code);
    if (!discountCode) {
      return null;
    }

    // Use atomic ADD operation to increment times_used
    const { UpdateCommand } = await import('@aws-sdk/lib-dynamodb');
    
    // Build condition to prevent incrementing beyond max_uses
    let conditionExpression = 'attribute_exists(PK)';
    const expressionAttributeValues: Record<string, any> = {
      ':one': 1,
      ':now': new Date().toISOString(),
    };

    if (discountCode.max_uses !== undefined) {
      conditionExpression += ' AND times_used < :max_uses';
      expressionAttributeValues[':max_uses'] = discountCode.max_uses;
    }

    const command = new UpdateCommand({
      TableName: (this.dynamoDB as any).tableName || process.env.DYNAMODB_TABLE_NAME,
      Key: {
        PK: `DISCOUNT#${discountCode.id}`,
        SK: 'METADATA',
      },
      UpdateExpression: 'ADD times_used :one SET updated_at = :now',
      ExpressionAttributeValues: expressionAttributeValues,
      ConditionExpression: conditionExpression,
      ReturnValues: 'ALL_NEW',
    });

    try {
      const client = (this.dynamoDB as any).client;
      const result = await client.send(command);
      
      if (!result.Attributes) {
        return null;
      }

      return this.mapToDiscountCode(result.Attributes);
    } catch (error: any) {
      // If condition fails (max uses reached or item doesn't exist), return null
      if (error.name === 'ConditionalCheckFailedException' || error.code === 'ConditionalCheckFailedException') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get usage statistics for a discount code
   */
  async getStats(code: string): Promise<DiscountCodeStats | null> {
    const discountCode = await this.findByCode(code);
    
    if (!discountCode) {
      return null;
    }

    const now = new Date().toISOString();
    const isExpired = discountCode.valid_until ? now > discountCode.valid_until : false;
    const isMaxUsesReached = discountCode.max_uses !== undefined 
      ? discountCode.times_used >= discountCode.max_uses 
      : false;

    const usagePercentage = discountCode.max_uses !== undefined
      ? (discountCode.times_used / discountCode.max_uses) * 100
      : undefined;

    return {
      code: discountCode.code,
      times_used: discountCode.times_used,
      max_uses: discountCode.max_uses,
      usage_percentage: usagePercentage,
      is_active: discountCode.is_active,
      is_expired: isExpired,
      is_max_uses_reached: isMaxUsesReached,
    };
  }
}
