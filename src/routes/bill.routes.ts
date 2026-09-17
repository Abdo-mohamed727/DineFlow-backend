import { Router } from 'express';
import { billController } from '../controllers/bill.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { billParamsSchema, diningSessionBillParamsSchema } from '../validators/bill.validator';

const router = Router();

router.use(authenticate);

// Generate bill for a dining session - MUST come before /:id (more specific path)
router.get(
  '/dining-sessions/:id',
  authorize('waiter', 'kitchen'),
  validate(diningSessionBillParamsSchema, 'params'),
  billController.getForDiningSession,
);

// Get bill by ID - staff only (waiter / kitchen)
router.get('/:id', authorize('waiter', 'kitchen'), validate(billParamsSchema, 'params'), billController.getById);

// Mark bill as paid - staff only
router.patch('/:id/pay', authorize('waiter', 'kitchen'), validate(billParamsSchema, 'params'), billController.markPaid);

export default router;
