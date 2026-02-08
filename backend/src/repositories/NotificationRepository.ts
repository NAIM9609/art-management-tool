import { DynamoDBHelper, EntityPrefix, GSI } from '../database/dynamodb-client';

export enum NotificationType {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  SUCCESS = 'success',
  ORDER = 'order',
  SYSTEM = 'system',
}

export interface Notification {
  id: number;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, any>;
  is_read: boolean;
  read_at?: string;
  created_at: string;
  updated_at: string;
  expires_at: string; // TTL - 90 days
}

const NOTIFICATION_TTL_DAYS = 90;

export class NotificationRepository {
  
  /**
   * Create a new notification
   */
  static async create(data: Omit<Notification, 'id' | 'is_read' | 'created_at' | 'updated_at' | 'expires_at'>): Promise<Notification> {
    const id = await DynamoDBHelper.getNextId(EntityPrefix.NOTIFICATION);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + NOTIFICATION_TTL_DAYS * 24 * 60 * 60 * 1000);
    
    const notification: Notification = {
      ...data,
      id,
      is_read: false,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    };

    await DynamoDBHelper.put({
      PK: `${EntityPrefix.NOTIFICATION}#${id}`,
      SK: 'METADATA',
      GSI1PK: `NOTIFICATION_READ#${false}`,
      GSI1SK: now.toISOString(),
      GSI2PK: `NOTIFICATION_TYPE#${data.type}`,
      GSI2SK: now.toISOString(),
      entity_type: 'Notification',
      ttl: Math.floor(expiresAt.getTime() / 1000),
      ...notification,
    });

    return notification;
  }

  /**
   * Find notification by ID
   */
  static async findById(id: number): Promise<Notification | null> {
    const item = await DynamoDBHelper.get(`${EntityPrefix.NOTIFICATION}#${id}`, 'METADATA');
    if (!item) return null;
    return this.mapToNotification(item);
  }

  /**
   * Find all unread notifications
   */
  static async findUnread(): Promise<Notification[]> {
    const items = await DynamoDBHelper.query({
      indexName: GSI.GSI1,
      keyConditionExpression: 'GSI1PK = :pk',
      expressionAttributeValues: {
        ':pk': 'NOTIFICATION_READ#false',
      },
      scanIndexForward: false, // Most recent first
    });

    return items.map(this.mapToNotification);
  }

  /**
   * Find all notifications with pagination
   */
  static async findAll(page: number = 1, perPage: number = 20): Promise<{ notifications: Notification[]; total: number }> {
    const items = await DynamoDBHelper.scan({
      filterExpression: 'entity_type = :type',
      expressionAttributeValues: {
        ':type': 'Notification',
      },
    });

    // Sort by created_at descending
    const sortedItems = items.sort((a, b) => b.created_at.localeCompare(a.created_at));
    
    const total = sortedItems.length;
    const startIndex = (page - 1) * perPage;
    const paginatedItems = sortedItems.slice(startIndex, startIndex + perPage);

    return {
      notifications: paginatedItems.map(this.mapToNotification),
      total,
    };
  }

  /**
   * Find notifications by type
   */
  static async findByType(type: NotificationType): Promise<Notification[]> {
    const items = await DynamoDBHelper.query({
      indexName: GSI.GSI2,
      keyConditionExpression: 'GSI2PK = :pk',
      expressionAttributeValues: {
        ':pk': `NOTIFICATION_TYPE#${type}`,
      },
      scanIndexForward: false,
    });

    return items.map(this.mapToNotification);
  }

  /**
   * Mark notification as read
   */
  static async markAsRead(id: number): Promise<Notification> {
    const now = new Date().toISOString();
    
    const result = await DynamoDBHelper.update(
      `${EntityPrefix.NOTIFICATION}#${id}`,
      'METADATA',
      'SET is_read = :is_read, read_at = :read_at, updated_at = :updated_at, GSI1PK = :gsi1pk',
      {
        ':is_read': true,
        ':read_at': now,
        ':updated_at': now,
        ':gsi1pk': 'NOTIFICATION_READ#true',
      }
    );

    return this.mapToNotification(result);
  }

  /**
   * Mark all notifications as read
   */
  static async markAllAsRead(): Promise<void> {
    const unread = await this.findUnread();
    for (const notification of unread) {
      await this.markAsRead(notification.id);
    }
  }

  /**
   * Get unread count
   */
  static async getUnreadCount(): Promise<number> {
    const items = await DynamoDBHelper.query({
      indexName: GSI.GSI1,
      keyConditionExpression: 'GSI1PK = :pk',
      expressionAttributeValues: {
        ':pk': 'NOTIFICATION_READ#false',
      },
    });

    return items.length;
  }

  /**
   * Delete a notification
   */
  static async delete(id: number): Promise<void> {
    await DynamoDBHelper.delete(`${EntityPrefix.NOTIFICATION}#${id}`, 'METADATA');
  }

  /**
   * Create order notification
   */
  static async createOrderNotification(orderId: number, orderNumber: string, type: 'new' | 'paid' | 'shipped'): Promise<Notification> {
    const titles: Record<string, string> = {
      new: 'New Order Received',
      paid: 'Order Payment Confirmed',
      shipped: 'Order Shipped',
    };

    const messages: Record<string, string> = {
      new: `Order ${orderNumber} has been placed.`,
      paid: `Payment for order ${orderNumber} has been confirmed.`,
      shipped: `Order ${orderNumber} has been shipped.`,
    };

    return this.create({
      type: NotificationType.ORDER,
      title: titles[type],
      message: messages[type],
      metadata: { order_id: orderId, order_number: orderNumber },
    });
  }

  private static mapToNotification(item: any): Notification {
    const { PK, SK, GSI1PK, GSI1SK, GSI2PK, GSI2SK, entity_type, ttl, ...notification } = item;
    return notification as Notification;
  }
}
