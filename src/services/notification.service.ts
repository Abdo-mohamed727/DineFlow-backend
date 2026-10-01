import { notificationRepository } from '../repositories/notification.repository';
import { userRepository } from '../repositories/user.repository';
import { fcmService } from './fcm.service';
import { env } from '../config/env';

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

  /**
   * Register an FCM device token for the authenticated user. Idempotent —
   * if the token is already registered, it's a no-op. A single user may have
   * multiple tokens (phone, tablet, web).
   */
  async registerDeviceToken(userId: string, token: string) {
    return userRepository.addDeviceToken(userId, token);
  }

  /**
   * Remove an FCM device token from the authenticated user. Typically called
   * by the Flutter app on logout. No-op if the token was never registered.
   */
  async unregisterDeviceToken(userId: string, token: string) {
    return userRepository.removeDeviceToken(userId, token);
  }

  /**
   * Notify a recipient that their order's status changed. This method:
   *
   *   1. Creates a notification record in MongoDB (visible via GET /api/notifications).
   *   2. Looks up the recipient's registered FCM device tokens.
   *   3. Sends a push via Firebase Cloud Messaging (best-effort — never throws).
   *   4. Removes any tokens that FCM reports as invalid/unregistered.
   *
   * Failure contract:
   *   - If notification creation fails, this method THROWS (caller should
   *     treat it as a hard failure).
   *   - If FCM fails, the notification is still persisted; the error is
   *     logged and the method returns normally. Order status updates
   *     must never be rolled back due to FCM failure.
   *
   * Duplicate-prevention:
   *   - The caller (OrderService.updateStatus) is responsible for only
   *     invoking this method when `oldStatus !== newStatus`. Repeated calls
   *     with identical status values will produce duplicate notifications.
   */
  async notifyOrderStatusChanged(params: {
    userId: string;
    orderId: string;
    orderNumber: string;
    newStatus: string;
  }) {
    const { userId, orderId, orderNumber, newStatus } = params;

    // 1. Persist the notification (always succeeds — this is the source of
    //    truth for the in-app Notification Center).
    const notification = await notificationRepository.create({
      userId,
      title: 'Order status updated',
      message: `Your order ${orderNumber} is now "${newStatus}".`,
      type: 'ORDER_UPDATE',
      data: {
        orderId,
        status: newStatus,
        // Tag used by the Flutter app to deduplicate notifications if FCM
        // delivers the same push twice (rare but possible).
        tag: `order-${orderId}-status`,
      },
    });

    // 2. FCM dispatch — best-effort, never throws.
    //    We use setImmediate-style async fire-and-forget so the order-status
    //    API response is not blocked by FCM round-trip latency. However, we
    //    still want the in-process test runner to wait for it, so we await
    //    here in non-production environments.
    const dispatch = async () => {
      try {
        const tokens = await userRepository.getDeviceTokens(userId);
        if (tokens.length === 0) return;

        const result = await fcmService.sendPush(tokens, {
          title: 'Order status updated',
          body: `Your order ${orderNumber} is now "${newStatus}".`,
          data: {
            notificationId: (notification as unknown as { _id: { toString(): string } })._id.toString(),
            orderId,
            status: newStatus,
            type: 'ORDER_UPDATE',
            // Click action for the Flutter app to deep-link to the order.
            clickAction: 'ORDER_STATUS_CHANGED',
          },
        });

        // Clean up invalid tokens in the background. We don't await this
        // because it shouldn't block the dispatch promise.
        if (result.invalidTokens.length > 0) {
          userRepository.removeInvalidTokens(userId, result.invalidTokens).catch((e) => {
            // eslint-disable-next-line no-console
            console.warn(`[FCM] failed to clean invalid tokens for user ${userId}:`, (e as Error).message);
          });
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`[FCM] dispatch failed for user ${userId}:`, (err as Error).message);
      }
    };

    if (env.NODE_ENV === 'production') {
      // Fire-and-forget in production so the API responds fast.
      void dispatch();
    } else {
      // Await in dev/test so tests can deterministically assert FCM was called.
      await dispatch();
    }

    return notification;
  }
}

export const notificationService = new NotificationService();
