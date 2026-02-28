import { DynamoDBOptimized } from './dynamodb/DynamoDBOptimized';
import { NotificationRepository } from './dynamodb/repositories/NotificationRepository';
import {
  Notification,
  NotificationType,
  CreateNotificationData,
  NotificationFilters,
  PaginationParams,
  PaginatedResponse,
} from './dynamodb/repositories/types';

export interface NotificationData {
  type: NotificationType | string;
  title: string;
  message?: string;
  metadata?: Record<string, any>;
}

export class NotificationService {
  private notificationRepo: NotificationRepository;

  constructor() {
    const dynamoDB = new DynamoDBOptimized({
      tableName: process.env.DYNAMODB_TABLE_NAME || 'art-management-table',
      region: process.env.AWS_REGION || 'us-east-1',
    });
    this.notificationRepo = new NotificationRepository(dynamoDB);
  }

  /**
   * Create notification with TTL (90 days from creation)
   */
  async createNotification(data: NotificationData): Promise<Notification> {
    const createData: CreateNotificationData = {
      type: data.type as NotificationType,
      title: data.title,
      message: data.message,
      metadata: data.metadata,
    };
    return this.notificationRepo.create(createData);
  }

  /**
   * Get notifications with filters and pagination
   * @param unreadOnly - Filter for unread notifications only
   * @param page - Page number (1-indexed) - converted to limit/offset for DynamoDB
   * @param perPage - Number of items per page
   */
  async getNotifications(
    unreadOnly: boolean = false,
    page: number = 1,
    perPage: number = 20
  ): Promise<{ notifications: Notification[]; total: number }> {
    const filters: NotificationFilters = {};
    if (unreadOnly) {
      filters.is_read = false;
    }

    const params: PaginationParams = {
      limit: perPage,
    };

    const result: PaginatedResponse<Notification> = await this.notificationRepo.findAll(filters, params);

    return {
      notifications: result.items,
      total: result.count, // Note: DynamoDB count is for current page, not total
    };
  }

  async getNotificationById(id: string): Promise<Notification | null> {
    return this.notificationRepo.findById(id);
  }

  /**
   * Mark notification as read
   */
  async markAsRead(id: string): Promise<Notification | null> {
    return this.notificationRepo.markAsRead(id);
  }

  /**
   * Mark all unread notifications as read (batch update)
   */
  async markAllAsRead(): Promise<void> {
    await this.notificationRepo.markAllAsRead();
  }

  /**
   * Hard delete notification
   */
  async deleteNotification(id: string): Promise<void> {
    await this.notificationRepo.delete(id);
  }
}
