import { ProductModel } from '../models/product.model';
import { NotFoundError } from '../errors/AppError';
import { ErrorCodes } from '../errors/errorCodes';
import mongoose from 'mongoose';

export class ProductRepository {
  async findMany(opts: {
    categoryId?: string;
    search?: string;
    isAvailable?: boolean;
    page?: number;
    limit?: number;
  } = {}) {
    const { categoryId, search, isAvailable, page = 1, limit = 50 } = opts;
    const filter: Record<string, unknown> = {};
    if (categoryId) {
      if (!mongoose.isValidObjectId(categoryId)) {
        throw new NotFoundError('Category not found', ErrorCodes.CATEGORY_NOT_FOUND);
      }
      filter.categoryId = categoryId;
    }
    if (typeof isAvailable === 'boolean') filter.isAvailable = isAvailable;
    if (search) filter.name = { $regex: search, $options: 'i' };

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      ProductModel.find(filter)
        .populate('categoryId', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      ProductModel.countDocuments(filter),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(id: string) {
    if (!mongoose.isValidObjectId(id)) {
      throw new NotFoundError('Product not found', ErrorCodes.PRODUCT_NOT_FOUND);
    }
    const p = await ProductModel.findById(id).populate('categoryId', 'name');
    if (!p) throw new NotFoundError('Product not found', ErrorCodes.PRODUCT_NOT_FOUND);
    return p;
  }

  async findByIds(ids: string[]) {
    return ProductModel.find({ _id: { $in: ids } });
  }

  async create(data: {
    name: string;
    description?: string;
    price: number;
    categoryId: string;
    isAvailable?: boolean;
    image?: string;
    imagePublicId?: string;
  }) {
    return ProductModel.create(data);
  }

  async updateById(id: string, update: Record<string, unknown>) {
    const p = await ProductModel.findByIdAndUpdate(id, update, { new: true });
    if (!p) throw new NotFoundError('Product not found', ErrorCodes.PRODUCT_NOT_FOUND);
    return p;
  }

  async deleteById(id: string) {
    const res = await ProductModel.findByIdAndDelete(id);
    if (!res) throw new NotFoundError('Product not found', ErrorCodes.PRODUCT_NOT_FOUND);
    return res;
  }
}

export const productRepository = new ProductRepository();
