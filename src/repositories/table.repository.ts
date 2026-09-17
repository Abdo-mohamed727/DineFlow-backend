import { TableModel } from '../models/table.model';
import { TableStatus } from '../types';
import { NotFoundError } from '../errors/AppError';
import { ErrorCodes } from '../errors/errorCodes';
import mongoose from 'mongoose';

export class TableRepository {
  async findAll({ status }: { status?: TableStatus } = {}) {
    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    return TableModel.find(filter).sort({ tableNumber: 1 });
  }

  async findById(id: string) {
    if (!mongoose.isValidObjectId(id)) {
      throw new NotFoundError('Table not found', ErrorCodes.TABLE_NOT_FOUND);
    }
    const t = await TableModel.findById(id);
    if (!t) throw new NotFoundError('Table not found', ErrorCodes.TABLE_NOT_FOUND);
    return t;
  }

  async findByNumber(tableNumber: number) {
    return TableModel.findOne({ tableNumber });
  }

  async create(data: { tableNumber: number; capacity: number; status?: TableStatus; location?: string }) {
    return TableModel.create(data);
  }

  async updateById(id: string, update: Record<string, unknown>) {
    const t = await TableModel.findByIdAndUpdate(id, update, { new: true });
    if (!t) throw new NotFoundError('Table not found', ErrorCodes.TABLE_NOT_FOUND);
    return t;
  }

  async setStatus(id: string, status: TableStatus) {
    return this.updateById(id, { status });
  }
}

export const tableRepository = new TableRepository();
