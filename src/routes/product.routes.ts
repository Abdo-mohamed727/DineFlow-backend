import { Router } from 'express';
import { productController } from '../controllers/product.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  createProductSchema,
  updateProductSchema,
  productParamsSchema,
  listProductsQuerySchema,
} from '../validators/product.validator';
import { uploadSingle } from '../middlewares/upload.middleware';

const router = Router();

// Public reads - any authenticated user
router.get('/', authenticate, validate(listProductsQuerySchema, 'query'), productController.list);
router.get('/:id', authenticate, validate(productParamsSchema, 'params'), productController.getById);

// Management endpoints - waiter/kitchen
router.post(
  '/',
  authenticate,
  authorize('waiter', 'kitchen'),
  uploadSingle('image'),
  validate(createProductSchema, 'body'),
  productController.create,
);
router.patch(
  '/:id',
  authenticate,
  authorize('waiter', 'kitchen'),
  uploadSingle('image'),
  validate(productParamsSchema, 'params'),
  validate(updateProductSchema, 'body'),
  productController.update,
);
router.delete(
  '/:id',
  authenticate,
  authorize('waiter', 'kitchen'),
  validate(productParamsSchema, 'params'),
  productController.remove,
);

export default router;
