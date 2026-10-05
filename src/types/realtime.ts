/**
 * Real-time (Socket.IO) event names and payload types.
 *
 * These constants live in `src/types/` so they can be imported by both:
 *   - The realtime service (which emits the events)
 *   - The order service (which decides WHEN to emit)
 *
 * The Flutter client should use the same string values to subscribe.
 *
 * Design note:
 *   We do NOT emit raw Mongoose documents over the socket. We emit the
 *   same `toObject()` / `toJSON()` shape that the REST API returns, so the
 *   Flutter client can use the same DTO classes for both REST and realtime
 *   updates. This keeps a single source of truth for the Order shape.
 */

/** Event emitted to the kitchen room when a customer places a new order. */
export const ORDER_CREATED_EVENT = 'order_created';

/** Event emitted when an order's status changes (e.g. pending → confirmed). */
export const ORDER_STATUS_CHANGED_EVENT = 'order_status_changed';

/**
 * Rooms. A socket joins a role-specific room after JWT authentication.
 * The server then uses `io.to(ROOM.KITCHEN).emit(...)` to broadcast
 * only to sockets that proved they have the kitchen role.
 *
 * Adding a new room is a one-line change here (e.g. `WAITER: 'waiter'`).
 */
export const ROOM = {
  KITCHEN: 'kitchen',
  WAITER: 'waiter',
  CUSTOMER: 'customer',
} as const;

/**
 * Payload sent with `order_created`. Mirrors the REST response shape so the
 * Flutter client can deserialize it with the same Order model it already has.
 *
 * The order is a Mongoose document that has been through `.toJSON()`
 * (which applies the schema's `transform` — renames `_id` → `id`, strips
 * `__v`, etc.). We type it loosely as `Record<string, unknown>` here to
 * avoid importing Mongoose types into the realtime layer; the runtime
 * shape is exactly what the REST API returns.
 */
export interface OrderCreatedPayload {
  /** The order document (post-toJSON shape — `id` instead of `_id`). */
  order: Record<string, unknown>;
}

export interface OrderStatusChangedPayload {
  /** The order id (string form of ObjectId). */
  orderId: string;
  /** The human-readable order number, e.g. "ORD-000001". */
  orderNumber: string;
  /** The new status the order transitioned to. */
  newStatus: string;
  /** The previous status (useful for the client to decide if it cares). */
  oldStatus: string;
}
