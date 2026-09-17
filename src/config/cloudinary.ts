import { v2 as cloudinary } from 'cloudinary';
import { env } from './env';

/**
 * Cloudinary configuration. Cloudinary is optional in development - if credentials
 * are missing, the upload service returns a local placeholder URL so the API can
 * still be exercised. In production, all three credentials MUST be set.
 */
export const cloudinaryConfigured = !!(
  env.CLOUDINARY_CLOUD_NAME &&
  env.CLOUDINARY_API_KEY &&
  env.CLOUDINARY_API_SECRET
);

if (cloudinaryConfigured) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

export { cloudinary };
