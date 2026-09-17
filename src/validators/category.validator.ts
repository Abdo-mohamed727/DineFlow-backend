import { z } from 'zod';
import { objectId } from './common';

export const createCategorySchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(300).optional(),
  isActive: z.boolean().optional(),
}).strict();

export const updateCategorySchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  description: z.string().trim().max(300).optional(),
  isActive: z.boolean().optional(),
}).strict();

export const categoryParamsSchema = z.object({
  id: objectId,
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
