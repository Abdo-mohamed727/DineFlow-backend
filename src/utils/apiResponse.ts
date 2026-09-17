import { Response } from 'express';

/**
 * Standard success envelope:
 *   { success: true, message: string, data: T }
 */
export function sendSuccess<T>(
  res: Response,
  message: string,
  data: T,
  statusCode = 200,
): Response {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
}

/**
 * Standard error envelope:
 *   { success: false, message: string, error: string, details?: unknown }
 */
export function sendError(
  res: Response,
  message: string,
  code: string,
  statusCode = 400,
  details?: unknown,
): Response {
  const body: { success: false; message: string; error: string; details?: unknown } = {
    success: false,
    message,
    error: code,
  };
  if (details !== undefined) body.details = details;
  return res.status(statusCode).json(body);
}
