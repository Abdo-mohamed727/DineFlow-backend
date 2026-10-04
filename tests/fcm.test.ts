import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app';
import { startMemoryDB, stopMemoryDB, clearCollections } from './setup/memoryDb';
import { seedFixtures } from './helpers/fixtures';
import { authHeader } from './helpers/auth';
import { UserModel } from '../src/models/user.model';
import { NotificationModel } from '../src/models/notification.model';

/**
 * FCM Push Notification integration tests.
 *
 * Strategy:
 *   - The test environment does NOT have FIREBASE_SERVICE_ACCOUNT set, so
 *     `firebaseConfigured` is `false` and `fcmService.sendPush` returns
 *     `{ reason: 'not-configured' }` without calling Firebase.
 *   - To assert "FCM was attempted", we spy on `fcmService.sendPush` using
 *     jest.spyOn and check it was called with the expected tokens.
 *   - To simulate "FCM fails", we make the spy throw. The order update
 *     must still succeed.
 *
 * All orders are created via the CUSTOMER cart flow so the customer is the
 * recipient of the order-status-change notification. (When a waiter creates
 * an order via items-in-body, the waiter becomes the `customerId` — which
 * is fine for the order-creation flow but confusing for status-change
 * notification tests.)
 */
describe('FCM Push Notifications', () => {
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

  /**
   * Helper: add items to the customer's cart via the cart API, then place
   * an order via the customer cart-driven checkout flow. Returns the order id.
   * The order's `customerId` is the customer, so the customer receives
   * subsequent status-change notifications.
   */
  async function createOrderFromCart(): Promise<string> {
    // 1. Add to cart
    const addRes = await request(app)
      .post('/api/cart/items')
      .set(authHeader(fixtures.customer._id.toString(), 'customer'))
      .send({ productId: fixtures.burger._id.toString(), quantity: 1 });
    expect(addRes.status).toBe(201);

    // 2. Place order (cart-driven, no items in body)
    const orderRes = await request(app)
      .post('/api/orders')
      .set(authHeader(fixtures.customer._id.toString(), 'customer'))
      .send({ orderType: 'TAKEAWAY' });
    expect(orderRes.status).toBe(201);
    return orderRes.body.data.orderId as string;
  }

  /* ====================================================================== */
  /* POST /api/notifications/device-token                                  */
  /* ====================================================================== */
  describe('POST /api/notifications/device-token', () => {
    it('registers an FCM device token for the authenticated user', async () => {
      const token = 'fcm-token-abc123-xyz789-very-long-opaque-string';
      const res = await request(app)
        .post('/api/notifications/device-token')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'))
        .send({ token });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.deviceTokens).toContain(token);
    });

    it('is idempotent — registering the same token twice does not duplicate', async () => {
      const token = 'fcm-token-abc123-xyz789-very-long-opaque-string';

      await request(app)
        .post('/api/notifications/device-token')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'))
        .send({ token });

      const res = await request(app)
        .post('/api/notifications/device-token')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'))
        .send({ token });
      expect(res.status).toBe(200);
      expect(res.body.data.deviceTokens.filter((t: string) => t === token).length).toBe(1);
    });

    it('supports multiple tokens per user (multiple devices)', async () => {
      const token1 = 'fcm-token-device-1-aaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      const token2 = 'fcm-token-device-2-bbbbbbbbbbbbbbbbbbbbbbbbbbbb';

      await request(app)
        .post('/api/notifications/device-token')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'))
        .send({ token: token1 });
      const res = await request(app)
        .post('/api/notifications/device-token')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'))
        .send({ token: token2 });
      expect(res.status).toBe(200);
      expect(res.body.data.deviceTokens).toContain(token1);
      expect(res.body.data.deviceTokens).toContain(token2);
      expect(res.body.data.deviceTokens.length).toBe(2);
    });

    it('rejects an empty / too-short token (400 VALIDATION_ERROR)', async () => {
      const res = await request(app)
        .post('/api/notifications/device-token')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'))
        .send({ token: 'short' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });

    it('rejects unauthenticated requests (401)', async () => {
      const res = await request(app)
        .post('/api/notifications/device-token')
        .send({ token: 'fcm-token-some-very-long-opaque-string-value-here' });
      expect(res.status).toBe(401);
    });

    it('never accepts a userId from the request body (always uses JWT)', async () => {
      // The schema is .strict() — sending an unexpected `userId` field
      // should be rejected with VALIDATION_ERROR, even though the route
      // only reads `token` from the body.
      const res = await request(app)
        .post('/api/notifications/device-token')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'))
        .send({
          token: 'fcm-token-some-very-long-opaque-string-value-here',
          userId: fixtures.waiter._id.toString(), // attempt to register on another user
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });
  });

  /* ====================================================================== */
  /* DELETE /api/notifications/device-token                                */
  /* ====================================================================== */
  describe('DELETE /api/notifications/device-token', () => {
    it('removes a registered FCM device token', async () => {
      const token = 'fcm-token-to-be-removed-aaaaaaaaaaaaaaaaaaaaaaa';
      await request(app)
        .post('/api/notifications/device-token')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'))
        .send({ token });

      const res = await request(app)
        .delete('/api/notifications/device-token')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'))
        .send({ token });
      expect(res.status).toBe(200);
      expect(res.body.data.deviceTokens).not.toContain(token);
    });

    it('is idempotent — removing a non-existent token is a no-op', async () => {
      const token = 'fcm-token-never-registered-bbbbbbbbbbbbbbbbbbb';
      const res = await request(app)
        .delete('/api/notifications/device-token')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'))
        .send({ token });
      expect(res.status).toBe(200);
      expect(res.body.data.deviceTokens).toEqual([]);
    });
  });

  /* ====================================================================== */
  /* Order status change → notification + FCM                              */
  /* ====================================================================== */
  describe('PATCH /api/orders/:id/status → notification + FCM', () => {
    it('1. order status change → notification is persisted in MongoDB', async () => {
      const orderId = await createOrderFromCart();
      const res = await request(app)
        .patch(`/api/orders/${orderId}/status`)
        .set(authHeader(fixtures.kitchen._id.toString(), 'kitchen'))
        .send({ status: 'confirmed' });
      expect(res.status).toBe(200);

      // A notification should exist for the customer who owns the order.
      const notifs = await NotificationModel.find({
        userId: fixtures.customer._id,
      }).sort({ createdAt: -1 });
      expect(notifs.length).toBeGreaterThan(0);
      const latest = notifs[0];
      expect(latest.type).toBe('ORDER_UPDATE');
      expect(latest.title).toBe('Order status updated');
      expect(latest.message).toContain('confirmed');
      expect(latest.data?.orderId).toBeTruthy();
      expect(latest.data?.status).toBe('confirmed');
    });

    it('2. customer receives the notification (not the kitchen who changed it)', async () => {
      const orderId = await createOrderFromCart();
      await request(app)
        .patch(`/api/orders/${orderId}/status`)
        .set(authHeader(fixtures.kitchen._id.toString(), 'kitchen'))
        .send({ status: 'confirmed' });

      // The notification should be addressed to the customer, not the kitchen.
      const customerNotifs = await NotificationModel.find({ userId: fixtures.customer._id });
      const kitchenNotifs = await NotificationModel.find({ userId: fixtures.kitchen._id });
      expect(customerNotifs.length).toBeGreaterThan(0);
      // The kitchen actor should NOT receive a notification about the status change.
      const statusChangeNotifsForKitchen = kitchenNotifs.filter(
        (n) => n.title === 'Order status updated',
      );
      expect(statusChangeNotifsForKitchen.length).toBe(0);
    });

    it('3. order status API still returns 200 (FCM failure does not break it)', async () => {
      const orderId = await createOrderFromCart();
      const res = await request(app)
        .patch(`/api/orders/${orderId}/status`)
        .set(authHeader(fixtures.kitchen._id.toString(), 'kitchen'))
        .send({ status: 'confirmed' });
      expect(res.status).toBe(200);
      expect(res.body.data.order.status).toBe('confirmed');
    });

    it('4. when no device token is registered, notification is still persisted', async () => {
      // Customer has NO FCM tokens registered. The notification should
      // still be created in MongoDB (it appears in GET /api/notifications).
      const orderId = await createOrderFromCart();
      await request(app)
        .patch(`/api/orders/${orderId}/status`)
        .set(authHeader(fixtures.kitchen._id.toString(), 'kitchen'))
        .send({ status: 'confirmed' });

      const notifs = await NotificationModel.find({ userId: fixtures.customer._id });
      expect(notifs.length).toBeGreaterThan(0);
    });

    it('5. FCM send is attempted when device token exists (spy)', async () => {
      // Register a device token for the customer.
      const token = 'fcm-token-customer-device-ccccccccccccccccccccccccc';
      await request(app)
        .post('/api/notifications/device-token')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'))
        .send({ token });

      // Spy on the FCM service. In the test env, `firebaseConfigured` is
      // false so `sendPush` returns `{ reason: 'not-configured' }` — but it
      // IS still called with the token list, which is what we want to assert.
      const { fcmService } = await import('../src/services/fcm.service');
      const spy = jest.spyOn(fcmService, 'sendPush');

      const orderId = await createOrderFromCart();
      await request(app)
        .patch(`/api/orders/${orderId}/status`)
        .set(authHeader(fixtures.kitchen._id.toString(), 'kitchen'))
        .send({ status: 'confirmed' });

      expect(spy).toHaveBeenCalled();
      const [tokensArg, messageArg] = spy.mock.calls[0];
      expect(tokensArg).toContain(token);
      expect(messageArg.title).toBe('Order status updated');
      expect(messageArg.data?.orderId).toBe(orderId);
      expect(messageArg.data?.status).toBe('confirmed');
      expect(messageArg.data?.type).toBe('ORDER_UPDATE');

      spy.mockRestore();
    });

    it('6. FCM failure does NOT roll back the order status update', async () => {
      // Make FCM "fail" by mocking sendPush to throw. The order-status
      // endpoint should still return 200 and the notification should still
      // be persisted.
      const { fcmService } = await import('../src/services/fcm.service');
      const spy = jest.spyOn(fcmService, 'sendPush').mockImplementation(async () => {
        throw new Error('simulated FCM network failure');
      });

      const orderId = await createOrderFromCart();
      const res = await request(app)
        .patch(`/api/orders/${orderId}/status`)
        .set(authHeader(fixtures.kitchen._id.toString(), 'kitchen'))
        .send({ status: 'confirmed' });

      // Order update must succeed.
      expect(res.status).toBe(200);
      expect(res.body.data.order.status).toBe('confirmed');

      // Notification must still be persisted despite FCM failure.
      const notifs = await NotificationModel.find({ userId: fixtures.customer._id });
      expect(notifs.length).toBeGreaterThan(0);

      spy.mockRestore();
    });

    it('7. invalid FCM tokens are reported and removed from the user record', async () => {
      // Register a token for the customer.
      const token = 'fcm-token-will-be-invalidated-dddddddddddddddddddddddd';
      await request(app)
        .post('/api/notifications/device-token')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'))
        .send({ token });

      // Mock FCM to report the token as invalid (unregistered).
      const { fcmService } = await import('../src/services/fcm.service');
      const spy = jest.spyOn(fcmService, 'sendPush').mockImplementation(async (tokens) => ({
        attempted: tokens.length,
        invalidTokens: tokens, // mark ALL as invalid
        success: false,
        reason: 'error',
      }));

      const orderId = await createOrderFromCart();
      await request(app)
        .patch(`/api/orders/${orderId}/status`)
        .set(authHeader(fixtures.kitchen._id.toString(), 'kitchen'))
        .send({ status: 'confirmed' });

      // Give the background `removeInvalidTokens` call a tick to complete
      // (the cleanup is fire-and-forget inside `notifyOrderStatusChanged`).
      await new Promise((r) => setTimeout(r, 50));

      // The invalid token should have been removed from the user's record.
      const user = await UserModel.findById(fixtures.customer._id);
      expect(user?.deviceTokens ?? []).not.toContain(token);

      spy.mockRestore();
    });

    it('8. existing notification APIs continue working (GET /api/notifications)', async () => {
      const orderId = await createOrderFromCart();
      await request(app)
        .patch(`/api/orders/${orderId}/status`)
        .set(authHeader(fixtures.kitchen._id.toString(), 'kitchen'))
        .send({ status: 'confirmed' });

      const res = await request(app)
        .get('/api/notifications')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'));
      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBeGreaterThan(0);
      expect(res.body.data.unreadCount).toBeGreaterThan(0);
    });

    it('9. existing order-status endpoint contract unchanged (200 + order object)', async () => {
      const orderId = await createOrderFromCart();
      const res = await request(app)
        .patch(`/api/orders/${orderId}/status`)
        .set(authHeader(fixtures.kitchen._id.toString(), 'kitchen'))
        .send({ status: 'confirmed' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.order.id).toBe(orderId);
      expect(res.body.data.order.status).toBe('confirmed');
    });
  });

  /* ====================================================================== */
  /* POST /api/orders → Customer places order → Kitchen notified           */
  /* ====================================================================== */
  describe('POST /api/orders → Customer → Kitchen notification', () => {
    it('1. customer places order → kitchen user receives a MongoDB notification', async () => {
      const orderId = await createOrderFromCart();

      // The seeded kitchen user should have received a "New Order" notification.
      const kitchenNotifs = await NotificationModel.find({
        userId: fixtures.kitchen._id,
        title: 'New Order',
      }).sort({ createdAt: -1 });
      expect(kitchenNotifs.length).toBeGreaterThan(0);

      const latest = kitchenNotifs[0];
      expect(latest.type).toBe('ORDER_UPDATE');
      expect(latest.message).toContain('New order');
      expect(latest.data?.orderId).toBe(orderId);
      expect(latest.data?.orderNumber).toBeTruthy();
      expect(latest.data?.status).toBe('pending');
      expect(latest.data?.type).toBe('NEW_ORDER');
      expect(latest.data?.clickAction).toBe('NEW_ORDER');
    });

    it('2. multiple kitchen users each receive their own notification', async () => {
      // Create a SECOND kitchen user.
      const { UserModel } = await import('../src/models/user.model');
      const { hashPassword } = await import('../src/utils/password');
      const { ROLES } = await import('../src/types');
      const kitchen2 = await UserModel.create({
        name: 'Second Kitchen',
        email: 'kitchen2@test.com',
        passwordHash: await hashPassword('Password123!'),
        role: ROLES.KITCHEN,
      });

      await createOrderFromCart();

      // BOTH kitchen users should have a notification.
      const k1Notifs = await NotificationModel.find({
        userId: fixtures.kitchen._id,
        title: 'New Order',
      });
      const k2Notifs = await NotificationModel.find({
        userId: kitchen2._id,
        title: 'New Order',
      });
      expect(k1Notifs.length).toBeGreaterThan(0);
      expect(k2Notifs.length).toBeGreaterThan(0);
    });

    it('3. kitchen user with no device token still gets the MongoDB notification', async () => {
      // The seeded kitchen user has NO device tokens registered.
      await createOrderFromCart();

      const notifs = await NotificationModel.find({
        userId: fixtures.kitchen._id,
        title: 'New Order',
      });
      expect(notifs.length).toBeGreaterThan(0);
    });

    it('4. FCM send is attempted when kitchen user has a device token (spy)', async () => {
      // Register a device token for the kitchen user.
      const token = 'fcm-token-kitchen-device-kkkkkkkkkkkkkkkkkkkkkkk';
      await request(app)
        .post('/api/notifications/device-token')
        .set(authHeader(fixtures.kitchen._id.toString(), 'kitchen'))
        .send({ token });

      const { fcmService } = await import('../src/services/fcm.service');
      const spy = jest.spyOn(fcmService, 'sendPush');

      await createOrderFromCart();

      // The spy should have been called at least once with the kitchen token.
      const kitchenCall = spy.mock.calls.find(
        ([tokens]) => Array.isArray(tokens) && tokens.includes(token),
      );
      expect(kitchenCall).toBeTruthy();
      if (kitchenCall) {
        const [, message] = kitchenCall;
        expect(message.title).toBe('New Order');
        expect(message.data?.orderId).toBeTruthy();
        expect(message.data?.type).toBe('NEW_ORDER');
        expect(message.data?.clickAction).toBe('NEW_ORDER');
      }

      spy.mockRestore();
    });

    it('5. FCM failure does NOT roll back order creation', async () => {
      const { fcmService } = await import('../src/services/fcm.service');
      const spy = jest.spyOn(fcmService, 'sendPush').mockImplementation(async () => {
        throw new Error('simulated FCM network failure');
      });

      const orderRes = await request(app)
        .post('/api/cart/items')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'))
        .send({ productId: fixtures.burger._id.toString(), quantity: 1 });
      expect(orderRes.status).toBe(201);

      const createRes = await request(app)
        .post('/api/orders')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'))
        .send({ orderType: 'TAKEAWAY' });

      // Order creation MUST succeed regardless of FCM outcome.
      expect(createRes.status).toBe(201);
      expect(createRes.body.data.orderId).toBeTruthy();

      // The in-app notification for the kitchen user MUST still be persisted.
      const notifs = await NotificationModel.find({
        userId: fixtures.kitchen._id,
        title: 'New Order',
      });
      expect(notifs.length).toBeGreaterThan(0);

      spy.mockRestore();
    });

    it('6. no kitchen users exist → order still created successfully', async () => {
      // Remove the seeded kitchen user so there are none.
      const { UserModel } = await import('../src/models/user.model');
      await UserModel.deleteMany({ role: 'kitchen' });

      const orderRes = await request(app)
        .post('/api/cart/items')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'))
        .send({ productId: fixtures.burger._id.toString(), quantity: 1 });
      expect(orderRes.status).toBe(201);

      const createRes = await request(app)
        .post('/api/orders')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'))
        .send({ orderType: 'TAKEAWAY' });
      expect(createRes.status).toBe(201);
      expect(createRes.body.data.orderId).toBeTruthy();

      // No kitchen notifications should exist.
      const kitchenNotifs = await NotificationModel.find({
        title: 'New Order',
      });
      expect(kitchenNotifs.length).toBe(0);
    });

    it('7. existing customer "Order received" notification still works', async () => {
      // The customer should still receive their own "Order received" notification.
      await createOrderFromCart();

      const customerNotifs = await NotificationModel.find({
        userId: fixtures.customer._id,
        title: 'Order received',
      });
      expect(customerNotifs.length).toBeGreaterThan(0);
    });

    it('8. existing Kitchen → Customer status-change flow still works', async () => {
      // Place an order, then change its status. The customer should still
      // receive the "Order status updated" notification.
      const orderId = await createOrderFromCart();

      const statusRes = await request(app)
        .patch(`/api/orders/${orderId}/status`)
        .set(authHeader(fixtures.kitchen._id.toString(), 'kitchen'))
        .send({ status: 'confirmed' });
      expect(statusRes.status).toBe(200);

      const customerStatusNotifs = await NotificationModel.find({
        userId: fixtures.customer._id,
        title: 'Order status updated',
      });
      expect(customerStatusNotifs.length).toBeGreaterThan(0);
      expect(customerStatusNotifs[0].data?.status).toBe('confirmed');
    });
  });
});
