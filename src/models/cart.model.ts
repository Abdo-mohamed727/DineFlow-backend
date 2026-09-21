import { Schema, model, Document, Types } from 'mongoose';
import { cleanToJSON } from '../utils/mongoose';

/**
 * Cart item — embedded subdocument.
 *
 * Stores only the productId and quantity. The current product price, name,
 * image, and availability are ALWAYS read live from MongoDB at checkout time
 * (and on GET /cart for display). We do NOT snapshot price into the cart,
 * because cart is a temporary shopping state — the user may browse for
 * minutes or hours before placing an order, and the catalog price can change
 * in the meantime. The authoritative price is captured into the Order when
 * the order is placed (Order has its own snapshot of unitPrice/subtotal).
 */
export interface ICartItem {
  productId: Types.ObjectId;
  quantity: number;
}

export interface ICart extends Document {
  customerId: Types.ObjectId;
  items: ICartItem[];
  createdAt: Date;
  updatedAt: Date;
}

const cartItemSchema = new Schema<ICartItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, required: true, min: 1, integer: true },
  },
  { _id: false },
);

const cartSchema = new Schema<ICart>(
  {
    // One cart per customer. Unique index enforces this at the DB level.
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    items: { type: [cartItemSchema], default: [] },
  },
  { timestamps: true },
);

// Compound index for fast "does this product exist in this cart" lookups
// (not strictly necessary for a small cart, but cheap to maintain).
cartSchema.index({ 'items.productId': 1 });

cartSchema.set('toJSON', {
  transform: (_doc, ret) => cleanToJSON(ret as unknown),
});

export const CartModel = model<ICart>('Cart', cartSchema);
