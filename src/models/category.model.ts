import { Schema, model, Document, Types } from 'mongoose';
import { cleanToJSON } from '../utils/mongoose';

export interface ICategory extends Document {
  name: string;
  description?: string;
  image?: string;
  imagePublicId?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const categorySchema = new Schema<ICategory>(
  {
    name: { type: String, required: true, trim: true, unique: true, minlength: 2, maxlength: 60 },
    description: { type: String, trim: true, maxlength: 300 },
    image: { type: String, default: '' },
    imagePublicId: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

categorySchema.set('toJSON', {
  transform: (_doc, ret) => cleanToJSON(ret as unknown),
});

export const CategoryModel = model<ICategory>('Category', categorySchema);
