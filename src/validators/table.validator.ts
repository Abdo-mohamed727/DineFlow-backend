import { z } from 'zod';
import { objectId } from './common';

export const createTableSchema = z.object({
  tableNumber: z.coerce.number().int().min(1),
  capacity: z.coerce.number().int().min(1).max(30),
  status: z.enum(['available', 'occupied', 'reserved']).optional(),
  location: z.string().trim().max(60).optional(),
}).strict();

export const updateTableSchema = z.object({
  capacity: z.coerce.number().int().min(1).max(30).optional(),
  status: z.enum(['available', 'occupied', 'reserved']).optional(),
  location: z.string().trim().max(60).optional(),
}).strict();

export const tableParamsSchema = z.object({
  id: objectId,
});

export type CreateTableInput = z.infer<typeof createTableSchema>;
export type UpdateTableInput = z.infer<typeof updateTableSchema>;
