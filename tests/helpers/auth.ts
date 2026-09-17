import { signToken } from '../../src/utils/jwt';

/** Helper: produce a valid Bearer header for a given test user. */
export function authHeader(userId: string, role: 'customer' | 'waiter' | 'kitchen') {
  const token = signToken(userId, role);
  return { Authorization: `Bearer ${token}` };
}
