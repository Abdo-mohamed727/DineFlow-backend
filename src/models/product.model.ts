import { Schema, model, Document, Types } from 'mongoose';
import { cleanToJSON } from '../utils/mongoose';

export interface IProduct extends Document {
  name: string;
  description?: string;
  price: number;
  image?: string;
  imagePublicId?: string;
  categoryId: Types.ObjectId;
  isAvailable: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const productSchema = new Schema<IProduct>(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 500 },
    price: { type: Number, required: true, min: 0 },
    image: { type: String, default: '' },
    imagePublicId: { type: String, default: '' },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true, index: true },
    isAvailable: { type: Boolean, default: true },
  },
  { timestamps: true },
);

productSchema.index({ name: 'text' });
productSchema.index({ isAvailable: 1 });

productSchema.set('toJSON', {
  transform: (_doc, ret) => cleanToJSON(ret as unknown),
});

export const ProductModel = model<IProduct>('Product', productSchema);
