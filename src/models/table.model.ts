import { Schema, model, Document } from 'mongoose';
import { TableStatus } from '../types';
import { cleanToJSON } from '../utils/mongoose';

export interface ITable extends Document {
  tableNumber: number;
  capacity: number;
  status: TableStatus;
  location?: string;
  createdAt: Date;
  updatedAt: Date;
}

const tableSchema = new Schema<ITable>(
  {
    tableNumber: { type: Number, required: true, unique: true, min: 1 },
    capacity: { type: Number, required: true, min: 1, max: 30 },
    status: {
      type: String,
      enum: ['available', 'occupied', 'reserved'],
      default: 'available',
      index: true,
    },
    location: { type: String, trim: true, maxlength: 60 },
  },
  { timestamps: true },
);

tableSchema.set('toJSON', {
  transform: (_doc, ret) => cleanToJSON(ret as unknown),
});

export const TableModel = model<ITable>('Table', tableSchema);
