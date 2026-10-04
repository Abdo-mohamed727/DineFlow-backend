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

  /**
   * Find all users with a specific role. Used by the notification service
   * to fan-out notifications to all staff of a given role (e.g. notify ALL
   * kitchen users when a new order is placed).
   *
   * Selects only the fields needed for notification dispatch — `_id` and
   * `deviceTokens` — to keep the query cheap. Password hash is never
   * selected (it has `select: false` in the schema anyway).
   *
   * Returns an empty array if no users with the given role exist.
   */
  async findByRole(role: Role) {
    return UserModel.find({ role }).select('deviceTokens');
  }

  async updateById(id: string, update: Record<string, unknown>) {
    const user = await UserModel.findByIdAndUpdate(id, update, { new: true });
    if (!user) throw new NotFoundError('User not found', ErrorCodes.USER_NOT_FOUND);
    return user;
  }

  async updateProfileImage(id: string, imageUrl: string, publicId: string) {
    return this.updateById(id, { profileImage: imageUrl, profileImagePublicId: publicId });
  }

  /**
   * Register (or replace) an FCM device token for a user.
   *
   * Idempotent: if the token is already registered, this is a no-op.
   * The token is appended to the `deviceTokens` array — a user may have
   * multiple tokens (phone, tablet, web).
   */
  async addDeviceToken(userId: string, token: string): Promise<string[]> {
    const user = await UserModel.findById(userId);
    if (!user) throw new NotFoundError('User not found', ErrorCodes.USER_NOT_FOUND);
    const tokens = user.deviceTokens ?? [];
    if (!tokens.includes(token)) {
      tokens.push(token);
      user.deviceTokens = tokens;
      await user.save();
    }
    return user.deviceTokens ?? [];
  }

  /**
   * Remove an FCM device token from a user. Used on logout / app uninstall.
   * No-op if the token was never registered.
   */
  async removeDeviceToken(userId: string, token: string): Promise<string[]> {
    const user = await UserModel.findById(userId);
    if (!user) throw new NotFoundError('User not found', ErrorCodes.USER_NOT_FOUND);
    user.deviceTokens = (user.deviceTokens ?? []).filter((t) => t !== token);
    await user.save();
    return user.deviceTokens ?? [];
  }

  /**
   * Remove a specific list of invalid FCM tokens reported by Firebase.
   * Used by the FCM service to clean up dead tokens after a send attempt.
   */
  async removeInvalidTokens(userId: string, tokensToRemove: string[]): Promise<void> {
    if (!tokensToRemove || tokensToRemove.length === 0) return;
    await UserModel.updateOne(
      { _id: userId },
      { $pull: { deviceTokens: { $in: tokensToRemove } } },
    );
  }

  /**
   * Get the list of FCM device tokens for a user. Returns an empty array if
   * the user has no tokens registered (which is the common case before the
   * Flutter app calls POST /api/notifications/device-token).
   */
  async getDeviceTokens(userId: string): Promise<string[]> {
    const user = await UserModel.findById(userId).select('deviceTokens');
    if (!user) throw new NotFoundError('User not found', ErrorCodes.USER_NOT_FOUND);
    return user.deviceTokens ?? [];
  }
}

export const userRepository = new UserRepository();
