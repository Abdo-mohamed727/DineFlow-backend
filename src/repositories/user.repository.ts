import { UserModel } from '../models/user.model';
import { Role } from '../types';
import { NotFoundError, ConflictError } from '../errors/AppError';
import { ErrorCodes } from '../errors/errorCodes';

/**
 * User repository. Wraps Mongoose model access. Services depend on this,
 * not on the Mongoose model directly - this is the boundary where the DB
 * shape meets the rest of the codebase.
 */
export class UserRepository {
  async create(data: {
    name: string;
    email: string;
    passwordHash: string;
    phone?: string;
    role: Role;
  }) {
    try {
      return await UserModel.create(data);
    } catch (err) {
      const code = (err as { code?: number }).code;
      if (code === 11000) {
        throw new ConflictError('Email already in use', ErrorCodes.DUPLICATE_EMAIL);
      }
      throw err;
    }
  }

  async findByEmail(email: string) {
    return UserModel.findOne({ email }).select('+passwordHash');
  }

  async findById(id: string) {
    return UserModel.findById(id);
  }

  async updateById(id: string, update: Record<string, unknown>) {
    const user = await UserModel.findByIdAndUpdate(id, update, { new: true });
    if (!user) throw new NotFoundError('User not found', ErrorCodes.USER_NOT_FOUND);
    return user;
  }

  async updateProfileImage(id: string, imageUrl: string, publicId: string) {
    return this.updateById(id, { profileImage: imageUrl, profileImagePublicId: publicId });
  }
}

export const userRepository = new UserRepository();
