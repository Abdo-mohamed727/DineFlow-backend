import { z } from 'zod';
import { objectId } from './common';

export const orderItemSchema = z.object({
  productId: objectId,
  quantity: z.coerce.number().int().min(1).max(100),
});

/**
 * Create Order request schema.
 *
 * The client sends ONLY:
 *   { orderType, items: [{ productId, quantity }], diningSessionId?, notes? }
 *
 * The client must NOT send unitPrice / subtotal / tax / total — those are
 * always computed by the backend from current product prices. The schema is
 * `.strict()` so any extra field (including price fields) is rejected.
 */
export const createOrderSchema = z.object({
  orderType: z.enum(['DINE_IN', 'TAKEAWAY']),
  diningSessionId: objectId.optional(),
  tableId: objectId.optional(),
  items: z.array(orderItemSchema).min(1, 'At least one item is required'),
  notes: z.string().trim().max(500).optional(),
}).strict()
  .refine((data) => {
    // TAKEAWAY does not require table / diningSession
    if (data.orderType === 'TAKEAWAY') return true;
    // DINE_IN requires a diningSessionId (tableId is implied by the session)
    return !!data.diningSessionId;
  }, {
    message: 'DINE_IN orders require a diningSessionId',
    path: ['diningSessionId'],
  });

export const orderParamsSchema = z.object({
  id: objectId,
});

export const updateOrderStatusSchema = z.object({
  status: z.enum(['confirmed', 'preparing', 'ready', 'served', 'completed', 'cancelled']),
}).strict();

export const listOrdersQuerySchema = z.object({
  status: z.enum(['pending', 'confirmed', 'preparing', 'ready', 'served', 'completed', 'cancelled']).optional(),
  // Note: kept as `type` in the query string for backward compatibility with
  // existing clients; the persisted field on Order is still `type`.
  type: z.enum(['DINE_IN', 'TAKEAWAY']).optional(),
  customerId: objectId.optional(),
  diningSessionId: objectId.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;
