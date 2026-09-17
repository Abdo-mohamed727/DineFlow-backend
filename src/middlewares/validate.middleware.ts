import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

/**
 * Generic Zod validation middleware factory.
 *
 * Usage:
 *   validate(schema, 'body')
 *   validate(schema, 'query')
 *   validate(schema, 'params')
 *
 * On success, replaces the request property with the parsed (and coerced) value.
 */
export function validate(schema: ZodSchema, source: 'body' | 'query' | 'params') {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return next(result.error);
    }
    // Replace with parsed + coerced values
    (req as unknown as Record<string, unknown>)[source] = result.data;
    next();
  };
}
