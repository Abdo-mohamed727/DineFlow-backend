import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service';
import { sendSuccess } from '../utils/apiResponse';
import type { RegisterInput, LoginInput } from '../validators/auth.validator';

export class AuthController {
  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const input = req.body as RegisterInput;
      const { user, token } = await authService.register(input);
      return sendSuccess(res, 'Customer registered successfully', { user, token }, 201);
    } catch (err) {
      return next(err);
    }
  }

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const input = req.body as LoginInput;
      const { user, token } = await authService.login(input);
      return sendSuccess(res, 'Login successful', { user, token });
    } catch (err) {
      return next(err);
    }
  }

  async me(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await authService.getMe(req.user!.id);
      return sendSuccess(res, 'User retrieved successfully', { user });
    } catch (err) {
      return next(err);
    }
  }
}

export const authController = new AuthController();
