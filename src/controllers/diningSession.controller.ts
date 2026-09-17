import { Request, Response, NextFunction } from 'express';
import { diningSessionService } from '../services/diningSession.service';
import { sendSuccess } from '../utils/apiResponse';
import type { CreateDiningSessionInput } from '../validators/diningSession.validator';

export class DiningSessionController {
  async listActive(_req: Request, res: Response, next: NextFunction) {
    try {
      const sessions = await diningSessionService.listActive();
      return sendSuccess(res, 'Active dining sessions retrieved successfully', { sessions });
    } catch (err) {
      return next(err);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const session = await diningSessionService.getById(req.params.id);
      return sendSuccess(res, 'Dining session retrieved successfully', { session });
    } catch (err) {
      return next(err);
    }
  }

  async start(req: Request, res: Response, next: NextFunction) {
    try {
      const input = req.body as CreateDiningSessionInput;
      const session = await diningSessionService.start(input, req.user?.id);
      return sendSuccess(res, 'Dining session started successfully', { session }, 201);
    } catch (err) {
      return next(err);
    }
  }

  async close(req: Request, res: Response, next: NextFunction) {
    try {
      const session = await diningSessionService.close(req.params.id, req.user?.id);
      return sendSuccess(res, 'Dining session closed successfully', { session });
    } catch (err) {
      return next(err);
    }
  }
}

export const diningSessionController = new DiningSessionController();
