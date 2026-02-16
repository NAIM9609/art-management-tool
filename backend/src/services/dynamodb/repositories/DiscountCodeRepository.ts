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
   * Validate discount code input data
   */
  private validateDiscountCodeData(data: CreateDiscountCodeData | UpdateDiscountCodeData): void {
    // Validate code format (alphanumeric, 3-50 characters, uppercase recommended)
    if ('code' in data && data.code !== undefined) {
      const codePattern = /^[A-Z0-9_-]{3,50}$/i;
      if (!codePattern.test(data.code)) {
        throw new Error('Discount code must be 3-50 alphanumeric characters (letters, numbers, hyphens, underscores)');
      }
    }

    // Validate discount_value based on discount_type
    if (data.discount_value !== undefined) {
      if (data.discount_value <= 0) {
        throw new Error('Discount value must be positive');
      }
      
      // For percentage discounts, ensure value is between 0-100
      if ('discount_type' in data && data.discount_type === DiscountType.PERCENTAGE) {
        if (data.discount_value > 100) {
          throw new Error('Percentage discount value must be between 0 and 100');
        }
      }
    }

    // Validate date range: valid_from must be before valid_until
    const validFrom = 'valid_from' in data ? data.valid_from : undefined;
    const validUntil = 'valid_until' in data ? data.valid_until : undefined;
    
    if (validFrom && validUntil && validFrom >= validUntil) {
      throw new Error('valid_from must be before valid_until');
    }

    // Validate min_purchase_amount and max_discount_amount relationship
    if (data.min_purchase_amount !== undefined && data.min_purchase_amount < 0) {
      throw new Error('min_purchase_amount must be non-negative');
    }
    
    if (data.max_discount_amount !== undefined && data.max_discount_amount <= 0) {
      throw new Error('max_discount_amount must be positive');
    }
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
   * Note: Uses conditional expression on GSI1PK to prevent race conditions in uniqueness enforcement.
   * However, DynamoDB doesn't support conditional expressions on GSI attributes during put operations.
   * For true uniqueness guarantee, consider using a transactional write or separate uniqueness table.
   */
  async create(data: CreateDiscountCodeData): Promise<DiscountCode> {
    const now = new Date().toISOString();
    
    // Validate input data
    this.validateDiscountCodeData(data);

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

    try {
      await this.dynamoDB.put({
        item,
        conditionExpression: 'attribute_not_exists(PK)',
      });
    } catch (error: any) {
      // Check if it's a duplicate code by querying after failure
      if (error.name === 'ConditionalCheckFailedException' || error.code === 'ConditionalCheckFailedException') {
        const existing = await this.findByCode(data.code);
        if (existing) {
          throw new Error(`Discount code '${data.code}' already exists`);
        }
      }
      throw error;
    }

    return discountCode;
  }

  /**
   * Find discount code by code using GSI1 (eventually consistent)
   * Excludes soft-deleted codes
   */
  async findByCode(code: string): Promise<DiscountCode | null> {
    const result = await this.dynamoDB.queryEventuallyConsistent({
      indexName: 'GSI1',
      keyConditionExpression: 'GSI1PK = :gsi1pk',
      expressionAttributeValues: {
        ':gsi1pk': `DISCOUNT_CODE#${code}`,
      },
      filterExpression: 'attribute_not_exists(deleted_at)',
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
   * Note: When no filter is provided, defaults to querying only active codes for cost optimization.
   * To get all codes regardless of status, explicitly pass is_active filter or use a scan operation.
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

    // Default behavior: query only active codes for cost optimization
    // Note: This is intentional - to get inactive codes, explicitly set is_active: false
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
   * Prevents updating soft-deleted codes
   */
  async update(id: number, data: UpdateDiscountCodeData): Promise<DiscountCode | null> {
    const now = new Date().toISOString();
    
    // Validate input data
    this.validateDiscountCodeData(data);
    
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
        conditionExpression: 'attribute_exists(PK) AND attribute_not_exists(deleted_at)',
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
   * Note: All validation is done atomically in the conditional expression to prevent TOCTOU race conditions
   */
  async incrementUsage(code: string): Promise<DiscountCode | null> {
    const discountCode = await this.findByCode(code);
    if (!discountCode) {
      return null;
    }

    // Use atomic ADD operation to increment times_used with comprehensive validation
    const { UpdateCommand } = await import('@aws-sdk/lib-dynamodb');
    
    const now = new Date().toISOString();
    
    // Build comprehensive condition to validate all requirements atomically
    const conditionParts = [
      'attribute_exists(PK)',
      'attribute_not_exists(deleted_at)',
      'is_active = :true',
    ];
    
    const expressionAttributeValues: Record<string, any> = {
      ':one': 1,
      ':now': now,
      ':true': true,
    };

    // Check valid_from (if exists, must be <= now)
    if (discountCode.valid_from) {
      conditionParts.push('valid_from <= :now_check');
      expressionAttributeValues[':now_check'] = now;
    }

    // Check valid_until (if exists, must be >= now)
    if (discountCode.valid_until) {
      conditionParts.push('valid_until >= :now_check');
      if (!expressionAttributeValues[':now_check']) {
        expressionAttributeValues[':now_check'] = now;
      }
    }

    // Check max_uses (if exists, times_used must be < max_uses)
    if (discountCode.max_uses !== undefined) {
      conditionParts.push('times_used < :max_uses');
      expressionAttributeValues[':max_uses'] = discountCode.max_uses;
    }

    const conditionExpression = conditionParts.join(' AND ');

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
      // If condition fails (max uses reached, expired, inactive, or item doesn't exist), return null
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
