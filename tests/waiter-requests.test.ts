import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app';
import { startMemoryDB, stopMemoryDB, clearCollections } from './setup/memoryDb';
import { seedFixtures } from './helpers/fixtures';
import { authHeader } from './helpers/auth';
import { DiningSessionModel } from '../src/models/diningSession.model';

describe('Waiter Requests & Notifications', () => {
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

  describe('POST /api/waiter-requests', () => {
    it('customer creates a CALL_WAITER request', async () => {
      // Start a dining session for context
      const session = await DiningSessionModel.create({
        tableId: fixtures.table._id,
        startedBy: fixtures.customer._id,
        status: 'active',
        startedAt: new Date(),
      });

      const res = await request(app)
        .post('/api/waiter-requests')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'))
        .send({
          type: 'CALL_WAITER',
          diningSessionId: session._id.toString(),
          message: 'Need water please',
        });
      expect(res.status).toBe(201);
      expect(res.body.data.request.type).toBe('CALL_WAITER');
      expect(res.body.data.request.status).toBe('pending');
    });

    it('waiter cannot create a waiter request (only customers)', async () => {
      const res = await request(app)
        .post('/api/waiter-requests')
        .set(authHeader(fixtures.waiter._id.toString(), 'waiter'))
        .send({ type: 'CALL_WAITER' });
      expect(res.status).toBe(403);
    });

    it('waiter sees all pending requests', async () => {
      const session = await DiningSessionModel.create({
        tableId: fixtures.table._id,
        startedBy: fixtures.customer._id,
        status: 'active',
        startedAt: new Date(),
      });
      await request(app)
        .post('/api/waiter-requests')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'))
        .send({ type: 'CALL_WAITER', diningSessionId: session._id.toString() });

      const list = await request(app)
        .get('/api/waiter-requests')
        .set(authHeader(fixtures.waiter._id.toString(), 'waiter'));
      expect(list.status).toBe(200);
      expect(list.body.data.items.length).toBe(1);
    });

    it('waiter can accept and complete a request', async () => {
      const session = await DiningSessionModel.create({
        tableId: fixtures.table._id,
        startedBy: fixtures.customer._id,
        status: 'active',
        startedAt: new Date(),
      });
      const created = await request(app)
        .post('/api/waiter-requests')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'))
        .send({ type: 'REQUEST_BILL', diningSessionId: session._id.toString() });

      const accepted = await request(app)
        .patch(`/api/waiter-requests/${created.body.data.request.id}/status`)
        .set(authHeader(fixtures.waiter._id.toString(), 'waiter'))
        .send({ status: 'accepted' });
      expect(accepted.status).toBe(200);
      expect(accepted.body.data.request.status).toBe('accepted');

      const completed = await request(app)
        .patch(`/api/waiter-requests/${created.body.data.request.id}/status`)
        .set(authHeader(fixtures.waiter._id.toString(), 'waiter'))
        .send({ status: 'completed' });
      expect(completed.status).toBe(200);
      expect(completed.body.data.request.status).toBe('completed');
    });
  });

  describe('Notifications', () => {
    it('user can list only their own notifications', async () => {
      // Seed: customer 1 has a notification
      const { NotificationModel } = await import('../src/models/notification.model');
      await NotificationModel.create({
        userId: fixtures.customer._id,
        title: 'Test',
        message: 'Hello',
        type: 'SYSTEM',
      });

      // Customer 2 should not see customer 1's notifications - but our test fixtures only have 1 customer.
      // So we'll log in as kitchen and verify they see zero notifications.
      const kitchenList = await request(app)
        .get('/api/notifications')
        .set(authHeader(fixtures.kitchen._id.toString(), 'kitchen'));
      expect(kitchenList.status).toBe(200);
      expect(kitchenList.body.data.items.length).toBe(0);

      const my = await request(app)
        .get('/api/notifications')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'));
      expect(my.body.data.items.length).toBe(1);
      expect(my.body.data.unreadCount).toBe(1);
    });

    it('user marks a notification as read', async () => {
      const { NotificationModel } = await import('../src/models/notification.model');
      const n = await NotificationModel.create({
        userId: fixtures.customer._id,
        title: 'Test',
        message: 'Hello',
      });

      const res = await request(app)
        .patch(`/api/notifications/${n._id}/read`)
        .set(authHeader(fixtures.customer._id.toString(), 'customer'));
      expect(res.status).toBe(200);
      expect(res.body.data.notification.isRead).toBe(true);
    });

    it('user cannot read another user\'s notification', async () => {
      const { NotificationModel } = await import('../src/models/notification.model');
      const n = await NotificationModel.create({
        userId: fixtures.customer._id,
        title: 'Test',
        message: 'Hello',
      });

      // Kitchen tries to mark customer's notification
      const res = await request(app)
        .patch(`/api/notifications/${n._id}/read`)
        .set(authHeader(fixtures.kitchen._id.toString(), 'kitchen'));
      expect(res.status).toBe(403);
    });

    it('mark all as read', async () => {
      const { NotificationModel } = await import('../src/models/notification.model');
      await NotificationModel.create([
        { userId: fixtures.customer._id, title: 'A', message: 'A' },
        { userId: fixtures.customer._id, title: 'B', message: 'B' },
      ]);
      const res = await request(app)
        .patch('/api/notifications/read-all')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'));
      expect(res.status).toBe(200);
      expect(res.body.data.modifiedCount).toBe(2);
    });
  });
});
