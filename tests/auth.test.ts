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
      // Even if the client tries to send role, it must be ignored
      const res = await request(app).post('/api/auth/register').send({
        name: 'Hacker',
        email: 'hacker@test.com',
        password: 'Password123!',
        role: 'waiter',
      } as unknown as Record<string, unknown>);
      // Zod strict() will reject the unknown field, but if we relax schema, register forces customer anyway
      // Here strict() rejects so we get 400 - the customer is NEVER waiter
      expect([400, 201]).toContain(res.status);
      if (res.status === 201) {
        expect(res.body.data.user.role).toBe('customer');
      }
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
