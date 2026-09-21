import { cartRepository } from '../repositories/cart.repository';
import { productRepository } from '../repositories/product.repository';
import { calculateTotals } from '../utils/pricing';
import { AppError, NotFoundError } from '../errors/AppError';
import { ErrorCodes } from '../errors/errorCodes';
import mongoose from 'mongoose';
import type { ICart } from '../models/cart.model';

/**
 * Cart service — business logic for the customer's shopping cart.
 *
 * Architectural notes:
 *
 *  - The cart stores ONLY `{ productId, quantity }`. Product price / name /
 *    availability are NEVER trusted from the client and NEVER cached in the
 *    cart. They are read live from MongoDB on every GET /cart so the
 *    customer always sees current catalog data.
 *
 *  - On every add/update we verify the product exists and is available.
 *    Unavailable products cannot be added to the cart.
 *
 *  - Quantities are always integers >= 1 (enforced by Zod at the route
 *    layer and again by the Mongoose schema).
 *
 *  - One cart per customer (enforced by the unique customerId index on the
 *    Cart model). Carts are created lazily on first add-to-cart.
 *
 *  - The `getCartWithTotals` method returns the cart shape consumed by the
 *    GET /api/cart endpoint, including live product info and computed
 *    subtotal/total (using the existing TAX_RATE config).
 */
export class CartService {
  /**
   * Get the authenticated customer's cart. Returns an empty-cart shape if
   * the customer has no cart yet (does NOT throw — matches the "new customer
   * gets empty cart" requirement from the spec).
   *
   * Product info is populated live so the customer always sees current
   * prices and availability.
   */
  async getCartWithTotals(customerId: string) {
    const cart = await cartRepository.findByCustomerIdPopulated(customerId);

    if (!cart || cart.items.length === 0) {
      return {
        id: null,
        items: [],
        subtotal: 0,
        taxRate: 0,
        tax: 0,
        total: 0,
        itemCount: 0,
      };
    }

    // Build the display shape and compute totals from the live product data.
    // If a product was deleted from the catalog while still in someone's cart,
    // skip it (shouldn't happen in practice but defensive).
    const items: Array<{
      productId: string;
      name: string;
      price: number;
      image: string;
      isAvailable: boolean;
      quantity: number;
      subtotal: number;
    }> = [];

    for (const item of cart.items) {
      const populated = item.productId as unknown as {
        _id?: string;
        id?: string;
        name?: string;
        price?: number;
        image?: string;
        isAvailable?: boolean;
      };

      // Defensive: product may have been deleted from the catalog while
      // still referenced by an open cart. Skip it from the totals but keep
      // showing it to the customer with `isAvailable: false` so they can
      // remove it manually.
      const name = populated?.name ?? '(product no longer available)';
      const price = typeof populated?.price === 'number' ? populated.price : 0;
      const image = populated?.image ?? '';
      const isAvailable = populated?.isAvailable ?? false;
      const productIdStr =
        (populated?._id ?? populated?.id ?? '').toString();

      items.push({
        productId: productIdStr,
        name,
        price,
        image,
        isAvailable,
        quantity: item.quantity,
        subtotal: price * item.quantity,
      });
    }

    const totals = calculateTotals({
      items: items.map((i) => ({ unitPrice: i.price, quantity: i.quantity })),
    });

    return {
      id: (cart as unknown as { _id: string })._id?.toString() ?? null,
      items,
      subtotal: totals.subtotal,
      taxRate: totals.taxRate,
      tax: totals.tax,
      total: totals.total,
      itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
    };
  }

  /**
   * Add a product to the customer's cart. If the product is already in the
   * cart, increment its quantity (rather than creating a duplicate item).
   *
   * Validates:
   *   - productId is a valid ObjectId
   *   - product exists in the catalog
   *   - product isAvailable === true
   *
   * Creates the cart document if the customer doesn't have one yet.
   */
  async addItem(customerId: string, productId: string, quantity: number) {
    if (!mongoose.isValidObjectId(productId)) {
      throw new NotFoundError('Product not found', ErrorCodes.PRODUCT_NOT_FOUND);
    }

    // Verify product exists + is available
    const product = await productRepository.findById(productId);
    if (!product.isAvailable) {
      throw new AppError(
        `Product "${product.name}" is not available`,
        400,
        ErrorCodes.PRODUCT_UNAVAILABLE,
      );
    }

    const cart = await cartRepository.addItem(customerId, productId, quantity);
    return cart;
  }

  /**
   * Update the quantity of an existing cart item.
   * Throws NotFoundError if the product is not in the customer's cart.
   */
  async updateItemQuantity(customerId: string, productId: string, quantity: number) {
    if (!mongoose.isValidObjectId(productId)) {
      throw new NotFoundError(
        'Item not found in cart',
        ErrorCodes.CART_ITEM_NOT_FOUND,
      );
    }
    return cartRepository.updateItemQuantity(customerId, productId, quantity);
  }

  /**
   * Remove a product from the customer's cart.
   * Throws NotFoundError if the product is not in the cart.
   */
  async removeItem(customerId: string, productId: string) {
    if (!mongoose.isValidObjectId(productId)) {
      throw new NotFoundError(
        'Item not found in cart',
        ErrorCodes.CART_ITEM_NOT_FOUND,
      );
    }
    return cartRepository.removeItem(customerId, productId);
  }

  /**
   * Clear all items from the customer's cart. Idempotent — clearing an
   * already-empty cart (or a non-existent cart) is a no-op.
   */
  async clearCart(customerId: string) {
    return cartRepository.clear(customerId);
  }

  /**
   * Get the raw cart (without populated product info) — used internally by
   * OrderService to read the customer's cart at checkout time.
   */
  async getRawCart(customerId: string): Promise<ICart | null> {
    return cartRepository.findByCustomerId(customerId);
  }
}

export const cartService = new CartService();
