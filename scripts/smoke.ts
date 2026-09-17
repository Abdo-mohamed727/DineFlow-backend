/**
 * Smoke test: starts the Express app against an in-memory MongoDB and hits /api/health.
 * Verifies the server can boot and serve a real HTTP request.
 */
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/dineflow';
process.env.JWT_SECRET = 'test-secret-key-min-32-chars-aaaa-bbbb';
process.env.JWT_EXPIRES_IN = '1h';
process.env.CORS_ORIGIN = '*';
process.env.TAX_RATE = '0.14';
process.env.MAX_UPLOAD_MB = '5';

async function main() {
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());

  const { createApp } = await import('../src/app');
  const app = createApp();

  const server = app.listen(0);
  const port = (server.address() as { port: number }).port;

  // Use node's built-in fetch
  const healthRes = await fetch(`http://localhost:${port}/api/health`);
  const healthJson = await healthRes.json();
  // eslint-disable-next-line no-console
  console.log('GET /api/health →', healthRes.status, JSON.stringify(healthJson));

  // Try a 404 route
  const notFoundRes = await fetch(`http://localhost:${port}/api/this-does-not-exist`);
  const notFoundJson = await notFoundRes.json();
  // eslint-disable-next-line no-console
  console.log('GET /api/this-does-not-exist →', notFoundRes.status, JSON.stringify(notFoundJson));

  // Try register
  const regRes = await fetch(`http://localhost:${port}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Smoke', email: 'smoke@test.com', password: 'Password123!' }),
  });
  const regJson = (await regRes.json()) as { data?: { token?: string } };
  // eslint-disable-next-line no-console
  console.log('POST /api/auth/register →', regRes.status, 'token?', !!regJson?.data?.token);

  server.close();
  await mongoose.disconnect();
  await mongo.stop();
  // eslint-disable-next-line no-console
  console.log('\n✅ Smoke test passed');
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('❌ Smoke test failed:', err);
  process.exit(1);
});
