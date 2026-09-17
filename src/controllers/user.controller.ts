import { Request, Response, NextFunction } from 'express';
import { userService } from '../services/user.service';
import { sendSuccess } from '../utils/apiResponse';
import type { UpdateUserInput } from '../validators/user.validator';

export class UserController {
  async getMe(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await userService.getMe(req.user!.id);
      return sendSuccess(res, 'User retrieved successfully', { user });
    } catch (err) {
      return next(err);
    }
  }

  async updateMe(req: Request, res: Response, next: NextFunction) {
    try {
      const input = req.body as UpdateUserInput;
      const user = await userService.updateMe(req.user!.id, input);
      return sendSuccess(res, 'User updated successfully', { user });
    } catch (err) {
      return next(err);
    }
  }

  async updateProfileImage(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await userService.updateProfileImage(req.user!.id, req.file!);
      return sendSuccess(res, 'Profile image updated successfully', { user });
    } catch (err) {
      return next(err);
    }
  }
}

export const userController = new UserController();
