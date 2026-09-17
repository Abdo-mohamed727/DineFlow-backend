import { Router } from 'express';
import { diningSessionController } from '../controllers/diningSession.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  createDiningSessionSchema,
  diningSessionParamsSchema,
} from '../validators/diningSession.validator';

const router = Router();

router.use(authenticate);

// Customer or waiter can start a session at a table
router.post(
  '/',
  authorize('customer', 'waiter'),
  validate(createDiningSessionSchema, 'body'),
  diningSessionController.start,
);

// Waiter sees active sessions
router.get('/', authorize('waiter'), diningSessionController.listActive);

// Anyone authenticated can view a session by ID (use case: customer on table)
router.get('/:id', validate(diningSessionParamsSchema, 'params'), diningSessionController.getById);

// Waiter closes the session
router.post(
  '/:id/close',
  authorize('waiter'),
  validate(diningSessionParamsSchema, 'params'),
  diningSessionController.close,
);

export default router;
