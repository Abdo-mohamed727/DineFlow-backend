import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app';
import { startMemoryDB, stopMemoryDB, clearCollections } from './setup/memoryDb';
import { seedFixtures } from './helpers/fixtures';
import { authHeader } from './helpers/auth';

describe('Products', () => {
  let app: ReturnType<typeof createApp>;
  let fixtures: Awaited<ReturnType<typeof seedFixtures>>;

  beforeAll(async () => {
    const uri = await startMemoryDB();
    await mongoose.connect(uri);
    app = createApp();
  });

  afterAll(async () => {
    await stopMemoryDB();
  });

  beforeEach(async () => {
    await clearCollections();
    fixtures = await seedFixtures();
  });

  describe('GET /api/products', () => {
    it('lists all available products for an authenticated user', async () => {
      const res = await request(app)
        .get('/api/products')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'));
      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBe(4); // includes unavailable too since we don't filter by default
    });

    it('filters by categoryId', async () => {
      const res = await request(app)
        .get(`/api/products?categoryId=${fixtures.mains._id}`)
        .set(authHeader(fixtures.customer._id.toString(), 'customer'));
      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBe(3); // burger, pizza, unavailable
      expect(res.body.data.items.every((p: { categoryId?: unknown }) => {
        const cid = p.categoryId;
        if (!cid) return false;
        if (typeof cid === 'string') return cid === fixtures.mains._id.toString();
        if (typeof cid === 'object' && cid !== null) {
          const obj = cid as { _id?: string; id?: string };
          return obj._id === fixtures.mains._id.toString() || obj.id === fixtures.mains._id.toString();
        }
        return false;
      })).toBe(true);
    });

    it('searches by name', async () => {
      const res = await request(app)
        .get('/api/products?search=burger')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'));
      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBe(1);
      expect(res.body.data.items[0].name).toBe('Beef Burger');
    });

    it('filters available only', async () => {
      const res = await request(app)
        .get('/api/products?isAvailable=true')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'));
      expect(res.status).toBe(200);
      expect(res.body.data.items.every((p: { isAvailable: boolean }) => p.isAvailable === true)).toBe(true);
    });

    it('rejects unauthenticated', async () => {
      const res = await request(app).get('/api/products');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/products/:id', () => {
    it('returns a single product', async () => {
      const res = await request(app)
        .get(`/api/products/${fixtures.burger._id}`)
        .set(authHeader(fixtures.customer._id.toString(), 'customer'));
      expect(res.status).toBe(200);
      expect(res.body.data.product.name).toBe('Beef Burger');
    });

    it('returns 404 for a non-existent product', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await request(app)
        .get(`/api/products/${fakeId}`)
        .set(authHeader(fixtures.customer._id.toString(), 'customer'));
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('PRODUCT_NOT_FOUND');
    });

    it('returns 400 for an invalid ObjectId', async () => {
      const res = await request(app)
        .get('/api/products/not-an-id')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'));
      expect(res.status).toBe(400);
      // Zod catches the invalid ObjectId first → VALIDATION_ERROR (regex mismatch)
      expect(['INVALID_OBJECT_ID', 'VALIDATION_ERROR']).toContain(res.body.error);
    });
  });

  describe('POST /api/products (authorization)', () => {
    it('rejects customers from creating products (403)', async () => {
      const res = await request(app)
        .post('/api/products')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'))
        .field('name', 'Pizza')
        .field('price', 100)
        .field('categoryId', fixtures.mains._id.toString());
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('FORBIDDEN');
    });

    it('allows kitchen to create products (multipart)', async () => {
      const res = await request(app)
        .post('/api/products')
        .set(authHeader(fixtures.kitchen._id.toString(), 'kitchen'))
        .field('name', 'New Pizza')
        .field('description', 'Fresh')
        .field('price', 200)
        .field('categoryId', fixtures.mains._id.toString())
        .field('isAvailable', 'true');
      expect(res.status).toBe(201);
      expect(res.body.data.product.name).toBe('New Pizza');
      expect(res.body.data.product.price).toBe(200);
    });
  });
});
