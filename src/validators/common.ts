import { z } from 'zod';

// Reusable primitives
export const objectId = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'Invalid ObjectId');

export const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password too long');

export const email = z
  .string()
  .trim()
  .toLowerCase()
  .email('Invalid email');

export const phone = z.string().trim().min(6).max(20).optional();

export const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const roleEnum = z.enum(['customer', 'waiter', 'kitchen']);
