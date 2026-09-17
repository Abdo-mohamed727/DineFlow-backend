import { Router } from 'express';
import { waiterRequestController } from '../controllers/waiterRequest.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  createWaiterRequestSchema,
  waiterRequestParamsSchema,
  updateWaiterRequestStatusSchema,
  listWaiterRequestsQuerySchema,
} from '../validators/waiterRequest.validator';

const router = Router();

router.use(authenticate);

// Customer creates a waiter request
router.post(
  '/',
  authorize('customer'),
  validate(createWaiterRequestSchema, 'body'),
  waiterRequestController.create,
);

// Customer sees own; waiter sees all
router.get('/', validate(listWaiterRequestsQuerySchema, 'query'), waiterRequestController.list);
router.get('/:id', validate(waiterRequestParamsSchema, 'params'), waiterRequestController.getById);

// Waiter updates status
router.patch(
  '/:id/status',
  authorize('waiter'),
  validate(waiterRequestParamsSchema, 'params'),
  validate(updateWaiterRequestStatusSchema, 'body'),
  waiterRequestController.updateStatus,
);

export default router;
