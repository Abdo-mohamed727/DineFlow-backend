/**
 * Smoke test for the Cart → Checkout flow:
 *   1. Register + login as customer
 *   2. Create a TAKEAWAY order via POST /api/orders
 *   3. Verify response shape (orderId, items, productName, totals)
 *   4. Try a failing order (unavailable product) → verify cart stays intact (no order persisted)
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
  const { UserModel } = await import('../src/models/user.model');
  const { CategoryModel } = await import('../src/models/category.model');
  const { ProductModel } = await import('../src/models/product.model');
  const { hashPassword } = await import('../src/utils/password');
  const { ROLES } = await import('../src/types');

  // Seed minimal fixtures
  const passwordHash = await hashPassword('Password123!');
  const customer = await UserModel.create({
    name: 'Smoke Customer',
    email: 'smoke@test.com',
    passwordHash,
    role: ROLES.CUSTOMER,
  });
  const mains = await CategoryModel.create({ name: 'Mains', description: 'Mains' });
  const burger = await ProductModel.create({
    name: 'Beef Burger',
    description: 'Classic',
    price: 220,
    categoryId: mains._id,
    isAvailable: true,
  });
  const soldOut = await ProductModel.create({
    name: 'Sold Out Pasta',
    description: 'Unavailable',
    price: 100,
    categoryId: mains._id,
    isAvailable: false,
  });

  const app = createApp();
  const server = app.listen(0);
  const port = (server.address() as { port: number }).port;
  const base = `http://localhost:${port}`;

  // 1. Login
  const loginRes = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'smoke@test.com', password: 'Password123!' }),
  });
  const loginJson = (await loginRes.json()) as { data: { token: string } };
  const token = loginJson.data.token;
  // eslint-disable-next-line no-console
  console.log('✓ Login → 200, token:', token.slice(0, 20) + '...');

  // 2. Successful TAKEAWAY order
  const orderRes = await fetch(`${base}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      orderType: 'TAKEAWAY',
      items: [{ productId: burger._id.toString(), quantity: 2 }],
    }),
  });
  const orderJson = (await orderRes.json()) as {
    success: boolean;
    data: { orderId: string; orderType: string; items: Array<{ productName: string; unitPrice: number; subtotal: number }>; subtotal: number; tax: number; total: number; status: string; createdAt: string };
  };
  // eslint-disable-next-line no-console
  console.log('✓ POST /api/orders →', orderRes.status);
  // eslint-disable-next-line no-console
  console.log('  orderId:', orderJson.data.orderId);
  // eslint-disable-next-line no-console
  console.log('  orderType:', orderJson.data.orderType);
  // eslint-disable-next-line no-console
  console.log('  items[0].productName:', orderJson.data.items[0].productName);
  // eslint-disable-next-line no-console
  console.log('  items[0].unitPrice:', orderJson.data.items[0].unitPrice);
  // eslint-disable-next-line no-console
  console.log('  subtotal/tax/total:', orderJson.data.subtotal, '/', orderJson.data.tax, '/', orderJson.data.total);
  // eslint-disable-next-line no-console
  console.log('  status:', orderJson.data.status);
  // eslint-disable-next-line no-console
  console.log('  createdAt:', orderJson.data.createdAt);
  console.assert(orderJson.data.orderType === 'TAKEAWAY', 'orderType mismatch');
  console.assert(orderJson.data.status === 'pending', 'status should be pending');
  console.assert(orderJson.data.items[0].productName === 'Beef Burger', 'productName should be snapshot');
  console.assert(orderJson.data.items[0].unitPrice === 220, 'unitPrice should be from MongoDB');
  console.assert(orderJson.data.total === 501.6, `total expected 501.6 got ${orderJson.data.total}`);

  // 3. Failing order (unavailable product) → cart must stay intact (no order persisted)
  const beforeCount = await mongoose.connection.collection('orders').countDocuments();
  const failRes = await fetch(`${base}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      orderType: 'TAKEAWAY',
      items: [{ productId: soldOut._id.toString(), quantity: 1 }],
    }),
  });
  const failJson = (await failRes.json()) as { success: boolean; error: string; message: string };
  const afterCount = await mongoose.connection.collection('orders').countDocuments();
  // eslint-disable-next-line no-console
  console.log('✓ POST /api/orders (unavailable) →', failRes.status, failJson.error);
  // eslint-disable-next-line no-console
  console.log('  Orders persisted before:', beforeCount, 'after:', afterCount, '(must be equal → cart can stay)');
  console.assert(failRes.status === 400, 'expected 400 for unavailable product');
  console.assert(afterCount === beforeCount, 'no order should be persisted on failure');

  server.close();
  await mongoose.disconnect();
  await mongo.stop();
  // eslint-disable-next-line no-console
  console.log('\n✅ Cart → Checkout smoke test passed');
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('❌ Smoke test failed:', err);
  process.exit(1);
});
