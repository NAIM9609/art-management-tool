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
  private readonly MAX_DATE_RANGE_DAYS = 90;
  
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
   * Safely extract the partition date (YYYY-MM-DD) from created_at.
   * Accepts:
   *  - full ISO 8601 datetimes: YYYY-MM-DDTHH:mm:ss.sssZ
   *  - plain dates: YYYY-MM-DD
   * Throws an error if the format is invalid to avoid corrupting partition keys.
   */
  private extractPartitionDate(created_at: string): string {
    // Match full ISO 8601 datetime and capture the date prefix.
    const dateTimeMatch = /^(\d{4}-\d{2}-\d{2})T/.exec(created_at);
    if (dateTimeMatch) {
      return dateTimeMatch[1];
    }

    // Allow plain ISO date format.
    const dateOnlyMatch = /^(\d{4}-\d{2}-\d{2})$/.exec(created_at);
    if (dateOnlyMatch) {
      return dateOnlyMatch[1];
    }

    throw new Error(
      `Invalid created_at format for audit log. Expected ISO 8601 date or datetime (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss.sssZ), got: ${created_at}`
    );
  }

  /**
   * Build DynamoDB item from AuditLog
   */
  private buildAuditLogItem(auditLog: AuditLog): Record<string, any> {
    // Extract date from created_at for partitioning (format: YYYY-MM-DD)
    const date = this.extractPartitionDate(auditLog.created_at);
    
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
   * 
   * Note: Uses 365-day calculation which may result in 364-366 day retention
   * depending on leap years. This is acceptable for audit log TTL purposes.
   */
  private calculateTTL(createdAt: string): number {
    const createdAtDate = new Date(createdAt);
    const createdAtTime = createdAtDate.getTime();

    if (Number.isNaN(createdAtTime)) {
      throw new Error(`Invalid createdAt date for TTL calculation: "${createdAt}"`);
    }

    const expiresAt = new Date(createdAtTime + this.TTL_DAYS * 24 * 60 * 60 * 1000);
    const ttl = Math.floor(expiresAt.getTime() / 1000); // Unix timestamp in seconds

    if (!Number.isFinite(ttl)) {
      throw new Error('Failed to calculate a valid TTL value');
    }

    return ttl;
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
   * Queries multiple date partitions in parallel for better performance
   * 
   * Maximum date range is limited to 90 days to prevent excessive queries.
   * Supports pagination to handle large result sets.
   * 
   * Note: All dates are processed in UTC to ensure consistency.
   * 
   * @param startDate - ISO 8601 date string (YYYY-MM-DD or full datetime)
   * @param endDate - ISO 8601 date string (YYYY-MM-DD or full datetime)
   * @param params - Optional pagination parameters
   * @returns Paginated list of audit logs within the date range
   */
  async findByDateRange(
    startDate: string,
    endDate: string,
    params: PaginationParams = {}
  ): Promise<PaginatedResponse<AuditLog>> {
    // Parse dates as UTC to ensure consistent timezone handling
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Validate dates
    if (Number.isNaN(start.getTime())) {
      throw new Error(`Invalid startDate: "${startDate}". Expected ISO 8601 format.`);
    }
    if (Number.isNaN(end.getTime())) {
      throw new Error(`Invalid endDate: "${endDate}". Expected ISO 8601 format.`);
    }
    if (start > end) {
      throw new Error('startDate must be less than or equal to endDate');
    }

    // Calculate date range in days
    const rangeInDays = Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
    if (rangeInDays > this.MAX_DATE_RANGE_DAYS) {
      throw new Error(
        `Date range exceeds maximum allowed (${this.MAX_DATE_RANGE_DAYS} days). ` +
        `Requested range: ${rangeInDays} days. Please use a smaller date range.`
      );
    }

    // Generate list of dates to query (using UTC dates)
    const dates: string[] = [];
    for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 24 * 60 * 60 * 1000)) {
      dates.push(d.toISOString().split('T')[0]);
    }

    // Query all date partitions in parallel
    const queryPromises = dates.map(date =>
      this.dynamoDB.queryEventuallyConsistent({
        keyConditionExpression: 'begins_with(PK, :pk)',
        expressionAttributeValues: {
          ':pk': `AUDIT#${date}`,
        },
        scanIndexForward: false, // Newest first
      })
    );

    const results = await Promise.all(queryPromises);

    // Flatten and filter results by exact date range (in UTC)
    const allLogs: AuditLog[] = [];
    for (const result of results) {
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

    // Apply pagination
    const limit = params.limit || 100;
    const startIndex = params.lastEvaluatedKey?.startIndex || 0;
    const endIndex = startIndex + limit;
    const paginatedLogs = allLogs.slice(startIndex, endIndex);

    // Create next page token if there are more results
    const lastEvaluatedKey = endIndex < allLogs.length 
      ? { startIndex: endIndex }
      : undefined;

    return {
      items: paginatedLogs,
      lastEvaluatedKey,
      count: paginatedLogs.length,
    };
  }
}
