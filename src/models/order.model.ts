import { Schema, model, Document, Types } from 'mongoose';
import { OrderStatus, OrderType } from '../types';
import { cleanToJSON } from '../utils/mongoose';

export interface IOrderItem {
  productId: Types.ObjectId;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface IOrder extends Document {
  orderNumber: string;
  customerId: Types.ObjectId;
  diningSessionId?: Types.ObjectId;
  tableId?: Types.ObjectId;
  type: OrderType;
  items: IOrderItem[];
  status: OrderStatus;
  subtotal: number;
  tax: number;
  total: number;
  notes?: string;
  cancelledBy?: Types.ObjectId;
  cancelledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Orders preserve a SNAPSHOT of each item's productName & price at order time.
 *
 * Why snapshot? Product prices change over time. An order placed yesterday
 * at 50 EGP must keep 50 EGP even if the catalog price is updated today to
 * 55 EGP. Same for product name (renames happen). This protects historical
 * reporting, receipts and the bill from drifting.
 */
const orderItemSchema = new Schema<IOrderItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    subtotal: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const orderSchema = new Schema<IOrder>(
  {
    orderNumber: { type: String, required: true, unique: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    diningSessionId: {
      type: Schema.Types.ObjectId,
      ref: 'DiningSession',
      index: true,
    },
    tableId: { type: Schema.Types.ObjectId, ref: 'Table' },
    type: { type: String, enum: ['DINE_IN', 'TAKEAWAY'], required: true },
    items: { type: [orderItemSchema], required: true, validate: (v: unknown) => Array.isArray(v) && v.length > 0 },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'preparing', 'ready', 'served', 'completed', 'cancelled'],
      default: 'pending',
      index: true,
    },
    subtotal: { type: Number, required: true, min: 0 },
    tax: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
    notes: { type: String, trim: true, maxlength: 500 },
    cancelledBy: { type: Schema.Types.ObjectId, ref: 'User' },
    cancelledAt: { type: Date },
  },
  { timestamps: true },
);

orderSchema.index({ customerId: 1, createdAt: -1 });
orderSchema.index({ diningSessionId: 1, createdAt: 1 });

orderSchema.set('toJSON', {
  transform: (_doc, ret) => cleanToJSON(ret as unknown),
});

export const OrderModel = model<IOrder>('Order', orderSchema);
