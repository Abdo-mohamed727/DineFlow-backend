import { Router } from 'express';
import { cartController } from '../controllers/cart.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  addCartItemSchema,
  updateCartItemSchema,
  cartItemParamsSchema,
} from '../validators/cart.validator';

/**
 * Cart routes — customer-only.
 *
 * All cart endpoints require authentication. Only the `customer` role may
 * use them. Waiters and kitchen staff do not have a cart (they create
 * orders directly on behalf of customers, using the items-in-body form of
 * POST /api/orders).
 *
 * The authenticated user id is always taken from `req.user.id` (set by the
 * `authenticate` middleware) — never from the request body. This prevents
 * a customer from manipulating another customer's cart.
 */
const router = Router();

// All cart routes require an authenticated customer
router.use(authenticate);
router.use(authorize('customer'));

// GET /api/cart — get the customer's cart (empty shape if none exists)
router.get('/', cartController.getCart);

// POST /api/cart/items — add a product to the cart (or increment quantity)
router.post(
  '/items',
  validate(addCartItemSchema, 'body'),
  cartController.addItem,
);

// PATCH /api/cart/items/:productId — update an item's quantity
router.patch(
  '/items/:productId',
  validate(cartItemParamsSchema, 'params'),
  validate(updateCartItemSchema, 'body'),
  cartController.updateItem,
);

// DELETE /api/cart/items/:productId — remove a product from the cart
router.delete(
  '/items/:productId',
  validate(cartItemParamsSchema, 'params'),
  cartController.removeItem,
);

// DELETE /api/cart — clear all items from the cart
router.delete('/', cartController.clearCart);

export default router;
