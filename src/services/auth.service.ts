import { userRepository } from '../repositories/user.repository';
import { hashPassword, comparePassword } from '../utils/password';
import { signToken } from '../utils/jwt';
import { UnauthorizedError, ForbiddenError } from '../errors/AppError';
import { ErrorCodes } from '../errors/errorCodes';
import type { RegisterInput, LoginInput } from '../validators/auth.validator';
import { ROLES, Role } from '../types';

export class AuthService {
  /**
   * Customer self-registration. Per spec §3, registration is customer-only.
   * Waiter/kitchen roles cannot be self-assigned - they are seeded via the
   * secure seed script (or directly in the database).
   */
  async register(input: RegisterInput) {
    // Force the role to customer - we never trust the client for roles
    const user = await userRepository.create({
      name: input.name,
      email: input.email,
      passwordHash: await hashPassword(input.password),
      phone: input.phone,
      role: ROLES.CUSTOMER,
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
