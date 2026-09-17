import { productRepository } from '../repositories/product.repository';
import { categoryRepository } from '../repositories/category.repository';
import { uploadBuffer, deleteAsset } from './cloudinary.service';
import { AppError, NotFoundError } from '../errors/AppError';
import { ErrorCodes } from '../errors/errorCodes';
import type {
  CreateProductInput,
  UpdateProductInput,
  ListProductsQuery,
} from '../validators/product.validator';

export class ProductService {
  async list(query: ListProductsQuery) {
    return productRepository.findMany(query);
  }

  async getById(id: string) {
    return productRepository.findById(id);
  }

  async create(input: CreateProductInput, file?: Express.Multer.File) {
    // Validate category exists
    await categoryRepository.findById(input.categoryId);

    let imageUrl = '';
    let publicId = '';
    if (file) {
      const up = await uploadBuffer(file.buffer, 'products', file.originalname);
      imageUrl = up.url;
      publicId = up.publicId;
    }
    return productRepository.create({
      name: input.name,
      description: input.description,
      price: input.price,
      categoryId: input.categoryId,
      isAvailable: input.isAvailable,
      image: imageUrl,
      imagePublicId: publicId,
    });
  }

  async update(id: string, input: UpdateProductInput, file?: Express.Multer.File) {
    const product = await productRepository.findById(id);
    if (input.categoryId) {
      await categoryRepository.findById(input.categoryId);
    }
    const update: Record<string, unknown> = { ...input };
    if (file) {
      if (product.imagePublicId) await deleteAsset(product.imagePublicId);
      const up = await uploadBuffer(file.buffer, 'products', file.originalname);
      update.image = up.url;
      update.imagePublicId = up.publicId;
    }
    return productRepository.updateById(id, update);
  }

  async remove(id: string) {
    const p = await productRepository.findById(id);
    if (p.imagePublicId) await deleteAsset(p.imagePublicId);
    return productRepository.deleteById(id);
  }
}

export const productService = new ProductService();
