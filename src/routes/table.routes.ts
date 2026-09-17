import { Router } from 'express';
import { tableController } from '../controllers/table.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { createTableSchema, updateTableSchema, tableParamsSchema } from '../validators/table.validator';

const router = Router();

// Reads - available to any authenticated user
router.get('/', authenticate, tableController.list);
router.get('/:id', authenticate, validate(tableParamsSchema, 'params'), tableController.getById);

// Management - waiter only
router.post(
  '/',
  authenticate,
  authorize('waiter'),
  validate(createTableSchema, 'body'),
  tableController.create,
);
router.patch(
  '/:id',
  authenticate,
  authorize('waiter'),
  validate(tableParamsSchema, 'params'),
  validate(updateTableSchema, 'body'),
  tableController.update,
);
router.delete(
  '/:id',
  authenticate,
  authorize('waiter'),
  validate(tableParamsSchema, 'params'),
  tableController.remove,
);

export default router;
