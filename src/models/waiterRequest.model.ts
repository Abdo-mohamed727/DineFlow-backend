import { Schema, model, Document, Types } from 'mongoose';
import { WaiterRequestStatus, WaiterRequestType } from '../types';
import { cleanToJSON } from '../utils/mongoose';

export interface IWaiterRequest extends Document {
  customerId: Types.ObjectId;
  tableId?: Types.ObjectId;
  diningSessionId?: Types.ObjectId;
  type: WaiterRequestType;
  status: WaiterRequestStatus;
  message?: string;
  handledBy?: Types.ObjectId;
  handledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const waiterRequestSchema = new Schema<IWaiterRequest>(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tableId: { type: Schema.Types.ObjectId, ref: 'Table' },
    diningSessionId: { type: Schema.Types.ObjectId, ref: 'DiningSession' },
    type: {
      type: String,
      enum: ['CALL_WAITER', 'REQUEST_BILL', 'REQUEST_HELP'],
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'completed', 'cancelled'],
      default: 'pending',
      index: true,
    },
    message: { type: String, trim: true, maxlength: 300 },
    handledBy: { type: Schema.Types.ObjectId, ref: 'User' },
    handledAt: { type: Date },
  },
  { timestamps: true },
);

waiterRequestSchema.index({ status: 1, createdAt: -1 });

waiterRequestSchema.set('toJSON', {
  transform: (_doc, ret) => cleanToJSON(ret as unknown),
});

export const WaiterRequestModel = model<IWaiterRequest>('WaiterRequest', waiterRequestSchema);
