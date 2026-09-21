import { CartModel } from '../models/cart.model';
import { ICart } from '../models/cart.model';
import { ProductModel } from '../models/product.model';
import { NotFoundError } from '../errors/AppError';
import { ErrorCodes } from '../errors/errorCodes';
import mongoose from 'mongoose';

/**
 * Cart repository.
 *
 * Wraps CartModel access. As with the other repositories in the project,
 * services depend on this — not on the Mongoose model directly. This is the
 * boundary where the DB shape meets the rest of the codebase.
 *
 * The cart stores only `{ productId, quantity }`. Product fields (name,
 * price, image, isAvailable) are populated live from MongoDB on reads so
 * the customer always sees current catalog data, never stale snapshots.
 */
export class CartRepository {
  /**
   * Find a cart by customer id. Returns `null` if it does not exist.
   * Use `getOrCreate` from the service layer when you need to upsert.
   */
  async findByCustomerId(customerId: string): Promise<ICart | null> {
    return CartModel.findOne({ customerId });
  }

  /**
   * Find a cart by customer id, populate product info (name, price, image,
   * isAvailable) for each item. Returns `null` if the cart does not exist.
   *
   * Used by GET /api/cart so the customer sees live catalog data.
   */
  async findByCustomerIdPopulated(customerId: string) {
    return CartModel.findOne({ customerId }).populate({
      path: 'items.productId',
      select: 'name price image isAvailable',
      model: ProductModel,
    });
  }

  /**
   * Create an empty cart for a customer. Used by the service when the
   * customer has no cart yet (lazy creation on first add-to-cart).
   */
  async create(customerId: string): Promise<ICart> {
    return CartModel.create({ customerId, items: [] });
  }

  /**
   * Get or create a cart for the customer.
   */
  async getOrCreate(customerId: string): Promise<ICart> {
    let cart = await this.findByCustomerId(customerId);
    if (!cart) {
      cart = await this.create(customerId);
    }
    return cart;
  }

  /**
   * Add a product to the cart, or increment its quantity if already present.
   * Returns the updated cart.
   */
  async addItem(customerId: string, productId: string, quantity: number): Promise<ICart> {
    const cart = await this.getOrCreate(customerId);
    const existing = cart.items.find(
      (i) => i.productId.toString() === productId,
    );
    if (existing) {
      existing.quantity += quantity;
    } else {
      cart.items.push({ productId: new mongoose.Types.ObjectId(productId), quantity });
    }
    return cart.save();
  }

  /**
   * Replace the quantity of an existing item in the cart.
   * Throws NotFoundError(CART_ITEM_NOT_FOUND) if the cart doesn't exist OR
   * if the product is not in the cart — both cases are logically "this item
   * is not in your cart" from the customer's perspective.
   */
  async updateItemQuantity(customerId: string, productId: string, quantity: number): Promise<ICart> {
    const cart = await this.findByCustomerId(customerId);
    if (!cart) {
      throw new NotFoundError(
        'Item not found in cart',
        ErrorCodes.CART_ITEM_NOT_FOUND,
      );
    }
    const item = cart.items.find((i) => i.productId.toString() === productId);
    if (!item) {
      throw new NotFoundError(
        'Item not found in cart',
        ErrorCodes.CART_ITEM_NOT_FOUND,
      );
    }
    item.quantity = quantity;
    return cart.save();
  }

  /**
   * Remove a product from the cart.
   * Throws NotFoundError(CART_ITEM_NOT_FOUND) if the cart doesn't exist OR
   * if the product is not in the cart.
   */
  async removeItem(customerId: string, productId: string): Promise<ICart> {
    const cart = await this.findByCustomerId(customerId);
    if (!cart) {
      throw new NotFoundError(
        'Item not found in cart',
        ErrorCodes.CART_ITEM_NOT_FOUND,
      );
    }
    const before = cart.items.length;
    cart.items = cart.items.filter((i) => i.productId.toString() !== productId);
    if (cart.items.length === before) {
      throw new NotFoundError(
        'Item not found in cart',
        ErrorCodes.CART_ITEM_NOT_FOUND,
      );
    }
    return cart.save();
  }

  /**
   * Remove all items from the customer's cart (keeps the cart document itself
   * so subsequent add-to-cart operations don't need to recreate it).
   * No-op if the cart does not exist (clearing an empty cart is idempotent).
   */
  async clear(customerId: string): Promise<void> {
    await CartModel.updateOne(
      { customerId },
      { $set: { items: [] } },
      { upsert: true },
    );
  }

  /**
   * Delete the cart document entirely (used for tests / cleanup).
   */
  async deleteByCustomerId(customerId: string): Promise<void> {
    await CartModel.deleteOne({ customerId });
  }
}

export const cartRepository = new CartRepository();
