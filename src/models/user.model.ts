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
  /**
   * FCM device tokens registered by this user. A single user may have
   * multiple tokens (e.g. signed in on phone + tablet). Push notifications
   * are sent to ALL of them — FCM handles deduplication.
   *
   * Tokens are added via POST /api/notifications/device-token and removed
   * via DELETE /api/notifications/device-token (typically called on logout).
   */
  deviceTokens?: string[];
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
    deviceTokens: { type: [String], default: [] },
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
