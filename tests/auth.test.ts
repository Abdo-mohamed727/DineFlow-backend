import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app';
import { startMemoryDB, stopMemoryDB, clearCollections } from './setup/memoryDb';
import { seedFixtures } from './helpers/fixtures';
import { authHeader } from './helpers/auth';

describe('Auth', () => {
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

  describe('POST /api/auth/register', () => {
    it('registers a new customer and returns a JWT', async () => {
      const res = await request(app).post('/api/auth/register').send({
        name: 'New Customer',
        email: 'new@test.com',
        password: 'Password123!',
        phone: '+201000000000',
      });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toMatch(/^[A-Za-z0-9-_.]+$/);
      expect(res.body.data.user.role).toBe('customer');
      // Password hash must NOT be returned
      expect(res.body.data.user.passwordHash).toBeUndefined();
    });

    it('rejects duplicate emails with 409', async () => {
      const res = await request(app).post('/api/auth/register').send({
        name: 'Dup Customer',
        email: 'customer@test.com',
        password: 'Password123!',
      });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('DUPLICATE_EMAIL');
    });

    it('rejects short passwords (validation)', async () => {
      const res = await request(app).post('/api/auth/register').send({
        name: 'Short',
        email: 'short@test.com',
        password: '123',
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });

    it('never allows self-registration as waiter or kitchen', async () => {
      // The schema accepts `role` for Flutter compatibility, but the service
      // ALWAYS forces the created user to `customer`. A public user cannot
      // escalate to waiter/kitchen by tampering with the request.
      const res = await request(app).post('/api/auth/register').send({
        name: 'Hacker',
        email: 'hacker@test.com',
        password: 'Password123!',
        role: 'waiter',
      });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.role).toBe('customer');
    });

    it('accepts role:"customer" in the request body (Flutter compatibility)', async () => {
      // Reproduces the exact payload the Flutter app sends.
      const res = await request(app).post('/api/auth/register').send({
        name: 'Abdo',
        email: 'test@gmail.com',
        password: '12345678',
        phone: '01000000000',
        role: 'customer',
      });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.role).toBe('customer');
      expect(res.body.data.user.email).toBe('test@gmail.com');
      expect(res.body.data.token).toMatch(/^[A-Za-z0-9-_.]+$/);
      // Password hash must NOT be returned
      expect(res.body.data.user.passwordHash).toBeUndefined();
    });

    it('forces role to customer even when role:"kitchen" is sent', async () => {
      const res = await request(app).post('/api/auth/register').send({
        name: 'Kitchen Hacker',
        email: 'kitchen-hacker@test.com',
        password: 'Password123!',
        role: 'kitchen',
      });
      expect(res.status).toBe(201);
      expect(res.body.data.user.role).toBe('customer');
    });

    it('still rejects truly unknown fields (strict mode preserved)', async () => {
      // Schema stays .strict() — unrelated unknown keys are still rejected.
      const res = await request(app).post('/api/auth/register').send({
        name: 'Abuse',
        email: 'abuse@test.com',
        password: 'Password123!',
        isAdmin: true,
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/auth/login', () => {
    it('logs in an existing customer and returns a JWT', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'customer@test.com',
        password: 'Password123!',
      });
      expect(res.status).toBe(200);
      expect(res.body.data.token).toMatch(/^[A-Za-z0-9-_.]+$/);
      expect(res.body.data.user.email).toBe('customer@test.com');
    });

    it('rejects wrong password with 401', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'customer@test.com',
        password: 'WrongPassword123!',
      });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('INVALID_CREDENTIALS');
    });

    it('rejects non-existent user with 401', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'nobody@test.com',
        password: 'Password123!',
      });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns the authenticated user', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'));
      expect(res.status).toBe(200);
      expect(res.body.data.user.email).toBe('customer@test.com');
    });

    it('rejects unauthenticated requests', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
    });
  });
});
