import { Request, Response, NextFunction } from 'express';
import { cartService } from '../services/cart.service';
import { sendSuccess } from '../utils/apiResponse';
import type { AddCartItemInput, UpdateCartItemInput } from '../validators/cart.validator';

/**
 * Cart controller.
 *
 * Each handler reads `req.user.id` from the JWT-based auth middleware —
 * NEVER from the request body. This prevents one customer from manipulating
 * another customer's cart.
 *
 * All handlers are wrapped in try/catch and forward errors to the centralized
 * error middleware (which converts AppError → JSON envelope).
 */
export class CartController {
  /** GET /api/cart */
  async getCart(req: Request, res: Response, next: NextFunction) {
    try {
      const cart = await cartService.getCartWithTotals(req.user!.id);
      return sendSuccess(res, 'Cart retrieved successfully', { cart });
    } catch (err) {
      return next(err);
    }
  }

  /** POST /api/cart/items */
  async addItem(req: Request, res: Response, next: NextFunction) {
    try {
      const input = req.body as AddCartItemInput;
      await cartService.addItem(req.user!.id, input.productId, input.quantity);
      // Return the refreshed cart (with live product info + totals) so the
      // Flutter UI can update atomically without a follow-up GET.
      const cart = await cartService.getCartWithTotals(req.user!.id);
      return sendSuccess(res, 'Item added to cart', { cart }, 201);
    } catch (err) {
      return next(err);
    }
  }

  /** PATCH /api/cart/items/:productId */
  async updateItem(req: Request, res: Response, next: NextFunction) {
    try {
      const input = req.body as UpdateCartItemInput;
      const productId = req.params.productId;
      await cartService.updateItemQuantity(req.user!.id, productId, input.quantity);
      const cart = await cartService.getCartWithTotals(req.user!.id);
      return sendSuccess(res, 'Cart item updated successfully', { cart });
    } catch (err) {
      return next(err);
    }
  }

  /** DELETE /api/cart/items/:productId */
  async removeItem(req: Request, res: Response, next: NextFunction) {
    try {
      const productId = req.params.productId;
      await cartService.removeItem(req.user!.id, productId);
      const cart = await cartService.getCartWithTotals(req.user!.id);
      return sendSuccess(res, 'Item removed from cart', { cart });
    } catch (err) {
      return next(err);
    }
  }

  /** DELETE /api/cart */
  async clearCart(req: Request, res: Response, next: NextFunction) {
    try {
      await cartService.clearCart(req.user!.id);
      const cart = await cartService.getCartWithTotals(req.user!.id);
      return sendSuccess(res, 'Cart cleared successfully', { cart });
    } catch (err) {
      return next(err);
    }
  }
}

export const cartController = new CartController();
