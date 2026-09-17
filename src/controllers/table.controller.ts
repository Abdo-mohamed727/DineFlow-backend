import { Request, Response, NextFunction } from 'express';
import { tableService } from '../services/table.service';
import { sendSuccess } from '../utils/apiResponse';
import { TableStatus } from '../types';
import type { CreateTableInput, UpdateTableInput } from '../validators/table.validator';

export class TableController {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const status = (req.query.status as TableStatus | undefined);
      const tables = await tableService.list(status);
      return sendSuccess(res, 'Tables retrieved successfully', { tables });
    } catch (err) {
      return next(err);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const table = await tableService.getById(req.params.id);
      return sendSuccess(res, 'Table retrieved successfully', { table });
    } catch (err) {
      return next(err);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const input = req.body as CreateTableInput;
      const table = await tableService.create(input);
      return sendSuccess(res, 'Table created successfully', { table }, 201);
    } catch (err) {
      return next(err);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const input = req.body as UpdateTableInput;
      const table = await tableService.update(req.params.id, input);
      return sendSuccess(res, 'Table updated successfully', { table });
    } catch (err) {
      return next(err);
    }
  }

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      await tableService.remove(req.params.id);
      return sendSuccess(res, 'Table deleted successfully', { id: req.params.id });
    } catch (err) {
      return next(err);
    }
  }
}

export const tableController = new TableController();
