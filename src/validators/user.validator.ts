import { z } from 'zod';

export const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  phone: z.string().trim().min(6).max(20).optional(),
}).strict().refine((v) => Object.keys(v).length > 0, {
  message: 'At least one field must be provided',
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
