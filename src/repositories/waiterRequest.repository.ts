import { WaiterRequestModel } from '../models/waiterRequest.model';
import { WaiterRequestStatus, WaiterRequestType } from '../types';
import { NotFoundError, ConflictError } from '../errors/AppError';
import { ErrorCodes } from '../errors/errorCodes';
import mongoose from 'mongoose';

export interface WaiterRequestListFilter {
  status?: WaiterRequestStatus;
  type?: WaiterRequestType;
  page?: number;
  limit?: number;
}

export class WaiterRequestRepository {
  async create(data: {
    customerId: string;
    tableId?: string;
    diningSessionId?: string;
    type: WaiterRequestType;
    message?: string;
  }) {
    return WaiterRequestModel.create(data);
  }

  async findById(id: string) {
    if (!mongoose.isValidObjectId(id)) {
      throw new NotFoundError('Waiter request not found', ErrorCodes.WAITER_REQUEST_NOT_FOUND);
    }
    const r = await WaiterRequestModel.findById(id)
      .populate('customerId', 'name')
      .populate('tableId', 'tableNumber')
      .populate('diningSessionId', 'tableId status')
      .populate('handledBy', 'name');
    if (!r) throw new NotFoundError('Waiter request not found', ErrorCodes.WAITER_REQUEST_NOT_FOUND);
    return r;
  }

  async findByIdRaw(id: string) {
    if (!mongoose.isValidObjectId(id)) {
      throw new NotFoundError('Waiter request not found', ErrorCodes.WAITER_REQUEST_NOT_FOUND);
    }
    const r = await WaiterRequestModel.findById(id);
    if (!r) throw new NotFoundError('Waiter request not found', ErrorCodes.WAITER_REQUEST_NOT_FOUND);
    return r;
  }

  async findMany(filter: WaiterRequestListFilter) {
    const { status, type, page = 1, limit = 50 } = filter;
    const q: Record<string, unknown> = {};
    if (status) q.status = status;
    if (type) q.type = type;

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      WaiterRequestModel.find(q)
        .populate('customerId', 'name')
        .populate('tableId', 'tableNumber')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      WaiterRequestModel.countDocuments(q),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findByCustomer(customerId: string) {
    return WaiterRequestModel.find({ customerId }).sort({ createdAt: -1 });
  }

  async updateStatus(id: string, status: WaiterRequestStatus, handledBy: string) {
    const req = await this.findByIdRaw(id);
    if (req.status === 'completed' || req.status === 'cancelled') {
      throw new ConflictError(
        `Waiter request is already ${req.status}`,
        ErrorCodes.INVALID_STATUS_TRANSITION,
      );
    }
    req.status = status;
    req.handledBy = handledBy as unknown as typeof req.handledBy;
    req.handledAt = new Date();
    await req.save();
    return req;
  }
}

export const waiterRequestRepository = new WaiterRequestRepository();
