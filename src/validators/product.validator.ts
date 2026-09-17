import { z } from 'zod';
import { objectId } from './common';

/** Boolean-or-string-coercion: works for JSON body (boolean) AND multipart form-data (string). */
const flexibleBoolean = z
  .union([z.boolean(), z.enum(['true', 'false']).transform((v) => v === 'true')])
  .optional();

export const createProductSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).optional(),
  price: z.coerce.number().min(0, 'Price must be >= 0'),
  categoryId: objectId,
  isAvailable: flexibleBoolean,
}).strict();

export const updateProductSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  description: z.string().trim().max(500).optional(),
  price: z.coerce.number().min(0).optional(),
  categoryId: objectId.optional(),
  isAvailable: flexibleBoolean,
}).strict();

export const productParamsSchema = z.object({
  id: objectId,
});

export const listProductsQuerySchema = z.object({
  categoryId: objectId.optional(),
  search: z.string().trim().min(1).max(100).optional(),
  isAvailable: z.enum(['true', 'false']).optional().transform((v) => v === undefined ? undefined : v === 'true'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
