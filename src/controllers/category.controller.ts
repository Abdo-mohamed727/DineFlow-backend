import { Request, Response, NextFunction } from 'express';
import { categoryService } from '../services/category.service';
import { sendSuccess } from '../utils/apiResponse';
import type { CreateCategoryInput, UpdateCategoryInput } from '../validators/category.validator';

export class CategoryController {
  async list(_req: Request, res: Response, next: NextFunction) {
    try {
      const categories = await categoryService.list();
      return sendSuccess(res, 'Categories retrieved successfully', { categories });
    } catch (err) {
      return next(err);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const category = await categoryService.getById(req.params.id);
      return sendSuccess(res, 'Category retrieved successfully', { category });
    } catch (err) {
      return next(err);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const input = req.body as CreateCategoryInput;
      const category = await categoryService.create(input, req.file);
      return sendSuccess(res, 'Category created successfully', { category }, 201);
    } catch (err) {
      return next(err);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const input = req.body as UpdateCategoryInput;
      const category = await categoryService.update(req.params.id, input, req.file);
      return sendSuccess(res, 'Category updated successfully', { category });
    } catch (err) {
      return next(err);
    }
  }

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      await categoryService.remove(req.params.id);
      return sendSuccess(res, 'Category deleted successfully', { id: req.params.id });
    } catch (err) {
      return next(err);
    }
  }
}

export const categoryController = new CategoryController();
