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
