import { z } from 'zod';
import { objectId } from './common';

/**
 * Cart request validators.
 *
 * All endpoints that take a productId in the body or params use the shared
 * `objectId` regex so the format is validated by Zod before reaching the
 * controller. Quantity must be a positive integer >= 1 (no zero, negative,
 * decimal, or non-numeric values accepted).
 *
 * Schemas are `.strict()` to match the rest of the project's validators.
 */

/** POST /api/cart/items body. */
export const addCartItemSchema = z.object({
  productId: objectId,
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1').max(100, 'Quantity too large'),
}).strict();

/** PATCH /api/cart/items/:productId body. */
export const updateCartItemSchema = z.object({
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1').max(100, 'Quantity too large'),
}).strict();

/** :productId param in PATCH/DELETE /api/cart/items/:productId. */
export const cartItemParamsSchema = z.object({
  productId: objectId,
});

export type AddCartItemInput = z.infer<typeof addCartItemSchema>;
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;
