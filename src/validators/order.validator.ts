import { z } from 'zod';
import { objectId } from './common';

export const orderItemSchema = z.object({
  productId: objectId,
  quantity: z.coerce.number().int().min(1).max(100),
});

/**
 * Customer Create Order request schema.
 *
 * Customers MUST create orders from their server-side cart. They MUST NOT send
 * `items` in the request body. The schema is `.strict()` so any `items`
 * field is rejected with VALIDATION_ERROR — the cart is the single source
 * of truth for what the customer wants to order.
 *
 * The customer sends ONLY:
 *   { orderType, diningSessionId?, notes? }
 *
 * The backend reads the authenticated customer's cart, validates it is
 * non-empty, snapshots the catalog prices, creates the order, and clears
 * the cart on success.
 */
export const createCustomerOrderSchema = z.object({
  orderType: z.enum(['DINE_IN', 'TAKEAWAY']),
  diningSessionId: objectId.optional(),
  tableId: objectId.optional(),
  notes: z.string().trim().max(500).optional(),
}).strict()
  .refine((data) => {
    if (data.orderType === 'TAKEAWAY') return true;
    return !!data.diningSessionId;
  }, {
    message: 'DINE_IN orders require a diningSessionId',
    path: ['diningSessionId'],
  });

/**
 * Waiter Create Order request schema.
 *
 * Waiters create orders on behalf of customers (e.g. at-table ordering) and
 * do NOT use the cart. They MUST send `items: [{ productId, quantity }]`
 * directly in the body.
 *
 * The client must NOT send unitPrice / subtotal / tax / total — the schema
 * is `.strict()` and the backend computes them from current product prices.
 */
export const createWaiterOrderSchema = z.object({
  orderType: z.enum(['DINE_IN', 'TAKEAWAY']),
  diningSessionId: objectId.optional(),
  tableId: objectId.optional(),
  items: z.array(orderItemSchema).min(1, 'At least one item is required'),
  notes: z.string().trim().max(500).optional(),
}).strict()
  .refine((data) => {
    if (data.orderType === 'TAKEAWAY') return true;
    return !!data.diningSessionId;
  }, {
    message: 'DINE_IN orders require a diningSessionId',
    path: ['diningSessionId'],
  });

/**
 * Backward-compat alias. The route layer now picks the schema based on the
 * authenticated role, but `createOrderSchema` is kept as an export for any
 * code that still imports it (it accepts the union shape — items optional).
 *
 * @deprecated use `createCustomerOrderSchema` or `createWaiterOrderSchema`
 *             instead, picked by role in the route handler.
 */
export const createOrderSchema = z.object({
  orderType: z.enum(['DINE_IN', 'TAKEAWAY']),
  diningSessionId: objectId.optional(),
  tableId: objectId.optional(),
  items: z.array(orderItemSchema).min(1, 'At least one item is required').optional(),
  notes: z.string().trim().max(500).optional(),
}).strict()
  .refine((data) => {
    if (data.orderType === 'TAKEAWAY') return true;
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

export type CreateCustomerOrderInput = z.infer<typeof createCustomerOrderSchema>;
export type CreateWaiterOrderInput = z.infer<typeof createWaiterOrderSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;
