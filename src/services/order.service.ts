import { orderRepository } from '../repositories/order.repository';
import { productRepository } from '../repositories/product.repository';
import { diningSessionRepository } from '../repositories/diningSession.repository';
import { notificationRepository } from '../repositories/notification.repository';
import { notificationService } from './notification.service';
import { cartRepository } from '../repositories/cart.repository';
import { realtimeService } from '../realtime/realtime.service';
import { calculateTotals } from '../utils/pricing';
import {
  assertTransition,
  isCustomerCancellable,
  STATUS_ROLE_MATRIX,
} from '../utils/orderStatus';
import { AppError, NotFoundError, ForbiddenError } from '../errors/AppError';
import { ErrorCodes } from '../errors/errorCodes';
import { ORDER_STATUS, ORDER_TYPES, OrderStatus, Role } from '../types';
import type {
  CreateCustomerOrderInput,
  CreateWaiterOrderInput,
  ListOrdersQuery,
  UpdateOrderStatusInput,
} from '../validators/order.validator';

export class OrderService {
  /**
   * Create an order. Role-based business rules:
   *
   *   - **Customer**: MUST create from their server-side cart. They must NOT
   *     send `items` in the request body (the validator rejects `items` for
   *     customer requests via `createCustomerOrderSchema`). The backend
   *     reads the cart, validates non-empty, snapshots catalog prices,
   *     creates the order, and clears the cart on success.
   *
   *   - **Waiter**: MUST send `items` in the body. Waiters do not have a
   *     cart. The cart is NEVER touched for waiter-placed orders.
   *
   * In both modes, the backend is the single source of truth for ALL money
   * fields: we fetch products from MongoDB, verify they exist and are
   * available, snapshot their prices (and productName), and compute
   * subtotal / tax / total.
   *
   * Cart clearing behavior:
   *   - Cart is cleared ONLY on successful order creation by a customer.
   *   - If order creation fails (validation, unavailable product, etc.),
   *     the cart is NOT cleared — the customer can retry.
   *   - Waiter-placed orders do NOT touch any cart.
   */
  async create(
    input: CreateCustomerOrderInput | CreateWaiterOrderInput,
    customerId: string,
    role: Role,
  ) {
    // Resolve the items to order based on role.
    let orderItems: Array<{ productId: string; quantity: number }>;
    let itemsSource: 'cart' | 'body';

    if (role === 'customer') {
      // Customer MUST use the cart. The customer validator already rejects
      // `items` in the body (strict schema), so by the time we get here
      // `input.items` is undefined. Read the cart from MongoDB.
      const cart = await cartRepository.findByCustomerId(customerId);
      if (!cart || cart.items.length === 0) {
        throw new AppError('Cart is empty', 400, ErrorCodes.EMPTY_CART);
      }
      orderItems = cart.items.map((i) => ({
        productId: i.productId.toString(),
        quantity: i.quantity,
      }));
      itemsSource = 'cart';
    } else if (role === 'waiter') {
      // Waiter MUST send items in the body. The waiter validator already
      // enforces `items` is present and non-empty.
      const waiterInput = input as CreateWaiterOrderInput;
      orderItems = waiterInput.items.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
      }));
      itemsSource = 'body';
    } else {
      // Kitchen or any other role is not allowed to create orders at all.
      // (The route-level authorize('customer', 'waiter') middleware already
      // blocks this, but we keep the guard here for defense-in-depth.)
      throw new ForbiddenError('Only customer or waiter can create orders');
    }

    // Fetch all requested products in one round-trip
    const productIds = orderItems.map((i) => i.productId);
    const products = await productRepository.findByIds(productIds);

    if (products.length !== productIds.length) {
      throw new AppError(
        'One or more products were not found',
        400,
        ErrorCodes.PRODUCT_NOT_FOUND,
      );
    }

    // Build a lookup map
    const productMap = new Map(products.map((p) => [p.id, p]));

    // Validate availability and build snapshot items
    const snapshotItems = orderItems.map((item) => {
      const product = productMap.get(item.productId);
      if (!product) {
        throw new NotFoundError(`Product ${item.productId} not found`, ErrorCodes.PRODUCT_NOT_FOUND);
      }
      if (!product.isAvailable) {
        throw new AppError(
          `Product "${product.name}" is not available`,
          400,
          ErrorCodes.PRODUCT_UNAVAILABLE,
        );
      }
      const unitPrice = product.price;
      const subtotal = round2(unitPrice * item.quantity);
      return {
        productId: product.id,
        productName: product.name,
        quantity: item.quantity,
        unitPrice,
        subtotal,
      };
    });

    // Totals
    const totals = calculateTotals({
      items: snapshotItems.map((it) => ({ unitPrice: it.unitPrice, quantity: it.quantity })),
    });

    // Validate dining session for DINE_IN
    let tableId: string | undefined;
    if (input.orderType === ORDER_TYPES.DINE_IN) {
      if (!input.diningSessionId) {
        throw new AppError('DINE_IN order requires diningSessionId', 400, ErrorCodes.VALIDATION_ERROR);
      }
      const session = await diningSessionRepository.findByIdRaw(input.diningSessionId);
      if (session.status !== 'active') {
        throw new AppError(
          'Dining session is not active',
          400,
          ErrorCodes.SESSION_CLOSED,
        );
      }
      tableId = session.tableId.toString();
    }

    // Generate order number
    const orderNumber = await orderRepository.nextOrderNumber();

    const order = await orderRepository.create({
      orderNumber,
      customerId,
      diningSessionId: input.diningSessionId,
      tableId,
      type: input.orderType,
      items: snapshotItems,
      status: ORDER_STATUS.PENDING,
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,
      notes: input.notes,
    });

    // Notify customer that order was received
    await notificationRepository.create({
      userId: customerId,
      title: 'Order received',
      message: `Your order ${orderNumber} has been received and is pending confirmation.`,
      type: 'ORDER_UPDATE',
      data: { orderId: order.id, status: ORDER_STATUS.PENDING },
    });

    // Notify ALL kitchen users that a new order has been placed.
    // This is a best-effort, fire-and-forget notification: FCM failures are
    // logged but never cause the order creation to fail. The order is
    // already persisted at this point.
    try {
      await notificationService.notifyKitchenNewOrder({
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: order.status as string,
      });
    } catch (err) {
      // Defensive: notifyKitchenNewOrder itself never throws on FCM errors,
      // but if something unexpected happens (e.g. DB query for kitchen users
      // fails), we log and continue — the order is already created.
      // eslint-disable-next-line no-console
      console.warn(`Failed to notify kitchen of new order ${order.id}:`, (err as Error).message);
    }

    // Real-time push to the kitchen room via Socket.IO. Best-effort —
    // the realtime service is a no-op if Socket.IO isn't initialized.
    // The payload is the order document in its REST response shape
    // (post-toJSON), so the Flutter KDS client can render it directly.
    realtimeService.emitOrderCreated(
      (order.toJSON ? order.toJSON() : (order as unknown as Record<string, unknown>)) as Record<string, unknown>,
    );

    // Cart clearing: ONLY when items came from the cart AND the order was
    // successfully created. If order creation threw above, we never reach
    // this line — the cart stays intact for retry.
    if (itemsSource === 'cart') {
      try {
        await cartRepository.clear(customerId);
      } catch (err) {
        // Best-effort: log but don't fail the order. The order is already
        // persisted; a stale cart item is a minor UX issue, not a data
        // integrity issue (next add-to-cart will overwrite the cleared state).
        // eslint-disable-next-line no-console
        console.warn(`Failed to clear cart for customer ${customerId} after order ${order.id}:`, (err as Error).message);
      }
    }

    return order;
  }

  async getById(id: string) {
    return orderRepository.findById(id);
  }

  async findMyOrders(customerId: string, query: ListOrdersQuery) {
    return orderRepository.findMany({ ...query, customerId });
  }

  async findMany(query: ListOrdersQuery) {
    return orderRepository.findMany(query);
  }

  /**
   * Customer cancellation - only allowed in pending or confirmed states.
   */
  async cancelByCustomer(orderId: string, customerId: string) {
    const order = await orderRepository.findByIdRaw(orderId);
    if (order.customerId.toString() !== customerId) {
      throw new ForbiddenError('You cannot cancel another customer\'s order');
    }
    if (!isCustomerCancellable(order.status as OrderStatus)) {
      throw new AppError(
        `Order cannot be cancelled in status "${order.status}"`,
        400,
        ErrorCodes.ORDER_NOT_CANCELLABLE,
      );
    }
    const updated = await orderRepository.cancel(orderId, customerId);
    return updated;
  }

  /**
   * Status transition driven by staff (kitchen / waiter). The role permitted
   * to perform each transition is enforced by STATUS_ROLE_MATRIX.
   *
   * Side effects:
   *   - If the status actually changed (`oldStatus !== newStatus`), a
   *     notification is persisted and an FCM push is dispatched to the
   *     customer who owns the order (best-effort — never fails the order).
   *   - If the status did NOT change (e.g. idempotent retry with the same
   *     status value), no notification is created and no FCM push is sent.
   *     This prevents duplicate notifications.
   */
  async updateStatus(orderId: string, input: UpdateOrderStatusInput, role: Role) {
    const order = await orderRepository.findByIdRaw(orderId);
    const target = input.status as OrderStatus;
    assertTransition(order.status as OrderStatus, target);

    const allowedRole = STATUS_ROLE_MATRIX[target];
    if (allowedRole && allowedRole !== role) {
      throw new ForbiddenError(
        `Role "${role}" is not allowed to transition order to "${target}"`,
      );
    }

    const oldStatus = order.status as OrderStatus;
    const updated = await orderRepository.updateStatus(orderId, target);

    // Only notify when the status actually changed. This guard prevents
    // duplicate notifications if the same status is sent twice (idempotent
    // retry, network blip, etc.). Note: `assertTransition` already throws
    // when current === target, so in practice we never reach this line
    // with oldStatus === newStatus — but the guard is defensive.
    if (oldStatus !== target) {
      // notifyOrderStatusChanged persists the notification AND dispatches
      // FCM. It never throws on FCM failure (best-effort), so the order
      // status update remains successful regardless of push outcome.
      await notificationService.notifyOrderStatusChanged({
        userId: order.customerId.toString(),
        orderId: order.id,
        orderNumber: order.orderNumber,
        newStatus: target,
      });

      // Real-time Socket.IO push to kitchen + waiter + the specific customer.
      // Best-effort — no-op if Socket.IO isn't initialized (e.g. in tests
      // that don't boot the full server).
      realtimeService.emitOrderStatusChanged({
        orderId: order.id,
        orderNumber: order.orderNumber,
        newStatus: target,
        oldStatus,
        customerId: order.customerId.toString(),
      });
    }

    return updated;
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export const orderService = new OrderService();
