/**
 * NotificationService using DynamoDB repositories
 */

import { 
  NotificationRepository,
  Notification,
  NotificationType,
} from '../../repositories';

export { Notification, NotificationType };

export interface CreateNotificationData {
  type: NotificationType | string;
  title: string;
  message: string;
  metadata?: Record<string, any>;
}

export class NotificationServiceDynamo {
  
  /**
   * Create a new notification
   */
  async createNotification(data: CreateNotificationData): Promise<Notification> {
    // Map string types to enum
    let notificationType: NotificationType;
    if (typeof data.type === 'string') {
      switch (data.type) {
        case 'order_created':
        case 'order':
          notificationType = NotificationType.ORDER;
          break;
        case 'warning':
          notificationType = NotificationType.WARNING;
          break;
        case 'error':
          notificationType = NotificationType.ERROR;
          break;
        case 'success':
          notificationType = NotificationType.SUCCESS;
          break;
        case 'system':
          notificationType = NotificationType.SYSTEM;
          break;
        default:
          notificationType = NotificationType.INFO;
      }
    } else {
      notificationType = data.type;
    }

    return NotificationRepository.create({
      type: notificationType,
      title: data.title,
      message: data.message,
      metadata: data.metadata,
    });
  }

  /**
   * Get all notifications
   */
  async getAllNotifications(page: number = 1, perPage: number = 20): Promise<{ notifications: Notification[]; total: number }> {
    return NotificationRepository.findAll(page, perPage);
  }

  /**
   * Get unread notifications
   */
  async getUnreadNotifications(): Promise<Notification[]> {
    return NotificationRepository.findUnread();
  }

  /**
   * Get notification by ID
   */
  async getNotificationById(id: number): Promise<Notification | null> {
    return NotificationRepository.findById(id);
  }

  /**
   * Mark notification as read
   */
  async markAsRead(id: number): Promise<Notification> {
    return NotificationRepository.markAsRead(id);
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(): Promise<void> {
    return NotificationRepository.markAllAsRead();
  }

  /**
   * Get unread count
   */
  async getUnreadCount(): Promise<number> {
    return NotificationRepository.getUnreadCount();
  }

  /**
   * Delete a notification
   */
  async deleteNotification(id: number): Promise<void> {
    return NotificationRepository.delete(id);
  }

  /**
   * Create order notification
   */
  async createOrderNotification(orderId: number, orderNumber: string, type: 'new' | 'paid' | 'shipped'): Promise<Notification> {
    return NotificationRepository.createOrderNotification(orderId, orderNumber, type);
  }
}

// Export singleton instance
export const notificationServiceDynamo = new NotificationServiceDynamo();
