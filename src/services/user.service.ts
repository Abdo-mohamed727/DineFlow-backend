import { userRepository } from '../repositories/user.repository';
import { NotFoundError } from '../errors/AppError';
import { ErrorCodes } from '../errors/errorCodes';
import type { UpdateUserInput } from '../validators/user.validator';
import { uploadBuffer, deleteAsset } from './cloudinary.service';
import { AppError } from '../errors/AppError';

export class UserService {
  async getMe(userId: string) {
    const user = await userRepository.findById(userId);
    if (!user) throw new NotFoundError('User not found', ErrorCodes.USER_NOT_FOUND);
    return user;
  }

  async updateMe(userId: string, input: UpdateUserInput) {
    return userRepository.updateById(userId, input);
  }

  async updateProfileImage(userId: string, file: Express.Multer.File) {
    if (!file) {
      throw new AppError('No file uploaded', 400, ErrorCodes.INVALID_FILE);
    }
    const user = await userRepository.findById(userId);
    if (!user) throw new NotFoundError('User not found', ErrorCodes.USER_NOT_FOUND);

    // Delete the previous image from Cloudinary if it had a real public_id
    if (user.profileImagePublicId) {
      await deleteAsset(user.profileImagePublicId);
    }

    const { url, publicId } = await uploadBuffer(file.buffer, 'profiles', file.originalname);
    return userRepository.updateProfileImage(userId, url, publicId);
  }
}

export const userService = new UserService();
