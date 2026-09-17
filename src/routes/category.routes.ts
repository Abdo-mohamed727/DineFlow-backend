import { Router } from 'express';
import { categoryController } from '../controllers/category.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { createCategorySchema, updateCategorySchema, categoryParamsSchema } from '../validators/category.validator';
import { uploadSingle } from '../middlewares/upload.middleware';

const router = Router();

// Public read - available to all authenticated users
router.get('/', authenticate, categoryController.list);
router.get('/:id', authenticate, validate(categoryParamsSchema, 'params'), categoryController.getById);

// Management endpoints - waiter/kitchen only (no admin role in this version)
router.post(
  '/',
  authenticate,
  authorize('waiter', 'kitchen'),
  uploadSingle('image'),
  validate(createCategorySchema, 'body'),
  categoryController.create,
);
router.patch(
  '/:id',
  authenticate,
  authorize('waiter', 'kitchen'),
  uploadSingle('image'),
  validate(categoryParamsSchema, 'params'),
  validate(updateCategorySchema, 'body'),
  categoryController.update,
);
router.delete(
  '/:id',
  authenticate,
  authorize('waiter', 'kitchen'),
  validate(categoryParamsSchema, 'params'),
  categoryController.remove,
);

export default router;
