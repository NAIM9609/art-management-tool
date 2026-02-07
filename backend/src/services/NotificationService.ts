import { Repository } from 'typeorm';
import { AppDataSource } from '../database/connection';
import { Notification, NotificationType } from '../entities/Notification';

export interface NotificationData {
  type: NotificationType | string;
  title: string;
  message?: string;
  metadata?: Record<string, any>;
}

export class NotificationService {
  private notificationRepo: Repository<Notification>;

  constructor() {
    this.notificationRepo = AppDataSource.getRepository(Notification);
  }

  async createNotification(data: NotificationData): Promise<Notification> {
    const notification = this.notificationRepo.create({
      type: data.type as NotificationType,
      title: data.title,
      message: data.message,
      metadata: data.metadata,
    });
    return this.notificationRepo.save(notification);
  }

  async getNotifications(unreadOnly: boolean = false, page: number = 1, perPage: number = 20): Promise<{ notifications: Notification[]; total: number }> {
    const where: any = {};
    if (unreadOnly) {
      where.is_read = false;
    }

    const [notifications, total] = await this.notificationRepo.findAndCount({
      where,
      skip: (page - 1) * perPage,
      take: perPage,
      order: { created_at: 'DESC' },
    });

    return { notifications, total };
  }

  async getNotificationById(id: number): Promise<Notification | null> {
    return this.notificationRepo.findOne({ where: { id } });
  }

  async markAsRead(id: number): Promise<Notification> {
    await this.notificationRepo.update(id, {
      is_read: true,
      read_at: new Date(),
    });
    return this.notificationRepo.findOneOrFail({ where: { id } });
  }

  async markAllAsRead(): Promise<void> {
    await this.notificationRepo.update(
      { is_read: false },
      { is_read: true, read_at: new Date() }
    );
  }

  async deleteNotification(id: number): Promise<void> {
    await this.notificationRepo.delete(id);
  }
}
