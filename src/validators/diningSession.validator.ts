import { z } from 'zod';
import { objectId } from './common';

export const createDiningSessionSchema = z.object({
  tableId: objectId,
  guestCount: z.coerce.number().int().min(1).max(50).optional(),
  notes: z.string().trim().max(300).optional(),
}).strict();

export const diningSessionParamsSchema = z.object({
  id: objectId,
});

export type CreateDiningSessionInput = z.infer<typeof createDiningSessionSchema>;
