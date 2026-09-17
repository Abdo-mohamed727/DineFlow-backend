import { orderRepository } from '../repositories/order.repository';
import { productRepository } from '../repositories/product.repository';
import { diningSessionRepository } from '../repositories/diningSession.repository';
import { notificationRepository } from '../repositories/notification.repository';
import { calculateTotals } from '../utils/pricing';
import {
  assertTransition,
  isCustomerCancellable,
  STATUS_ROLE_MATRIX,
} from '../utils/orderStatus';
import { AppError, NotFoundError, ForbiddenError } from '../errors/AppError';
import { ErrorCodes } from '../errors/errorCodes';
import { ORDER_STATUS, ORDER_TYPES, OrderStatus, Role } from '../types';
import type { CreateOrderInput, ListOrdersQuery, UpdateOrderStatusInput } from '../validators/order.validator';

export class OrderService {
  /**
   * Create an order. The client sends only:
   *   { orderType, items: [{productId, quantity}], diningSessionId?, notes? }
   *
   * The backend is the source of truth for ALL money fields - we fetch
   * products, verify they exist and are available, snapshot their prices
   * (and productName), and compute subtotal / tax / total.
   */
  async create(input: CreateOrderInput, customerId: string) {
    // Fetch all requested products in one round-trip
    const productIds = input.items.map((i) => i.productId);
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
    const snapshotItems = input.items.map((item) => {
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

    const updated = await orderRepository.updateStatus(orderId, target);

    // Notify customer
    await notificationRepository.create({
      userId: order.customerId.toString(),
      title: 'Order status updated',
      message: `Your order ${order.orderNumber} is now "${target}".`,
      type: 'ORDER_UPDATE',
      data: { orderId: order.id, status: target },
    });

    return updated;
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export const orderService = new OrderService();
