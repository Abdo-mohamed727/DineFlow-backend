import { Request, Response, NextFunction } from 'express';
import { waiterRequestService } from '../services/waiterRequest.service';
import { sendSuccess } from '../utils/apiResponse';
import type {
  CreateWaiterRequestInput,
  UpdateWaiterRequestStatusInput,
} from '../validators/waiterRequest.validator';
import { WaiterRequestStatus, WaiterRequestType } from '../types';

export class WaiterRequestController {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const input = req.body as CreateWaiterRequestInput;
      const request = await waiterRequestService.create(input, req.user!.id);
      return sendSuccess(res, 'Waiter request created successfully', { request }, 201);
    } catch (err) {
      return next(err);
    }
  }

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      if (req.user!.role === 'customer') {
        const items = await waiterRequestService.findByCustomer(req.user!.id);
        return sendSuccess(res, 'Waiter requests retrieved successfully', { items, total: items.length });
      }
      const status = req.query.status as WaiterRequestStatus | undefined;
      const type = req.query.type as WaiterRequestType | undefined;
      const page = Number(req.query.page ?? 1);
      const limit = Number(req.query.limit ?? 50);
      const result = await waiterRequestService.findMany({ status, type, page, limit });
      return sendSuccess(res, 'Waiter requests retrieved successfully', result);
    } catch (err) {
      return next(err);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const request = await waiterRequestService.getById(req.params.id);
      return sendSuccess(res, 'Waiter request retrieved successfully', { request });
    } catch (err) {
      return next(err);
    }
  }

  async updateStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const input = req.body as UpdateWaiterRequestStatusInput;
      const request = await waiterRequestService.updateStatus(req.params.id, input, req.user!.id);
      return sendSuccess(res, 'Waiter request updated successfully', { request });
    } catch (err) {
      return next(err);
    }
  }
}

export const waiterRequestController = new WaiterRequestController();
