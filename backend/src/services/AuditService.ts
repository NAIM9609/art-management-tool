import { DynamoDBOptimized } from './dynamodb/DynamoDBOptimized';
import { AuditLogRepository } from './dynamodb/repositories/AuditLogRepository';
import {
  CreateAuditLogData,
  PaginationParams,
  PaginatedResponse,
  AuditLog,
} from './dynamodb/repositories/types';
import { config } from '../config';

/**
 * AuditService - High-level service for audit logging
 *
 * Wraps the AuditLogRepository to provide business logic for audit trail functionality.
 * Uses DynamoDB for scalable, append-only audit log storage with automatic TTL.
 */
export class AuditService {
  private auditLogRepository: AuditLogRepository;

  constructor() {
    // Initialize DynamoDB client and repository
    const dynamoDB = new DynamoDBOptimized({
      tableName: process.env.DYNAMODB_TABLE_NAME || 'art-management-table',
      region: config.s3.region,
    });
    this.auditLogRepository = new AuditLogRepository(dynamoDB);
  }

  /**
   * Log an action to the audit trail
   *
   * @param userId - ID of the user performing the action
   * @param action - Action being performed (e.g., 'CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT')
   * @param entityType - Type of entity being acted upon (e.g., 'product', 'order', 'user')
   * @param entityId - ID of the entity being acted upon
   * @param changes - Optional object containing the changes made
   * @param ipAddress - Optional IP address of the user
   * @returns The created audit log entry
   */
  async logAction(
    userId: string,
    action: string,
    entityType: string,
    entityId: string,
    changes?: Record<string, any>,
    ipAddress?: string
  ): Promise<AuditLog> {
    const metadata: Record<string, any> = {};
    if (ipAddress) {
      metadata.ip_address = ipAddress;
    }

    const data: CreateAuditLogData = {
      user_id: userId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      changes,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    };

    return this.auditLogRepository.create(data);
  }

  /**
   * Get the audit history for a specific entity
   *
   * @param entityType - Type of entity (e.g., 'product', 'order')
   * @param entityId - ID of the entity
   * @param pagination - Optional pagination parameters
   * @returns Paginated list of audit logs for the entity
   */
  async getEntityHistory(
    entityType: string,
    entityId: string,
    pagination?: PaginationParams
  ): Promise<PaginatedResponse<AuditLog>> {
    return this.auditLogRepository.findByEntity(entityType, entityId, pagination);
  }

  /**
   * Get all activity for a specific user
   *
   * @param userId - ID of the user
   * @param pagination - Optional pagination parameters
   * @returns Paginated list of audit logs for the user
   */
  async getUserActivity(
    userId: string,
    pagination?: PaginationParams
  ): Promise<PaginatedResponse<AuditLog>> {
    return this.auditLogRepository.findByUser(userId, pagination);
  }

  /**
   * Get all activity within a date range
   *
   * @param start - Start date (ISO 8601 format)
   * @param end - End date (ISO 8601 format)
   * @param pagination - Optional pagination parameters
   * @returns Paginated list of audit logs within the date range
   */
  async getActivityByDateRange(
    start: string,
    end: string,
    pagination?: PaginationParams
  ): Promise<PaginatedResponse<AuditLog>> {
    return this.auditLogRepository.findByDateRange(start, end, pagination);
  }
}
