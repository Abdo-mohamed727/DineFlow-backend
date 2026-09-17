import { tableRepository } from '../repositories/table.repository';
import { TableStatus } from '../types';
import type { CreateTableInput, UpdateTableInput } from '../validators/table.validator';
import { ConflictError } from '../errors/AppError';
import { ErrorCodes } from '../errors/errorCodes';

export class TableService {
  async list(status?: TableStatus) {
    return tableRepository.findAll({ status });
  }

  async getById(id: string) {
    return tableRepository.findById(id);
  }

  async create(input: CreateTableInput) {
    const existing = await tableRepository.findByNumber(input.tableNumber);
    if (existing) {
      throw new ConflictError(
        `Table number ${input.tableNumber} already exists`,
        ErrorCodes.VALIDATION_ERROR,
      );
    }
    return tableRepository.create(input);
  }

  async update(id: string, input: UpdateTableInput) {
    return tableRepository.updateById(id, input);
  }

  async remove(id: string) {
    const TableModel = (await import('../models/table.model')).TableModel;
    const res = await TableModel.findByIdAndDelete(id);
    if (!res) {
      throw new ConflictError('Table not found', ErrorCodes.TABLE_NOT_FOUND);
    }
    return res;
  }
}

export const tableService = new TableService();
