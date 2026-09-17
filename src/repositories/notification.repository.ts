import { NotificationModel } from '../models/notification.model';
import { NotificationType } from '../types';
import { NotFoundError, ForbiddenError } from '../errors/AppError';
import { ErrorCodes } from '../errors/errorCodes';
import mongoose from 'mongoose';

export class NotificationRepository {
  async create(data: {
    userId: string;
    title: string;
    message: string;
    type?: NotificationType;
    data?: Record<string, unknown>;
  }) {
    return NotificationModel.create(data);
  }

  async findMany(opts: { userId: string; isRead?: boolean; page?: number; limit?: number }) {
    const { userId, isRead, page = 1, limit = 50 } = opts;
    const filter: Record<string, unknown> = { userId };
    if (typeof isRead === 'boolean') filter.isRead = isRead;

    const skip = (page - 1) * limit;
    const [items, total, unreadCount] = await Promise.all([
      NotificationModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      NotificationModel.countDocuments(filter),
      NotificationModel.countDocuments({ userId, isRead: false }),
    ]);
    return { items, total, unreadCount, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async markAsRead(id: string, userId: string) {
    if (!mongoose.isValidObjectId(id)) {
      throw new NotFoundError('Notification not found', ErrorCodes.NOTIFICATION_NOT_FOUND);
    }
    const n = await NotificationModel.findById(id);
    if (!n) throw new NotFoundError('Notification not found', ErrorCodes.NOTIFICATION_NOT_FOUND);
    if (n.userId.toString() !== userId) {
      throw new ForbiddenError('Notification does not belong to user');
    }
    n.isRead = true;
    await n.save();
    return n;
  }

  async markAllRead(userId: string) {
    const res = await NotificationModel.updateMany(
      { userId, isRead: false },
      { isRead: true },
    );
    return { modifiedCount: res.modifiedCount };
  }
}

export const notificationRepository = new NotificationRepository();
