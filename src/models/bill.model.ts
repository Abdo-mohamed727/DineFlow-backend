import { Schema, model, Document, Types } from 'mongoose';
import { cleanToJSON } from '../utils/mongoose';

export interface IBillItem {
  orderId: Types.ObjectId;
  orderNumber: string;
  total: number;
}

export interface IBill extends Document {
  billNumber: string;
  diningSessionId: Types.ObjectId;
  tableId?: Types.ObjectId;
  orders: IBillItem[];
  subtotal: number;
  tax: number;
  total: number;
  paidBy?: Types.ObjectId;
  status: 'open' | 'paid';
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Bill represents the final aggregated amount for a dining session.
 *
 * Design decision (spec §16): The bill is calculated from the underlying
 * orders so totals are never duplicated and never trusted from the client.
 * We store an explicit bill document so that the bill has a stable identity
 * (billNumber) and can later be marked paid. If a dining session has no
 * bill document yet, the GET /bills/dining-session/:id endpoint will
 * generate it on demand from the underlying orders (read-only / idempotent).
 */
const billSchema = new Schema<IBill>(
  {
    billNumber: { type: String, required: true, unique: true, index: true },
    diningSessionId: { type: Schema.Types.ObjectId, ref: 'DiningSession', required: true, index: true },
    tableId: { type: Schema.Types.ObjectId, ref: 'Table' },
    orders: [
      {
        orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
        orderNumber: { type: String, required: true },
        total: { type: Number, required: true },
        _id: false,
      },
    ],
    subtotal: { type: Number, required: true, min: 0 },
    tax: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
    paidBy: { type: Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['open', 'paid'], default: 'open', index: true },
  },
  { timestamps: true },
);

billSchema.set('toJSON', {
  transform: (_doc, ret) => cleanToJSON(ret as unknown),
});

export const BillModel = model<IBill>('Bill', billSchema);
