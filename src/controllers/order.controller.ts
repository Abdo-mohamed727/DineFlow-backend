import { Request, Response, NextFunction } from 'express';
import { orderService } from '../services/order.service';
import { sendSuccess } from '../utils/apiResponse';
import type { CreateOrderInput, ListOrdersQuery, UpdateOrderStatusInput } from '../validators/order.validator';

export class OrderController {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const input = req.body as CreateOrderInput;
      // Pass the authenticated user's role so the service can decide:
      //   - customer → read from cart if items not in body
      //   - waiter → items must be in body
      const order = await orderService.create(input, req.user!.id, req.user!.role);
      const orderJson = order.toJSON ? order.toJSON() : (order as unknown as Record<string, unknown>);

      // Return a convenience payload alongside the full `order` object so
      // Flutter can read the key fields without drilling into `order.*`.
      return sendSuccess(res, 'Order created successfully', {
        order,
        orderId: orderJson.id,
        orderType: orderJson.type,
        items: orderJson.items,
        subtotal: orderJson.subtotal,
        tax: orderJson.tax,
        total: orderJson.total,
        status: orderJson.status,
        createdAt: orderJson.createdAt,
      }, 201);
    } catch (err) {
      return next(err);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const order = await orderService.getById(req.params.id);
      return sendSuccess(res, 'Order retrieved successfully', { order });
    } catch (err) {
      return next(err);
    }
  }

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const query = req.query as unknown as ListOrdersQuery;
      // Customers only see their own orders
      if (req.user!.role === 'customer') {
        const result = await orderService.findMyOrders(req.user!.id, query);
        return sendSuccess(res, 'Orders retrieved successfully', result);
      }
      // Waiters / kitchen see all orders (optionally filtered)
      const result = await orderService.findMany(query);
      return sendSuccess(res, 'Orders retrieved successfully', result);
    } catch (err) {
      return next(err);
    }
  }

  async cancel(req: Request, res: Response, next: NextFunction) {
    try {
      const order = await orderService.cancelByCustomer(req.params.id, req.user!.id);
      return sendSuccess(res, 'Order cancelled successfully', { order });
    } catch (err) {
      return next(err);
    }
  }

  async updateStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const input = req.body as UpdateOrderStatusInput;
      const order = await orderService.updateStatus(req.params.id, input, req.user!.role);
      return sendSuccess(res, 'Order status updated successfully', { order });
    } catch (err) {
      return next(err);
    }
  }
}

export const orderController = new OrderController();
