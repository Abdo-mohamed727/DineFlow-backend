import { Request, Response, NextFunction } from 'express';
import { notificationService } from '../services/notification.service';
import { sendSuccess } from '../utils/apiResponse';
import { notificationRepository } from '../repositories/notification.repository';

export class NotificationController {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const isRead = req.query.isRead as 'true' | 'false' | undefined;
      const page = Number(req.query.page ?? 1);
      const limit = Number(req.query.limit ?? 50);
      const result = await notificationService.list(req.user!.id, {
        isRead: isRead === undefined ? undefined : isRead === 'true',
        page,
        limit,
      });
      return sendSuccess(res, 'Notifications retrieved successfully', result);
    } catch (err) {
      return next(err);
    }
  }

  async markAsRead(req: Request, res: Response, next: NextFunction) {
    try {
      const n = await notificationService.markAsRead(req.params.id, req.user!.id);
      return sendSuccess(res, 'Notification marked as read', { notification: n });
    } catch (err) {
      return next(err);
    }
  }

  async markAllRead(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await notificationRepository.markAllRead(req.user!.id);
      return sendSuccess(res, 'All notifications marked as read', result);
    } catch (err) {
      return next(err);
    }
  }
}

export const notificationController = new NotificationController();
