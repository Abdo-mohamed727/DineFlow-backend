import { Request, Response, NextFunction } from 'express';
import { billService } from '../services/bill.service';
import { sendSuccess } from '../utils/apiResponse';

export class BillController {
  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const bill = await billService.getById(req.params.id);
      return sendSuccess(res, 'Bill retrieved successfully', { bill });
    } catch (err) {
      return next(err);
    }
  }

  async getForDiningSession(req: Request, res: Response, next: NextFunction) {
    try {
      const bill = await billService.getOrCreateForSession(req.params.id);
      return sendSuccess(res, 'Bill generated successfully', { bill });
    } catch (err) {
      return next(err);
    }
  }

  async markPaid(req: Request, res: Response, next: NextFunction) {
    try {
      const bill = await billService.markPaid(req.params.id, req.user!.id);
      return sendSuccess(res, 'Bill marked as paid', { bill });
    } catch (err) {
      return next(err);
    }
  }
}

export const billController = new BillController();
