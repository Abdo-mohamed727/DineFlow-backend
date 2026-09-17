import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';
import { UnauthorizedError, ForbiddenError } from '../errors/AppError';
import { ErrorCodes } from '../errors/errorCodes';
import { Role } from '../types';
import { JwtPayload } from 'jsonwebtoken';

declare module 'express-serve-static-core' {
  interface Request {
    user?: { id: string; role: Role };
  }
}

/**
 * AuthN middleware. Extracts and verifies the Bearer JWT, attaching
 * req.user = { id, role }. Throws 401 if missing or invalid.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Missing or malformed Authorization header', ErrorCodes.UNAUTHORIZED));
  }
  const token = header.slice('Bearer '.length).trim();
  try {
    const decoded = verifyToken(token) as JwtPayload;
    req.user = { id: decoded.userId, role: decoded.role };
    next();
  } catch (err) {
    const message = (err as Error).name === 'TokenExpiredError'
      ? 'Token expired'
      : 'Invalid token';
    return next(new UnauthorizedError(message, ErrorCodes.TOKEN_EXPIRED));
  }
}

/**
 * AuthZ middleware factory. Usage:
 *   authorize('customer')
 *   authorize('waiter', 'kitchen')
 */
export function authorize(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError());
    }
    if (!roles.includes(req.user.role)) {
      return next(new ForbiddenError(`This action requires one of: ${roles.join(', ')}`));
    }
    return next();
  };
}
