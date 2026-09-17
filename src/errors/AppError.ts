import { ErrorCodes } from './errorCodes';

/**
 * AppError is the canonical thrown error inside services & controllers.
 * The centralized error middleware converts it into the standard JSON envelope.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(
    message: string,
    statusCode = 400,
    code: string = ErrorCodes.VALIDATION_ERROR,
    details?: unknown,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    // Maintain proper prototype chain when targeting ES5+
    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, code: string = ErrorCodes.NOT_FOUND) {
    super(message, 404, code);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', code: string = ErrorCodes.UNAUTHORIZED) {
    super(message, 401, code);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', code: string = ErrorCodes.FORBIDDEN) {
    super(message, 403, code);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code: string = ErrorCodes.VALIDATION_ERROR) {
    super(message, 409, code);
  }
}
