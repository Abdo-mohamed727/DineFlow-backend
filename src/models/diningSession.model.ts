import { Schema, model, Document, Types } from 'mongoose';
import { DiningSessionStatus, Role } from '../types';
import { cleanToJSON } from '../utils/mongoose';

export interface IDiningSession extends Document {
  tableId: Types.ObjectId;
  startedBy?: Types.ObjectId;
  status: DiningSessionStatus;
  startedAt: Date;
  endedAt?: Date;
  guestCount?: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A DiningSession represents a meal taking place at a table.
 *
 * Design decision (per spec §5): The session is conceptually independent of
 * any one customer. Multiple customers (e.g. a family of 4) can place orders
 * under the same session. `startedBy` is just the customer/waiter who opened
 * it for traceability - it does NOT imply ownership.
 *
 * All orders linked to a session will be aggregated when generating the bill.
 */
const diningSessionSchema = new Schema<IDiningSession>(
  {
    tableId: { type: Schema.Types.ObjectId, ref: 'Table', required: true, index: true },
    startedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    status: {
      type: String,
      enum: ['active', 'closed'],
      default: 'active',
      index: true,
    },
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date },
    guestCount: { type: Number, min: 1, max: 50 },
    notes: { type: String, trim: true, maxlength: 300 },
  },
  { timestamps: true },
);

diningSessionSchema.index({ status: 1, tableId: 1 });

diningSessionSchema.set('toJSON', {
  transform: (_doc, ret) => cleanToJSON(ret as unknown),
});

export const DiningSessionModel = model<IDiningSession>('DiningSession', diningSessionSchema);
