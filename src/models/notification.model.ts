import { Schema, model, Document, Types } from 'mongoose';
import { NotificationType } from '../types';
import { cleanToJSON } from '../utils/mongoose';

export interface INotification extends Document {
  userId: Types.ObjectId;
  title: string;
  message: string;
  type: NotificationType;
  isRead: boolean;
  data?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    message: { type: String, required: true, trim: true, maxlength: 500 },
    type: {
      type: String,
      enum: ['ORDER_UPDATE', 'WAITER_REQUEST', 'PAYMENT', 'SYSTEM'],
      default: 'SYSTEM',
    },
    isRead: { type: Boolean, default: false, index: true },
    data: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

notificationSchema.set('toJSON', {
  transform: (_doc, ret) => cleanToJSON(ret as unknown),
});

export const NotificationModel = model<INotification>('Notification', notificationSchema);
