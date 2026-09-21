import { z } from 'zod';
import { email, password, roleEnum } from './common';

/**
 * Public customer self-registration schema.
 *
 * The `role` field is ACCEPTED here (so Flutter clients that send
 * `"role": "customer"` are not rejected by Zod strict mode), but it is
 * NEVER trusted. AuthService.register always forces the created user's
 * role to `customer` regardless of what the client sends. This means a
 * public user cannot escalate to `waiter` or `kitchen` by tampering with
 * the request — the field is accepted for compatibility only.
 *
 * The schema stays `.strict()` so any OTHER unexpected key is still
 * rejected with VALIDATION_ERROR (defensive default).
 */
export const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email,
  password,
  phone: z.string().trim().min(6).max(20).optional(),
  role: roleEnum.optional(),
}).strict();

export const loginSchema = z.object({
  email,
  password: z.string().min(1),
}).strict();

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
