import { Router } from 'express';
import { orderController } from '../controllers/order.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  createOrderSchema,
  orderParamsSchema,
  updateOrderStatusSchema,
  listOrdersQuerySchema,
} from '../validators/order.validator';

const router = Router();

router.use(authenticate);

// Create order - customer or waiter (waiter may place on behalf of customer)
router.post(
  '/',
  authorize('customer', 'waiter'),
  validate(createOrderSchema, 'body'),
  orderController.create,
);

// List - customers see only their own; staff see all
router.get('/', validate(listOrdersQuerySchema, 'query'), orderController.list);

// Get by id - allowed to customer (own), waiter, kitchen
router.get('/:id', validate(orderParamsSchema, 'params'), orderController.getById);

// Cancel - customer-only (staff should use status update)
router.patch(
  '/:id/cancel',
  authorize('customer'),
  validate(orderParamsSchema, 'params'),
  orderController.cancel,
);

// Status update - kitchen & waiter only
router.patch(
  '/:id/status',
  authorize('waiter', 'kitchen'),
  validate(orderParamsSchema, 'params'),
  validate(updateOrderStatusSchema, 'body'),
  orderController.updateStatus,
);

export default router;
