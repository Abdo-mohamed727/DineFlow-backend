import { Request, Response, NextFunction } from 'express';
import { productService } from '../services/product.service';
import { sendSuccess } from '../utils/apiResponse';
import type { CreateProductInput, UpdateProductInput, ListProductsQuery } from '../validators/product.validator';

export class ProductController {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const query = req.query as unknown as ListProductsQuery;
      const result = await productService.list(query);
      return sendSuccess(res, 'Products retrieved successfully', result);
    } catch (err) {
      return next(err);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const product = await productService.getById(req.params.id);
      return sendSuccess(res, 'Product retrieved successfully', { product });
    } catch (err) {
      return next(err);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const input = req.body as CreateProductInput;
      const product = await productService.create(input, req.file);
      return sendSuccess(res, 'Product created successfully', { product }, 201);
    } catch (err) {
      return next(err);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const input = req.body as UpdateProductInput;
      const product = await productService.update(req.params.id, input, req.file);
      return sendSuccess(res, 'Product updated successfully', { product });
    } catch (err) {
      return next(err);
    }
  }

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      await productService.remove(req.params.id);
      return sendSuccess(res, 'Product deleted successfully', { id: req.params.id });
    } catch (err) {
      return next(err);
    }
  }
}

export const productController = new ProductController();
