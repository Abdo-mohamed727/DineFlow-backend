import dotenv from 'dotenv';
import z from 'zod';

dotenv.config();

/**
 * Centralized environment configuration.
 * Validates process.env at startup so we fail fast if something is missing.
 */
const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  JWT_SECRET: z.string().min(8, 'JWT_SECRET must be at least 8 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  CORS_ORIGIN: z.string().default('*'),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  TAX_RATE: z.coerce.number().min(0).max(1).default(0.14),
  MAX_UPLOAD_MB: z.coerce.number().default(5),

  /**
   * Firebase Admin SDK configuration for FCM push notifications.
   *
   * Provide the ENTIRE service-account JSON as a single string in env var
   * `FIREBASE_SERVICE_ACCOUNT` (preferred — works in .env files without
   * escaping issues). The backend parses it at startup.
   *
   * If left unset, FCM push delivery is silently disabled — notifications
   * are still persisted to MongoDB and visible in GET /api/notifications,
   * but no push is sent to devices. This matches the Cloudinary pattern
   * (dev-friendly fallback, prod requires credentials).
   *
   * Never commit the actual service-account JSON to the repo. Always inject
   * it via .env (which is gitignored) or a secrets manager in production.
   */
  FIREBASE_SERVICE_ACCOUNT: z.string().optional(),
  /**
   * Optional explicit Firebase project id override. Usually inferred from the
   * service-account JSON, but can be set separately if needed.
   */
  FIREBASE_PROJECT_ID: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('❌ Invalid environment configuration:');
  // eslint-disable-next-line no-console
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
