import { DynamoDBHelper, EntityPrefix, GSI } from '../database/dynamodb-client';
import { v4 as uuidv4 } from 'uuid';

export interface AuditLog {
  id: string;
  user_id?: number;
  action: string;
  entity_type: string;
  entity_id?: string | number;
  changes?: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
  expires_at: string; // TTL - 365 days
}

const AUDIT_TTL_DAYS = 365;

export class AuditLogRepository {
  
  /**
   * Create a new audit log entry
   */
  static async create(data: Omit<AuditLog, 'id' | 'created_at' | 'expires_at'>): Promise<AuditLog> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + AUDIT_TTL_DAYS * 24 * 60 * 60 * 1000);
    const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const id = `${dateStr}#${uuidv4()}`;
    
    const audit: AuditLog = {
      ...data,
      id,
      created_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    };

    await DynamoDBHelper.put({
      PK: `${EntityPrefix.AUDIT}#${id}`,
      SK: 'METADATA',
      // For querying by entity
      GSI1PK: `AUDIT_ENTITY#${data.entity_type}#${data.entity_id || 'NONE'}`,
      GSI1SK: now.toISOString(),
      // For querying by user
      GSI2PK: data.user_id ? `AUDIT_USER#${data.user_id}` : 'AUDIT_SYSTEM',
      GSI2SK: now.toISOString(),
      // For querying by action
      GSI3PK: `AUDIT_ACTION#${data.action}`,
      GSI3SK: now.toISOString(),
      _type: 'AuditLog',
      ttl: Math.floor(expiresAt.getTime() / 1000),
      ...audit,
    });

    return audit;
  }

  /**
   * Find audit logs by entity
   */
  static async findByEntity(entityType: string, entityId?: string | number): Promise<AuditLog[]> {
    const pk = entityId 
      ? `AUDIT_ENTITY#${entityType}#${entityId}`
      : `AUDIT_ENTITY#${entityType}#NONE`;

    const items = await DynamoDBHelper.query({
      indexName: GSI.GSI1,
      keyConditionExpression: 'GSI1PK = :pk',
      expressionAttributeValues: {
        ':pk': pk,
      },
      scanIndexForward: false, // Most recent first
    });

    return items.map(this.mapToAuditLog);
  }

  /**
   * Find audit logs by user
   */
  static async findByUser(userId: number): Promise<AuditLog[]> {
    const items = await DynamoDBHelper.query({
      indexName: GSI.GSI2,
      keyConditionExpression: 'GSI2PK = :pk',
      expressionAttributeValues: {
        ':pk': `AUDIT_USER#${userId}`,
      },
      scanIndexForward: false,
    });

    return items.map(this.mapToAuditLog);
  }

  /**
   * Find audit logs by action
   */
  static async findByAction(action: string): Promise<AuditLog[]> {
    const items = await DynamoDBHelper.query({
      indexName: GSI.GSI3,
      keyConditionExpression: 'GSI3PK = :pk',
      expressionAttributeValues: {
        ':pk': `AUDIT_ACTION#${action}`,
      },
      scanIndexForward: false,
    });

    return items.map(this.mapToAuditLog);
  }

  /**
   * Find audit logs within date range
   */
  static async findByDateRange(startDate: string, endDate: string, limit: number = 100): Promise<AuditLog[]> {
    const items = await DynamoDBHelper.scan({
      filterExpression: 'entity_type = :type AND created_at BETWEEN :start AND :end',
      expressionAttributeValues: {
        ':type': 'AuditLog',
        ':start': startDate,
        ':end': endDate,
      },
      limit,
    });

    return items
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map(this.mapToAuditLog);
  }

  /**
   * Get recent audit logs
   */
  static async getRecent(limit: number = 50): Promise<AuditLog[]> {
    const items = await DynamoDBHelper.scan({
      filterExpression: 'entity_type = :type',
      expressionAttributeValues: {
        ':type': 'AuditLog',
      },
      limit: limit * 2, // Get more than needed for sorting
    });

    return items
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit)
      .map(this.mapToAuditLog);
  }

  /**
   * Log a product action
   */
  static async logProductAction(
    action: 'create' | 'update' | 'delete',
    productId: number,
    changes?: Record<string, any>,
    userId?: number,
    ipAddress?: string
  ): Promise<AuditLog> {
    return this.create({
      user_id: userId,
      action: `product.${action}`,
      entity_type: 'Product',
      entity_id: productId,
      changes,
      ip_address: ipAddress,
    });
  }

  /**
   * Log an order action
   */
  static async logOrderAction(
    action: 'create' | 'update' | 'status_change' | 'payment' | 'fulfillment',
    orderId: number,
    changes?: Record<string, any>,
    userId?: number,
    ipAddress?: string
  ): Promise<AuditLog> {
    return this.create({
      user_id: userId,
      action: `order.${action}`,
      entity_type: 'Order',
      entity_id: orderId,
      changes,
      ip_address: ipAddress,
    });
  }

  /**
   * Log a login action
   */
  static async logLogin(userId: number, ipAddress?: string, userAgent?: string): Promise<AuditLog> {
    return this.create({
      user_id: userId,
      action: 'auth.login',
      entity_type: 'User',
      entity_id: userId,
      ip_address: ipAddress,
      user_agent: userAgent,
    });
  }

  private static mapToAuditLog(item: any): AuditLog {
    const { PK, SK, GSI1PK, GSI1SK, GSI2PK, GSI2SK, GSI3PK, GSI3SK, ttl, ...audit } = item;
    // Remove entity_type from the output since it's internal
    const { entity_type: _, ...cleanAudit } = audit;
    return {
      ...cleanAudit,
      entity_type: audit.entity_type === 'AuditLog' ? audit.entity_type : audit.entity_type,
    } as AuditLog;
  }
}
