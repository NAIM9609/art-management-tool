/**
 * AuditLogRepository - DynamoDB implementation for Audit Log operations
 * 
 * DynamoDB Structure:
 * PK: "AUDIT#${date}#${uuid}"
 * SK: "METADATA"
 * GSI1PK: "AUDIT_ENTITY#${entity_type}#${entity_id}"
 * GSI1SK: "${created_at}"
 * GSI2PK: "AUDIT_USER#${user_id}"
 * GSI2SK: "${created_at}"
 * expires_at: timestamp (TTL = created_at + 365 days)
 * 
 * Cost Optimizations:
 * - Append-only (no updates/deletes)
 * - TTL deletes after 1 year
 * - Date-based partitioning in PK
 */

import { v4 as uuidv4 } from 'uuid';
import { DynamoDBOptimized } from '../DynamoDBOptimized';
import {
  AuditLog,
  CreateAuditLogData,
  PaginationParams,
  PaginatedResponse,
} from './types';

export class AuditLogRepository {
  private dynamoDB: DynamoDBOptimized;
  private readonly TTL_DAYS = 365;
  
  constructor(dynamoDB: DynamoDBOptimized) {
    this.dynamoDB = dynamoDB;
  }

  /**
   * Map DynamoDB item to AuditLog interface
   */
  mapToAuditLog(item: Record<string, any>): AuditLog {
    return {
      id: item.id,
      entity_type: item.entity_type,
      entity_id: item.entity_id,
      user_id: item.user_id,
      action: item.action,
      changes: item.changes,
      metadata: item.metadata,
      created_at: item.created_at,
      expires_at: item.expires_at,
    };
  }

  /**
   * Build DynamoDB item from AuditLog
   */
  buildAuditLogItem(auditLog: AuditLog): Record<string, any> {
    // Extract date from created_at for partitioning (format: YYYY-MM-DD)
    const date = auditLog.created_at.split('T')[0];
    
    const item: Record<string, any> = {
      PK: `AUDIT#${date}#${auditLog.id}`,
      SK: 'METADATA',
      id: auditLog.id,
      entity_type: auditLog.entity_type,
      entity_id: auditLog.entity_id,
      user_id: auditLog.user_id,
      action: auditLog.action,
      created_at: auditLog.created_at,
      expires_at: auditLog.expires_at,
      // GSI1 - Audit logs by entity
      GSI1PK: `AUDIT_ENTITY#${auditLog.entity_type}#${auditLog.entity_id}`,
      GSI1SK: auditLog.created_at,
      // GSI2 - Audit logs by user
      GSI2PK: `AUDIT_USER#${auditLog.user_id}`,
      GSI2SK: auditLog.created_at,
    };

    // Add optional fields
    if (auditLog.changes !== undefined) item.changes = auditLog.changes;
    if (auditLog.metadata !== undefined) item.metadata = auditLog.metadata;

    return item;
  }

  /**
   * Calculate TTL timestamp (created_at + 365 days)
   * Returns Unix timestamp in seconds
   */
  calculateTTL(createdAt: string): number {
    const createdAtDate = new Date(createdAt);
    const expiresAt = new Date(createdAtDate.getTime() + this.TTL_DAYS * 24 * 60 * 60 * 1000);
    return Math.floor(expiresAt.getTime() / 1000); // Unix timestamp in seconds
  }

  /**
   * Create a new audit log entry
   * Append-only - no updates allowed
   */
  async create(data: CreateAuditLogData): Promise<AuditLog> {
    const now = new Date().toISOString();
    const id = uuidv4();

    const auditLog: AuditLog = {
      id,
      entity_type: data.entity_type,
      entity_id: data.entity_id,
      user_id: data.user_id,
      action: data.action,
      changes: data.changes,
      metadata: data.metadata,
      created_at: now,
      expires_at: this.calculateTTL(now),
    };

    const item = this.buildAuditLogItem(auditLog);

    await this.dynamoDB.put({
      item,
    });

    return auditLog;
  }

