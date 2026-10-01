import { Request, Response, NextFunction } from 'express';
import { notificationService } from '../services/notification.service';
import { sendSuccess } from '../utils/apiResponse';
import { notificationRepository } from '../repositories/notification.repository';
import type { RegisterDeviceTokenInput } from '../validators/notification.validator';

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

  /**
   * POST /api/notifications/device-token
   *
   * Register an FCM device token for the authenticated user. The user id is
   * taken from the JWT (`req.user.id`), NEVER from the request body.
   *
   * Idempotent — calling this with the same token twice is a no-op.
   */
  async registerDeviceToken(req: Request, res: Response, next: NextFunction) {
    try {
      const input = req.body as RegisterDeviceTokenInput;
      const tokens = await notificationService.registerDeviceToken(req.user!.id, input.token);
      return sendSuccess(res, 'Device token registered successfully', { deviceTokens: tokens });
    } catch (err) {
      return next(err);
    }
  }

  /**
   * DELETE /api/notifications/device-token
   *
   * Remove an FCM device token. Typically called by the Flutter app on logout
   * so the device stops receiving push notifications. The user id is taken
   * from the JWT.
   */
  async unregisterDeviceToken(req: Request, res: Response, next: NextFunction) {
    try {
      const input = req.body as RegisterDeviceTokenInput;
      const tokens = await notificationService.unregisterDeviceToken(req.user!.id, input.token);
      return sendSuccess(res, 'Device token removed successfully', { deviceTokens: tokens });
    } catch (err) {
      return next(err);
    }
  }
}

export const notificationController = new NotificationController();
