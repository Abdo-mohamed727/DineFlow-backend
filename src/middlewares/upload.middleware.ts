import { RequestHandler } from 'express';
import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import { env } from '../config/env';
import { AppError } from '../errors/AppError';
import { ErrorCodes } from '../errors/errorCodes';

/**
 * Multer storage configuration. We use memoryStorage so the buffer is passed
 * directly to Cloudinary without writing to disk. Cloudinary then returns the
 * hosted URL which we persist in MongoDB.
 *
 * File validation:
 *  - Allowed MIME types: image/jpeg, image/png, image/webp
 *  - Max size: env.MAX_UPLOAD_MB (default 5MB)
 */
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.webp'];

function fileFilter(_req: Express.Request, file: Express.Multer.File, cb: FileFilterCallback) {
  const ext = path.extname(file.originalname).toLowerCase();
  const mimeOk = ALLOWED_MIME.includes(file.mimetype);
  const extOk = ALLOWED_EXT.includes(ext);
  // Trust neither alone: check both MIME and extension (per spec §image security)
  if (mimeOk && extOk) {
    return cb(null, true);
  }
  return cb(new AppError(
    `Unsupported file type ${file.mimetype} (${ext}). Allowed: jpg, jpeg, png, webp`,
    400,
    ErrorCodes.INVALID_FILE,
  ) as unknown as Error);
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter,
});

/** Single file upload middleware - field name configurable. */
export function uploadSingle(fieldName: string): RequestHandler {
  return upload.single(fieldName);
}
