import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import mongoose from 'mongoose';
import multer from 'multer';
import { AppError } from '../errors/AppError';
import { ErrorCodes } from '../errors/errorCodes';
import { sendError } from '../utils/apiResponse';
import { env } from '../config/env';

/**
 * Centralized error handler. Converts any thrown error into the standard
 * JSON envelope. Stack traces are only shown in non-production for debugging.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  // Zod validation errors → 400 with detailed field errors
  if (err instanceof ZodError) {
    return sendError(
      res,
      'Validation failed',
      ErrorCodes.VALIDATION_ERROR,
      400,
      err.flatten(),
    );
  }

  // Our application errors → use their status code
  if (err instanceof AppError) {
    return sendError(res, err.message, err.code, err.statusCode, err.details);
  }

  // Mongoose ObjectId cast errors
  if (err instanceof mongoose.Error.CastError) {
    if (err.kind === 'ObjectId') {
      return sendError(
        res,
        `Invalid ObjectId for field "${err.path}"`,
        ErrorCodes.INVALID_OBJECT_ID,
        400,
      );
    }
    return sendError(res, `Invalid value for field "${err.path}"`, ErrorCodes.VALIDATION_ERROR, 400);
  }

  // Mongoose validation
  if (err instanceof mongoose.Error.ValidationError) {
    return sendError(res, err.message, ErrorCodes.VALIDATION_ERROR, 400, err.errors);
  }

  // Duplicate key (11000)
  if (err instanceof mongoose.mongo.MongoServerError && err.code === 11000) {
    const dup = Object.entries(err.keyValue || {}).map(([k, v]) => `${k}=${v}`).join(', ');
    const message = dup ? `Duplicate value: ${dup}` : 'Duplicate value';
    if ((err.keyValue as Record<string, unknown> | undefined)?.email) {
      return sendError(res, 'Email already in use', ErrorCodes.DUPLICATE_EMAIL, 409);
    }
    return sendError(res, message, ErrorCodes.VALIDATION_ERROR, 409);
  }

  // Multer errors (file size, etc.)
  if (err instanceof multer.MulterError) {
    const code = err.code === 'LIMIT_FILE_SIZE' ? ErrorCodes.INVALID_FILE : ErrorCodes.VALIDATION_ERROR;
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? `File too large. Max ${env.MAX_UPLOAD_MB}MB`
        : err.message;
    return sendError(res, message, code, 400);
  }

  // Default → 500
  // eslint-disable-next-line no-console
  console.error('💥 Unexpected error:', err);
  const internalMessage = env.NODE_ENV === 'production'
    ? 'Internal server error'
    : err instanceof Error
      ? err.message
      : 'Unknown error';
  return sendError(
    res,
    internalMessage,
    ErrorCodes.INTERNAL_ERROR,
    500,
    env.NODE_ENV === 'production' ? undefined : (err as Error)?.stack,
  );
}

/** 404 handler - no route matched. */
export function notFoundHandler(req: Request, res: Response) {
  return sendError(
    res,
    `Route ${req.method} ${req.originalUrl} not found`,
    ErrorCodes.NOT_FOUND,
    404,
  );
}
