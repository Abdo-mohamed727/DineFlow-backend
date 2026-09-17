import { CategoryModel } from '../models/category.model';
import { NotFoundError } from '../errors/AppError';
import { ErrorCodes } from '../errors/errorCodes';
import mongoose from 'mongoose';

export class CategoryRepository {
  async findAll({ onlyActive = false }: { onlyActive?: boolean } = {}) {
    const filter: Record<string, unknown> = {};
    if (onlyActive) filter.isActive = true;
    return CategoryModel.find(filter).sort({ name: 1 });
  }

  async findById(id: string) {
    if (!mongoose.isValidObjectId(id)) {
      throw new NotFoundError('Category not found', ErrorCodes.CATEGORY_NOT_FOUND);
    }
    const cat = await CategoryModel.findById(id);
    if (!cat) throw new NotFoundError('Category not found', ErrorCodes.CATEGORY_NOT_FOUND);
    return cat;
  }

  async create(data: { name: string; description?: string; image?: string; imagePublicId?: string; isActive?: boolean }) {
    return CategoryModel.create(data);
  }

  async updateById(id: string, update: Record<string, unknown>) {
    const cat = await CategoryModel.findByIdAndUpdate(id, update, { new: true });
    if (!cat) throw new NotFoundError('Category not found', ErrorCodes.CATEGORY_NOT_FOUND);
    return cat;
  }

  async deleteById(id: string) {
    const res = await CategoryModel.findByIdAndDelete(id);
    if (!res) throw new NotFoundError('Category not found', ErrorCodes.CATEGORY_NOT_FOUND);
    return res;
  }
}

export const categoryRepository = new CategoryRepository();
