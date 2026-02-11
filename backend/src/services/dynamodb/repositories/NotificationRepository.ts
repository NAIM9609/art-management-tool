/**
 * NotificationRepository - DynamoDB implementation for Notification CRUD operations
 * 
 * DynamoDB Structure:
 * PK: "NOTIFICATION#${id}"
 * SK: "METADATA"
 * GSI1PK: "NOTIFICATION_READ#${is_read}"
 * GSI1SK: "${created_at}"
 * expires_at: timestamp (TTL = created_at + 90 days)
 * 
 * Cost Optimizations:
 * - TTL auto-deletes old notifications (90 days)
 * - GSI1 for efficient unread notifications query
 */

import { DynamoDBOptimized } from '../DynamoDBOptimized';
import { v4 as uuidv4 } from 'uuid';
import {
  Notification,
  NotificationType,
  CreateNotificationData,
  NotificationFilters,
  PaginationParams,
  PaginatedResponse,
} from './types';

export class NotificationRepository {
  private dynamoDB: DynamoDBOptimized;
  private readonly TTL_DAYS = 90;

  constructor(dynamoDB: DynamoDBOptimized) {
    this.dynamoDB = dynamoDB;
  }

  /**
   * Calculate TTL timestamp (90 days from now)
   * Returns Unix timestamp in seconds
   */
  private calculateTTL(fromDate: Date = new Date()): number {
    const ttlDate = new Date(fromDate);
    ttlDate.setDate(ttlDate.getDate() + this.TTL_DAYS);
    return Math.floor(ttlDate.getTime() / 1000);
  }

  /**
   * Map DynamoDB item to Notification interface
   */
  mapToNotification(item: Record<string, any>): Notification {
    return {
      id: item.id,
      type: item.type,
      title: item.title,
      message: item.message,
      metadata: item.metadata,
      is_read: item.is_read,
      read_at: item.read_at,
      created_at: item.created_at,
      updated_at: item.updated_at,
      expires_at: item.expires_at,
    };
  }

  /**
   * Build DynamoDB item from Notification
   */
  buildNotificationItem(notification: Notification): Record<string, any> {
    const item: Record<string, any> = {
      PK: `NOTIFICATION#${notification.id}`,
      SK: 'METADATA',
      id: notification.id,
      type: notification.type,
      title: notification.title,
      is_read: notification.is_read,
      created_at: notification.created_at,
      updated_at: notification.updated_at,
      expires_at: notification.expires_at,
      // GSI1 - Notifications by read status
      GSI1PK: `NOTIFICATION_READ#${notification.is_read}`,
      GSI1SK: notification.created_at,
    };

    // Add optional fields
    if (notification.message !== undefined) item.message = notification.message;
    if (notification.metadata !== undefined) item.metadata = notification.metadata;
    if (notification.read_at !== undefined) item.read_at = notification.read_at;

    return item;
  }

  /**
   * Create a new notification with TTL (90 days)
   */
  async create(data: CreateNotificationData): Promise<Notification> {
    const now = new Date();
    const nowISO = now.toISOString();
    const id = uuidv4();

    const notification: Notification = {
      id,
      type: data.type,
      title: data.title,
      message: data.message,
      metadata: data.metadata,
      is_read: false,
      created_at: nowISO,
      updated_at: nowISO,
      expires_at: this.calculateTTL(now),
    };

    const item = this.buildNotificationItem(notification);

    await this.dynamoDB.put({
      item,
      conditionExpression: 'attribute_not_exists(PK)',
    });

    return notification;
  }

  /**
   * Find all notifications with optional filters and pagination
   * Uses GSI1 if filtering by is_read for cost optimization
   */
  async findAll(
    filters: NotificationFilters = {},
    params: PaginationParams = {}
  ): Promise<PaginatedResponse<Notification>> {
    // If filtering by read status, use GSI1 for efficiency
    if (filters.is_read !== undefined) {
      const result = await this.dynamoDB.queryEventuallyConsistent({
        indexName: 'GSI1',
        keyConditionExpression: 'GSI1PK = :gsi1pk',
        expressionAttributeValues: {
          ':gsi1pk': `NOTIFICATION_READ#${filters.is_read}`,
        },
        limit: params.limit || 30,
        exclusiveStartKey: params.lastEvaluatedKey,
        scanIndexForward: false, // Sort by created_at descending (newest first)
      });

      return {
        items: result.data.map(item => this.mapToNotification(item)),
        lastEvaluatedKey: result.lastEvaluatedKey,
        count: result.count,
      };
    }

    // Otherwise, scan all notifications (less efficient, but required for all notifications)
    // In production, consider using GSI1 with begins_with for better performance
    const result = await this.dynamoDB.queryEventuallyConsistent({
      indexName: 'GSI1',
      keyConditionExpression: 'begins_with(GSI1PK, :prefix)',
      expressionAttributeValues: {
        ':prefix': 'NOTIFICATION_READ#',
      },
      limit: params.limit || 30,
      exclusiveStartKey: params.lastEvaluatedKey,
      scanIndexForward: false,
    });

    return {
      items: result.data.map(item => this.mapToNotification(item)),
      lastEvaluatedKey: result.lastEvaluatedKey,
      count: result.count,
    };
  }

  /**
   * Mark a notification as read by ID
   */
  async markAsRead(id: string): Promise<Notification | null> {
    const now = new Date().toISOString();

    try {
      const result = await this.dynamoDB.update({
        key: {
          PK: `NOTIFICATION#${id}`,
          SK: 'METADATA',
        },
        updates: {
          is_read: true,
          read_at: now,
          updated_at: now,
          // Update GSI1PK to move from unread to read partition
          GSI1PK: 'NOTIFICATION_READ#true',
        },
        conditionExpression: 'attribute_exists(PK)',
        returnValues: 'ALL_NEW',
      });

      if (!result.data) {
        return null;
      }

      return this.mapToNotification(result.data);
    } catch (error: any) {
      // If item doesn't exist, return null
      if (error.name === 'ConditionalCheckFailedException' || error.code === 'ConditionalCheckFailedException') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Mark all unread notifications as read
   * Uses GSI1 to efficiently query only unread notifications
   */
  async markAllAsRead(): Promise<void> {
    const now = new Date().toISOString();
    let lastEvaluatedKey: Record<string, any> | undefined = undefined;

    do {
      // Query all unread notifications using GSI1
      const result: any = await this.dynamoDB.queryEventuallyConsistent({
        indexName: 'GSI1',
        keyConditionExpression: 'GSI1PK = :gsi1pk',
        expressionAttributeValues: {
          ':gsi1pk': 'NOTIFICATION_READ#false',
        },
        limit: 25, // Process in batches of 25
        exclusiveStartKey: lastEvaluatedKey,
        projectionExpression: 'id', // Only need the ID
      });

      // Update each notification
      const updatePromises = result.data.map((item: any) =>
        this.dynamoDB.update({
          key: {
            PK: `NOTIFICATION#${item.id}`,
            SK: 'METADATA',
          },
          updates: {
            is_read: true,
            read_at: now,
            updated_at: now,
            GSI1PK: 'NOTIFICATION_READ#true',
          },
        })
      );

      await Promise.all(updatePromises);

      lastEvaluatedKey = result.lastEvaluatedKey;
    } while (lastEvaluatedKey);
  }

  /**
   * Hard delete a notification
   */
  async delete(id: string): Promise<void> {
    await this.dynamoDB.delete({
      key: {
        PK: `NOTIFICATION#${id}`,
        SK: 'METADATA',
      },
    });
  }
}
