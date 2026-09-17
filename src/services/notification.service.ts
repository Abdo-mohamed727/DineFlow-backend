import { notificationRepository } from '../repositories/notification.repository';

export class NotificationService {
  async list(userId: string, opts: { isRead?: boolean; page?: number; limit?: number }) {
    return notificationRepository.findMany({ userId, ...opts });
  }

  async markAsRead(id: string, userId: string) {
    return notificationRepository.markAsRead(id, userId);
  }

  async markAllRead(userId: string) {
    return notificationRepository.markAllRead(userId);
  }
}

export const notificationService = new NotificationService();
