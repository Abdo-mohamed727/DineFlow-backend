import { Router, Request, Response, NextFunction } from 'express';
import { orderController } from '../controllers/order.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  createCustomerOrderSchema,
  createWaiterOrderSchema,
  orderParamsSchema,
  updateOrderStatusSchema,
  listOrdersQuerySchema,
} from '../validators/order.validator';
import { Role } from '../types';

const router = Router();

router.use(authenticate);

/**
 * Role-based schema picker for the create-order endpoint.
 *
 * Customers MUST NOT send `items` in the body — they order from their cart.
 * Waiters MUST send `items` in the body — they don't have a cart.
 *
 * Both schemas are `.strict()` so any other unexpected field is also
 * rejected with VALIDATION_ERROR.
 *
 * This middleware MUST run AFTER `authenticate` (which sets `req.user.role`)
 * and AFTER `authorize('customer', 'waiter')` (which guarantees the role is
 * one of those two). The schema is then picked deterministically by role.
 */
function validateCreateOrder(req: Request, _res: Response, next: NextFunction) {
  const role = req.user?.role as Role | undefined;
  const schema = role === 'waiter'
    ? createWaiterOrderSchema
    : createCustomerOrderSchema;
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return next(result.error);
  }
  // Replace with parsed + coerced values
  req.body = result.data;
  next();
}

// Create order — customer (cart-driven) or waiter (items-in-body).
// authorize() runs BEFORE validateCreateOrder so the role is guaranteed.
router.post(
  '/',
  authorize('customer', 'waiter'),
  validateCreateOrder,
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
