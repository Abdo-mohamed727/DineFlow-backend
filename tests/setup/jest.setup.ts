/**
 * Jest global setup - sets env variables BEFORE any test file is loaded
 * so that env validation in src/config/env.ts passes.
 */
process.env.NODE_ENV = 'test';
process.env.PORT = '4000';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/dineflow-test'; // unused; tests use memory server
process.env.JWT_SECRET = 'test-secret-key-min-32-chars-aaaa-bbbb';
process.env.JWT_EXPIRES_IN = '1h';
process.env.CORS_ORIGIN = '*';
process.env.TAX_RATE = '0.14';
process.env.MAX_UPLOAD_MB = '5';
// Leave Cloudinary vars unset - tests should still pass (placeholder URLs)
