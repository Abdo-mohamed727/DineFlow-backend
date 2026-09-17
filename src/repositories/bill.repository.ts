import { BillModel } from '../models/bill.model';
import { OrderModel } from '../models/order.model';
import { DiningSessionModel } from '../models/diningSession.model';
import { NotFoundError, ConflictError } from '../errors/AppError';
import { ErrorCodes } from '../errors/errorCodes';
import { env } from '../config/env';
import { round2 } from '../utils/pricing';
import mongoose from 'mongoose';

export class BillRepository {
  async nextBillNumber(): Promise<string> {
    const count = await BillModel.countDocuments();
    return `BILL-${String(count + 1).padStart(6, '0')}`;
  }

  async findById(id: string) {
    if (!mongoose.isValidObjectId(id)) {
      throw new NotFoundError('Bill not found', ErrorCodes.BILL_NOT_FOUND);
    }
    const b = await BillModel.findById(id)
      .populate('diningSessionId', 'tableId status startedAt endedAt')
      .populate('paidBy', 'name email');
    if (!b) throw new NotFoundError('Bill not found', ErrorCodes.BILL_NOT_FOUND);
    return b;
  }

  async findByDiningSession(diningSessionId: string) {
    return BillModel.findOne({ diningSessionId });
  }

  /**
   * Build a bill for a dining session, generating it on demand from the
   * underlying orders if it does not yet exist. This ensures the bill is
   * always derived from the source of truth (orders).
   */
  async getOrCreateForSession(diningSessionId: string) {
    const session = await DiningSessionModel.findById(diningSessionId);
    if (!session) {
      throw new NotFoundError('Dining session not found', ErrorCodes.DINING_SESSION_NOT_FOUND);
    }

    const existing = await BillModel.findOne({ diningSessionId });
    if (existing) {
      await this.recalculate(existing._id.toString());
      return BillModel.findById(existing._id)
        .populate('diningSessionId', 'tableId status startedAt endedAt')
        .populate('paidBy', 'name email');
    }

    // Build bill from underlying orders (exclude cancelled)
    const orders = await OrderModel.find({ diningSessionId, status: { $ne: 'cancelled' } });
    if (orders.length === 0) {
      throw new ConflictError(
        'No active orders found for this dining session',
        ErrorCodes.VALIDATION_ERROR,
      );
    }

    const subtotal = round2(orders.reduce((s, o) => s + o.subtotal, 0));
    const tax = round2(orders.reduce((s, o) => s + o.tax, 0));
    const total = round2(orders.reduce((s, o) => s + o.total, 0));

    const bill = await BillModel.create({
      billNumber: await this.nextBillNumber(),
      diningSessionId,
      tableId: session.tableId,
      orders: orders.map((o) => ({
        orderId: o._id,
        orderNumber: o.orderNumber,
        total: o.total,
      })),
      subtotal,
      tax,
      total,
      status: 'open',
    });

    return bill;
  }

  /** Recalculate totals from underlying orders (in case prices changed). */
  async recalculate(id: string) {
    const bill = await BillModel.findById(id);
    if (!bill) throw new NotFoundError('Bill not found', ErrorCodes.BILL_NOT_FOUND);
    const orders = await OrderModel.find({
      _id: { $in: bill.orders.map((o) => o.orderId) },
      status: { $ne: 'cancelled' },
    });
    bill.subtotal = round2(orders.reduce((s, o) => s + o.subtotal, 0));
    bill.tax = round2(orders.reduce((s, o) => s + o.tax, 0));
    bill.total = round2(orders.reduce((s, o) => s + o.total, 0));
    bill.orders = orders.map((o) => ({ orderId: o._id, orderNumber: o.orderNumber, total: o.total }));
    await bill.save();
    return bill;
  }

  async markPaid(id: string, paidBy: string) {
    const bill = await BillModel.findById(id);
    if (!bill) throw new NotFoundError('Bill not found', ErrorCodes.BILL_NOT_FOUND);
    if (bill.status === 'paid') {
      throw new ConflictError('Bill already paid', ErrorCodes.VALIDATION_ERROR);
    }
    bill.status = 'paid';
    bill.paidBy = paidBy as unknown as typeof bill.paidBy;
    await bill.save();
    return bill;
  }

  /** Use env tax rate for ad-hoc calculations if needed. */
  getTaxRate() {
    return env.TAX_RATE;
  }
}

export const billRepository = new BillRepository();