  /**
   * Batch create audit log entries
   * Uses batchWriteOptimized for efficient bulk inserts
   */
  async batchCreate(entries: CreateAuditLogData[]): Promise<AuditLog[]> {
    if (entries.length === 0) {
      return [];
    }

    const now = new Date().toISOString();
    const auditLogs: AuditLog[] = [];
    const items: Record<string, any>[] = [];

    for (const data of entries) {
      const id = uuidv4();
      const auditLog: AuditLog = {
        id,
        entity_type: data.entity_type,
        entity_id: data.entity_id,
        user_id: data.user_id,
        action: data.action,
        changes: data.changes,
        metadata: data.metadata,
        created_at: now,
        expires_at: this.calculateTTL(now),
      };

      auditLogs.push(auditLog);
      items.push(this.buildAuditLogItem(auditLog));
    }

    await this.dynamoDB.batchWriteOptimized({
      items: items.map(item => ({ type: 'put', item })),
    });

    return auditLogs;
  }

  /**
   * Find audit logs for a specific entity using GSI1
   * Sorted by created_at (newest first by default)
   */
  async findByEntity(
    entityType: string,
    entityId: string,
    params: PaginationParams = {}
  ): Promise<PaginatedResponse<AuditLog>> {
    const result = await this.dynamoDB.queryEventuallyConsistent({
      indexName: 'GSI1',
      keyConditionExpression: 'GSI1PK = :gsi1pk',
      expressionAttributeValues: {
        ':gsi1pk': `AUDIT_ENTITY#${entityType}#${entityId}`,
      },
      limit: params.limit || 30,
      exclusiveStartKey: params.lastEvaluatedKey,
      scanIndexForward: false, // Newest first
    });

    return {
      items: result.data.map(item => this.mapToAuditLog(item)),
      lastEvaluatedKey: result.lastEvaluatedKey,
      count: result.count,
    };
  }

  /**
   * Find audit logs for a specific user using GSI2
   * Sorted by created_at (newest first by default)
   */
  async findByUser(
    userId: string,
    params: PaginationParams = {}
  ): Promise<PaginatedResponse<AuditLog>> {
    const result = await this.dynamoDB.queryEventuallyConsistent({
      indexName: 'GSI2',
      keyConditionExpression: 'GSI2PK = :gsi2pk',
      expressionAttributeValues: {
        ':gsi2pk': `AUDIT_USER#${userId}`,
      },
      limit: params.limit || 30,
      exclusiveStartKey: params.lastEvaluatedKey,
      scanIndexForward: false, // Newest first
    });

    return {
      items: result.data.map(item => this.mapToAuditLog(item)),
      lastEvaluatedKey: result.lastEvaluatedKey,
      count: result.count,
    };
  }

  /**
   * Find audit logs within a date range
   * Uses PK prefix query for efficient date-based partitioning
   * Note: This requires querying multiple partitions (one per date)
   */
  async findByDateRange(
    startDate: string,
    endDate: string
  ): Promise<AuditLog[]> {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const allLogs: AuditLog[] = [];

    // Generate list of dates to query
    const dates: string[] = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dates.push(d.toISOString().split('T')[0]);
    }

    // Query each date partition
    for (const date of dates) {
      const result = await this.dynamoDB.queryEventuallyConsistent({
        keyConditionExpression: 'begins_with(PK, :pk)',
        expressionAttributeValues: {
          ':pk': `AUDIT#${date}`,
        },
        scanIndexForward: false, // Newest first
      });

      // Filter by exact date range if needed
      const filtered = result.data
        .map(item => this.mapToAuditLog(item))
        .filter(log => {
          const logDate = new Date(log.created_at);
          return logDate >= start && logDate <= end;
        });

      allLogs.push(...filtered);
    }

    // Sort all results by created_at (newest first)
    allLogs.sort((a, b) => {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return allLogs;
  }
}
