import { Router } from 'express';
import { notificationController } from '../controllers/notification.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  notificationParamsSchema,
  listNotificationsQuerySchema,
  registerDeviceTokenSchema,
} from '../validators/notification.validator';

const router = Router();

router.use(authenticate);

// Notifications list / read
router.get('/', validate(listNotificationsQuerySchema, 'query'), notificationController.list);
router.patch('/:id/read', validate(notificationParamsSchema, 'params'), notificationController.markAsRead);
router.patch('/read-all', notificationController.markAllRead);

// FCM device token registration (used by Flutter app to receive push notifications).
// The user id is taken from the JWT — the body only contains the FCM token.
router.post('/device-token', validate(registerDeviceTokenSchema, 'body'), notificationController.registerDeviceToken);
router.delete('/device-token', validate(registerDeviceTokenSchema, 'body'), notificationController.unregisterDeviceToken);

export default router;
