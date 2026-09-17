import { Router } from 'express';
import { notificationController } from '../controllers/notification.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { notificationParamsSchema, listNotificationsQuerySchema } from '../validators/notification.validator';

const router = Router();

router.use(authenticate);

router.get('/', validate(listNotificationsQuerySchema, 'query'), notificationController.list);
router.patch('/:id/read', validate(notificationParamsSchema, 'params'), notificationController.markAsRead);
router.patch('/read-all', notificationController.markAllRead);

export default router;
