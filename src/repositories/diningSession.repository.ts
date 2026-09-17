import { DiningSessionModel } from '../models/diningSession.model';
import { DiningSessionStatus } from '../types';
import { NotFoundError, ConflictError } from '../errors/AppError';
import { ErrorCodes } from '../errors/errorCodes';
import mongoose from 'mongoose';

export class DiningSessionRepository {
  async findById(id: string) {
    if (!mongoose.isValidObjectId(id)) {
      throw new NotFoundError('Dining session not found', ErrorCodes.DINING_SESSION_NOT_FOUND);
    }
    const s = await DiningSessionModel.findById(id)
      .populate('tableId', 'tableNumber capacity status')
      .populate('startedBy', 'name');
    if (!s) throw new NotFoundError('Dining session not found', ErrorCodes.DINING_SESSION_NOT_FOUND);
    return s;
  }

  async findByIdRaw(id: string) {
    if (!mongoose.isValidObjectId(id)) {
      throw new NotFoundError('Dining session not found', ErrorCodes.DINING_SESSION_NOT_FOUND);
    }
    const s = await DiningSessionModel.findById(id);
    if (!s) throw new NotFoundError('Dining session not found', ErrorCodes.DINING_SESSION_NOT_FOUND);
    return s;
  }

  async findActiveByTable(tableId: string) {
    return DiningSessionModel.findOne({ tableId, status: 'active' });
  }

  async create(data: { tableId: string; startedBy?: string; guestCount?: number; notes?: string }) {
    // Ensure no active session exists on the same table
    const existing = await this.findActiveByTable(data.tableId);
    if (existing) {
      throw new ConflictError(
        'Table already has an active dining session',
        ErrorCodes.TABLE_NOT_AVAILABLE,
      );
    }
    return DiningSessionModel.create(data);
  }

  async close(id: string, closedBy?: string) {
    const session = await this.findByIdRaw(id);
    if (session.status === 'closed') {
      throw new ConflictError('Session is already closed', ErrorCodes.SESSION_CLOSED);
    }
    session.status = 'closed';
    session.endedAt = new Date();
    await session.save();
    return session;
  }

  async findActive() {
    return DiningSessionModel.find({ status: 'active' })
      .populate('tableId', 'tableNumber capacity status')
      .sort({ startedAt: -1 });
  }
}

export const diningSessionRepository = new DiningSessionRepository();
