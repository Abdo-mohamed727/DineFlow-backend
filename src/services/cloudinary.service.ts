import { UploadApiResponse } from 'cloudinary';
import { cloudinary, cloudinaryConfigured } from '../config/cloudinary';
import { AppError } from '../errors/AppError';
import { ErrorCodes } from '../errors/errorCodes';

/**
 * Cloudinary upload service.
 *
 * If Cloudinary credentials are not configured (development mode), this
 * returns a placeholder data URL so image upload endpoints can still be
 * exercised end-to-end without a real Cloudinary account. In production,
 * configure credentials to get real hosted URLs.
 */

export interface UploadResult {
  url: string;
  publicId: string;
}

const PLACEHOLDER_PUBLIC_ID = 'dev-placeholder';

export async function uploadBuffer(
  buffer: Buffer,
  folder: string,
  originalName: string,
  resourceType: 'image' = 'image',
): Promise<UploadResult> {
  if (!cloudinaryConfigured) {
    // Dev fallback - return a small data URL so the flow works without creds
    const base64 = buffer.toString('base64').slice(0, 100);
    return {
      url: `data:image/jpeg;base64,${base64}`,
      publicId: PLACEHOLDER_PUBLIC_ID,
    };
  }

  return new Promise<UploadResult>((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: `dineflow/${folder}`,
        resource_type: resourceType,
        public_id: `${Date.now()}-${pathSafeBase(originalName)}`,
        overwrite: true,
      },
      (err, result: UploadApiResponse | undefined) => {
        if (err || !result) {
          return reject(new AppError(
            `Cloudinary upload failed: ${(err as Error)?.message ?? 'unknown error'}`,
            500,
            ErrorCodes.INTERNAL_ERROR,
          ));
        }
        resolve({ url: result.secure_url, publicId: result.public_id });
      },
    );
    uploadStream.end(buffer);
  });
}

export async function deleteAsset(publicId: string): Promise<void> {
  if (!publicId || publicId === PLACEHOLDER_PUBLIC_ID) return;
  if (!cloudinaryConfigured) return;
  return new Promise<void>((resolve) => {
    cloudinary.uploader.destroy(publicId, {}, (err, res) => {
      // Best-effort - log but don't fail the request if deletion fails
      if (err || !res || (typeof res === 'object' && 'result' in res && res.result !== 'ok' && res.result !== 'not found')) {
        // eslint-disable-next-line no-console
        console.warn(`Cloudinary delete warning for ${publicId}:`, err?.message ?? res);
      }
      resolve();
    });
  });
}

function pathSafeBase(name: string): string {
  const base = name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
  return base.slice(0, 40) || 'file';
}
