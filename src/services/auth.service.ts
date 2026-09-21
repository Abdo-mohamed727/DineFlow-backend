import { userRepository } from '../repositories/user.repository';
import { hashPassword, comparePassword } from '../utils/password';
import { signToken } from '../utils/jwt';
import { UnauthorizedError, ForbiddenError } from '../errors/AppError';
import { ErrorCodes } from '../errors/errorCodes';
import type { RegisterInput, LoginInput } from '../validators/auth.validator';
import { ROLES, Role } from '../types';
import { env } from '../config/env';

export class AuthService {
  /**
   * Public self-registration.
   *
   * Default behavior (production-safe): the user's role is ALWAYS forced to
   * `customer`, regardless of what the client sends in the request body. This
   * prevents public users from escalating privileges by sending
   * `"role": "waiter"` or `"role": "kitchen"`.
   *
   * Development convenience: when `NODE_ENV === 'development'`, the role
   * field IS trusted if the client provides one. This lets developers
   * create waiter/kitchen accounts directly via Postman without running
   * the seed script. It has NO effect in production — public users cannot
   * escalate roles there. Do NOT deploy with NODE_ENV=development.
   */
  async register(input: RegisterInput) {
    // Determine the role for the new user.
    // - In production: always customer (never trust the client).
    // - In development: trust the client's role if provided; otherwise customer.
    //   This is a dev-only convenience for creating staff accounts via Postman.
    let role: Role = ROLES.CUSTOMER;
    if (env.NODE_ENV === 'development' && input.role) {
      role = input.role;
    }

    const user = await userRepository.create({
      name: input.name,
      email: input.email,
      passwordHash: await hashPassword(input.password),
      phone: input.phone,
      role,
    });
    const token = signToken(user.id, user.role as Role);
    return { user, token };
  }

  async login(input: LoginInput) {
    const user = await userRepository.findByEmail(input.email);
    if (!user) {
      throw new UnauthorizedError('Invalid email or password', ErrorCodes.INVALID_CREDENTIALS);
    }
    const ok = await comparePassword(input.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedError('Invalid email or password', ErrorCodes.INVALID_CREDENTIALS);
    }
    const token = signToken(user.id, user.role as Role);
    return { user, token };
  }

  /**
   * Restricted user creation for elevated roles (waiter / kitchen). Used by
   * a future admin tool or the seed script - NOT exposed via a public route.
   */
  async createStaffUser(input: {
    name: string;
    email: string;
    password: string;
    phone?: string;
    role: 'waiter' | 'kitchen';
  }) {
    if (input.role !== 'waiter' && input.role !== 'kitchen') {
      throw new ForbiddenError('Only waiter or kitchen roles are allowed here');
    }
    const user = await userRepository.create({
      name: input.name,
      email: input.email,
      passwordHash: await hashPassword(input.password),
      phone: input.phone,
      role: input.role,
    });
    return user;
  }

  async getMe(userId: string) {
    return userRepository.findById(userId);
  }
}

export const authService = new AuthService();