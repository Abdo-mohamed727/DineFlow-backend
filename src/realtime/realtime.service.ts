import { getIO } from './socket';
import {
  ORDER_CREATED_EVENT,
  ORDER_STATUS_CHANGED_EVENT,
  ROOM,
  type OrderCreatedPayload,
  type OrderStatusChangedPayload,
} from '../types/realtime';

/**
 * Realtime service — thin wrapper around Socket.IO that the OrderService
 * (and other services) can call without importing Socket.IO directly.
 *
 * Why this layer exists:
 *   - Keeps `OrderService` free of Socket.IO imports (separation of concerns).
 *   - If Socket.IO isn't initialized (e.g. in tests that don't boot the full
 *     server), these methods are silent no-ops — they never throw.
 *   - Centralizes the event names + payload shapes so we don't have magic
 *     strings scattered across services.
 *
 * Failure contract:
 *   - If `getIO()` returns null (Socket.IO not initialized), the method
 *     silently returns. This matches the FCM service's "not-configured"
 *     behavior — the REST operation remains the source of truth.
 *   - If `io.to(...).emit()` throws (it shouldn't, but defensive), the
 *     error is logged and swallowed. Order creation / status updates
 *     must never fail because of realtime delivery.
 */
class RealtimeService {
  /**
   * Emit `order_created` to the kitchen room. Called by OrderService.create()
   * right after the order is persisted to MongoDB.
   *
   * The payload includes the full order document (post-toJSON shape) so the
   * Flutter KDS client can render the new order without a follow-up REST
   * fetch. The shape is identical to what `POST /api/orders` returns.
   */
  emitOrderCreated(order: Record<string, unknown>): void {
    const io = getIO();
    if (!io) return;

    const payload: OrderCreatedPayload = { order };

    try {
      io.to(ROOM.KITCHEN).emit(ORDER_CREATED_EVENT, payload);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[Realtime] failed to emit order_created:', (err as Error).message);
    }
  }

  /**
   * Emit `order_status_changed`. Called by OrderService.updateStatus() right
   * after the MongoDB update succeeds.
   *
   * Targets:
   *   - The `kitchen` room (KDS needs to know status changes to update its
   *     board — e.g. move the order from "New" to "Preparing").
   *   - The `waiter` room (waiters need to know when an order is ready to serve).
   *   - The specific customer's user room (`user:<customerId>`) so only the
   *     order owner gets a push (not all customers).
   *
   * This matches the existing FCM notification fan-out pattern: the customer
   * who owns the order is notified, plus the staff rooms that care.
   */
  emitOrderStatusChanged(params: {
    orderId: string;
    orderNumber: string;
    newStatus: string;
    oldStatus: string;
    customerId: string;
  }): void {
    const io = getIO();
    if (!io) return;

    const { orderId, orderNumber, newStatus, oldStatus, customerId } = params;
    const payload: OrderStatusChangedPayload = {
      orderId,
      orderNumber,
      newStatus,
      oldStatus,
    };

    try {
      // Kitchen KDS — needs every status change.
      io.to(ROOM.KITCHEN).emit(ORDER_STATUS_CHANGED_EVENT, payload);
      // Waiters — need to know when an order is ready / served / completed.
      io.to(ROOM.WAITER).emit(ORDER_STATUS_CHANGED_EVENT, payload);
      // The specific customer who owns the order.
      io.to(`user:${customerId}`).emit(ORDER_STATUS_CHANGED_EVENT, payload);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[Realtime] failed to emit order_status_changed:', (err as Error).message);
    }
  }
}

export const realtimeService = new RealtimeService();
