import { z } from 'zod';
import { objectId } from './common';

export const createWaiterRequestSchema = z.object({
  type: z.enum(['CALL_WAITER', 'REQUEST_BILL', 'REQUEST_HELP']),
  diningSessionId: objectId.optional(),
  tableId: objectId.optional(),
  message: z.string().trim().max(300).optional(),
}).strict();

export const waiterRequestParamsSchema = z.object({
  id: objectId,
});

export const updateWaiterRequestStatusSchema = z.object({
  status: z.enum(['accepted', 'completed', 'cancelled']),
}).strict();

export const listWaiterRequestsQuerySchema = z.object({
  status: z.enum(['pending', 'accepted', 'completed', 'cancelled']).optional(),
  type: z.enum(['CALL_WAITER', 'REQUEST_BILL', 'REQUEST_HELP']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type CreateWaiterRequestInput = z.infer<typeof createWaiterRequestSchema>;
export type UpdateWaiterRequestStatusInput = z.infer<typeof updateWaiterRequestStatusSchema>;
