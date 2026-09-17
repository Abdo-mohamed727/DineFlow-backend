import { OrderModel } from '../models/order.model';
import { OrderStatus, OrderType } from '../types';
import { NotFoundError } from '../errors/AppError';
import { ErrorCodes } from '../errors/errorCodes';
import mongoose from 'mongoose';

export interface OrderListFilter {
  status?: OrderStatus;
  type?: OrderType;
  customerId?: string;
  diningSessionId?: string;
  page?: number;
  limit?: number;
}

export class OrderRepository {
  /**
   * Generate next sequential order number, e.g. ORD-000123.
   * Not safe against concurrent inserts (race) - acceptable for a single-instance deployment.
   * For multi-instance, use a counter collection or pre-allocated sequence.
   */
  async nextOrderNumber(): Promise<string> {
    const count = await OrderModel.countDocuments();
    return `ORD-${String(count + 1).padStart(6, '0')}`;
  }

  async create(data: {
    orderNumber: string;
    customerId: string;
    diningSessionId?: string;
    tableId?: string;
    type: OrderType;
    items: Array<{ productId: string; productName: string; quantity: number; unitPrice: number; subtotal: number }>;
    status: OrderStatus;
    subtotal: number;
    tax: number;
    total: number;
    notes?: string;
  }) {
    return OrderModel.create(data);
  }

  async findById(id: string) {
    if (!mongoose.isValidObjectId(id)) {
      throw new NotFoundError('Order not found', ErrorCodes.ORDER_NOT_FOUND);
    }
    const o = await OrderModel.findById(id)
      .populate('customerId', 'name email phone')
      .populate('tableId', 'tableNumber capacity')
      .populate('diningSessionId', 'tableId status');
    if (!o) throw new NotFoundError('Order not found', ErrorCodes.ORDER_NOT_FOUND);
    return o;
  }

  async findByIdRaw(id: string) {
    if (!mongoose.isValidObjectId(id)) {
      throw new NotFoundError('Order not found', ErrorCodes.ORDER_NOT_FOUND);
    }
    const o = await OrderModel.findById(id);
    if (!o) throw new NotFoundError('Order not found', ErrorCodes.ORDER_NOT_FOUND);
    return o;
  }

  async findMany(filter: OrderListFilter) {
    const { status, type, customerId, diningSessionId, page = 1, limit = 50 } = filter;
    const q: Record<string, unknown> = {};
    if (status) q.status = status;
    if (type) q.type = type;
    if (customerId) q.customerId = customerId;
    if (diningSessionId) q.diningSessionId = diningSessionId;

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      OrderModel.find(q)
        .populate('customerId', 'name')
        .populate('tableId', 'tableNumber')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      OrderModel.countDocuments(q),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findByDiningSession(diningSessionId: string) {
    return OrderModel.find({ diningSessionId }).sort({ createdAt: 1 });
  }

  async updateStatus(id: string, status: OrderStatus) {
    const o = await OrderModel.findByIdAndUpdate(id, { status }, { new: true });
    if (!o) throw new NotFoundError('Order not found', ErrorCodes.ORDER_NOT_FOUND);
    return o;
  }

  async cancel(id: string, cancelledBy: string) {
    const o = await OrderModel.findByIdAndUpdate(
      id,
      { status: 'cancelled', cancelledBy, cancelledAt: new Date() },
      { new: true },
    );
    if (!o) throw new NotFoundError('Order not found', ErrorCodes.ORDER_NOT_FOUND);
    return o;
  }
}

export const orderRepository = new OrderRepository();
