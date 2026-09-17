import { categoryRepository } from '../repositories/category.repository';
import { productRepository } from '../repositories/product.repository';
import { uploadBuffer, deleteAsset } from './cloudinary.service';
import { AppError, NotFoundError } from '../errors/AppError';
import { ErrorCodes } from '../errors/errorCodes';
import type { CreateCategoryInput, UpdateCategoryInput } from '../validators/category.validator';

export class CategoryService {
  async list() {
    return categoryRepository.findAll({ onlyActive: false });
  }

  async listActive() {
    return categoryRepository.findAll({ onlyActive: true });
  }

  async getById(id: string) {
    return categoryRepository.findById(id);
  }

  /**
   * Create category with optional image upload.
   * Multipart endpoints will pass file separately; JSON endpoints skip image.
   */
  async create(input: CreateCategoryInput, file?: Express.Multer.File) {
    let imageUrl = '';
    let publicId = '';
    if (file) {
      const up = await uploadBuffer(file.buffer, 'categories', file.originalname);
      imageUrl = up.url;
      publicId = up.publicId;
    }
    return categoryRepository.create({
      name: input.name,
      description: input.description,
      image: imageUrl,
      imagePublicId: publicId,
      isActive: input.isActive,
    });
  }

  async update(id: string, input: UpdateCategoryInput, file?: Express.Multer.File) {
    const cat = await categoryRepository.findById(id);
    const update: Record<string, unknown> = { ...input };
    if (file) {
      if (cat.imagePublicId) await deleteAsset(cat.imagePublicId);
      const up = await uploadBuffer(file.buffer, 'categories', file.originalname);
      update.image = up.url;
      update.imagePublicId = up.publicId;
    }
    return categoryRepository.updateById(id, update);
  }

  async remove(id: string) {
    // Prevent deletion if products reference this category
    const { total } = await productRepository.findMany({ categoryId: id, limit: 1 });
    if (total > 0) {
      throw new AppError(
        'Cannot delete category with existing products. Reassign or remove them first.',
        409,
        ErrorCodes.VALIDATION_ERROR,
      );
    }
    const cat = await categoryRepository.findById(id);
    if (cat.imagePublicId) await deleteAsset(cat.imagePublicId);
    return categoryRepository.deleteById(id);
  }
}

export const categoryService = new CategoryService();
