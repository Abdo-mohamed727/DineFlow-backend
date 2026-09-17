import { z } from 'zod';
import { email, password } from './common';

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email,
  password,
  phone: z.string().trim().min(6).max(20).optional(),
}).strict();

export const loginSchema = z.object({
  email,
  password: z.string().min(1),
}).strict();

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
