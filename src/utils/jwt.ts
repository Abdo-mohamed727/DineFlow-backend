import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import type { JwtPayload, Role } from '../types';

/** Sign a minimal JWT containing only userId + role. */
export function signToken(userId: string, role: Role): string {
  return jwt.sign({ userId, role } satisfies JwtPayload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

/** Verify a JWT and return its decoded payload. */
export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
}
