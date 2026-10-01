import { z } from 'zod';
import { objectId } from './common';

export const notificationParamsSchema = z.object({
  id: objectId,
});

export const listNotificationsQuerySchema = z.object({
  isRead: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/**
 * POST/DELETE /api/notifications/device-token
 *
 * The FCM token is a long opaque string issued by Firebase. We just require
 * it to be a non-empty string under 4 KB (FCM's documented max token length
 * is much smaller; this is a safety net).
 *
 * The user id is NEVER accepted from the body — it's always taken from the
 * JWT (`req.user.id`). This prevents a user from registering tokens on
 * another user's account.
 */
export const registerDeviceTokenSchema = z.object({
  token: z.string().trim().min(10, 'FCM token is too short').max(4096, 'FCM token is too long'),
}).strict();

export type RegisterDeviceTokenInput = z.infer<typeof registerDeviceTokenSchema>;
