import { Schema, model, Document } from 'mongoose';
import { Role } from '../types';
import { cleanToJSON } from '../utils/mongoose';

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash: string;
  phone?: string;
  role: Role;
  profileImage?: string;
  profileImagePublicId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email format'],
    },
    passwordHash: { type: String, required: true, select: false },
    phone: { type: String, trim: true },
    role: {
      type: String,
      enum: ['customer', 'waiter', 'kitchen'],
      required: true,
      default: 'customer',
    },
    profileImage: { type: String, default: '' },
    profileImagePublicId: { type: String, default: '' },
  },
  { timestamps: true },
);

userSchema.set('toJSON', {
  transform: (_doc, ret) => cleanToJSON(ret as unknown, ['passwordHash']),
});

userSchema.set('toObject', {
  transform: (_doc, ret) => cleanToJSON(ret as unknown, ['passwordHash']),
});

export const UserModel = model<IUser>('User', userSchema);
