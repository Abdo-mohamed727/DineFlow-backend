import { z } from 'zod';
import { objectId } from './common';

export const billParamsSchema = z.object({
  id: objectId,
});

export const diningSessionBillParamsSchema = z.object({
  id: objectId,
});
