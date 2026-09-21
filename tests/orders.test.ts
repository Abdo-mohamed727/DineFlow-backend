import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app';
import { startMemoryDB, stopMemoryDB, clearCollections } from './setup/memoryDb';
import { seedFixtures } from './helpers/fixtures';
import { authHeader } from './helpers/auth';
import { env } from '../src/config/env';
import { DiningSessionModel } from '../src/models/diningSession.model';

describe('Orders — Cart → Checkout flow', () => {
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

  /** Helper: round to 2 decimals matching the backend's `round2` */
  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

  /**
   * Helper: add items to the customer's cart via POST /api/cart/items.
   * Used to set up cart-driven customer checkout tests.
   */
  async function addCartItems(
    customerId: string,
    items: Array<{ productId: string; quantity: number }>,
  ) {
    for (const it of items) {
      const res = await request(app)
        .post('/api/cart/items')
        .set(authHeader(customerId, 'customer'))
        .send(it);
      if (res.status !== 201) {
        throw new Error(`addCartItems failed for ${it.productId}: ${res.status} ${JSON.stringify(res.body)}`);
      }
    }
  }

  describe('POST /api/orders — Cart → Checkout', () => {
    /* ------------------------------------------------------------------ *
     * CASE 1 — TAKEAWAY order created successfully (cart-driven)
     * ------------------------------------------------------------------ */
    it('1. creates a TAKEAWAY order from the cart and the backend computes all totals', async () => {
      // Add items to cart first
      await addCartItems(fixtures.customer._id.toString(), [
        { productId: fixtures.burger._id.toString(), quantity: 2 },
        { productId: fixtures.soup._id.toString(), quantity: 1 },
      ]);

      const res = await request(app)
        .post('/api/orders')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'))
        .send({ orderType: 'TAKEAWAY' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      const { order, orderId, items, subtotal, tax, total, status, orderType, createdAt } = res.body.data;

      // Top-level convenience fields present
      expect(orderId).toBeDefined();
      expect(orderType).toBe('TAKEAWAY');
      expect(status).toBe('pending');
      expect(createdAt).toBeDefined();
      expect(items.length).toBe(2);

      // Backend-computed snapshot — item prices come from MongoDB, NOT the client
      expect(items[0].productName).toBe('Beef Burger');
      expect(items[0].unitPrice).toBe(fixtures.burger.price);
      expect(items[0].subtotal).toBe(fixtures.burger.price * 2);
      expect(items[0].productId).toBe(fixtures.burger._id.toString());

      // Order object also embedded in response
      expect(order.id).toBe(orderId);
      expect(order.type).toBe('TAKEAWAY');
      expect(order.items[0].productName).toBe('Beef Burger');

      // Totals math
      const expectedSubtotal = fixtures.burger.price * 2 + fixtures.soup.price * 1;
      const expectedTax = round2(expectedSubtotal * env.TAX_RATE);
      const expectedTotal = round2(expectedSubtotal + expectedTax);
      expect(subtotal).toBe(expectedSubtotal);
      expect(tax).toBe(expectedTax);
      expect(total).toBe(expectedTotal);

      // TAKEAWAY must NOT be associated with a session/table
      expect(order.diningSessionId).toBeFalsy();
      expect(order.tableId).toBeFalsy();
    });

    /* ------------------------------------------------------------------ *
     * CASE 2 — DINE_IN order created successfully (cart-driven)
     * ------------------------------------------------------------------ */
    it('2. creates a DINE_IN order associated with a dining session', async () => {
      // Start a dining session as the customer
      const session = await DiningSessionModel.create({
        tableId: fixtures.table._id,
        startedBy: fixtures.customer._id,
        status: 'active',
        startedAt: new Date(),
      });

      // Add to cart
      await addCartItems(fixtures.customer._id.toString(), [
        { productId: fixtures.burger._id.toString(), quantity: 1 },
      ]);

      const res = await request(app)
        .post('/api/orders')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'))
        .send({
          orderType: 'DINE_IN',
          diningSessionId: session._id.toString(),
          notes: 'No onions',
        });

      expect(res.status).toBe(201);
      const { order, orderId, orderType, status } = res.body.data;
      expect(orderType).toBe('DINE_IN');
      expect(status).toBe('pending');
      expect(orderId).toBeDefined();
      expect(order.diningSessionId).toBeTruthy();
      expect(order.tableId).toBeTruthy();
      expect(order.notes).toBe('No onions');
    });

    /* ------------------------------------------------------------------ *
     * CASE 3 — empty cart (customer sends no items, cart is empty)
     * ------------------------------------------------------------------ */
    it('3. rejects an order with an empty cart (400 EMPTY_CART)', async () => {
      const res = await request(app)
        .post('/api/orders')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'))
        .send({ orderType: 'TAKEAWAY' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('EMPTY_CART');
    });

    /* ------------------------------------------------------------------ *
     * CASE 4 — invalid productId format (in waiter items-in-body flow)
     * ------------------------------------------------------------------ */
    it('4. rejects an invalid productId format (400 VALIDATION_ERROR)', async () => {
      const res = await request(app)
        .post('/api/orders')
        .set(authHeader(fixtures.waiter._id.toString(), 'waiter'))
        .send({
          orderType: 'TAKEAWAY',
          items: [{ productId: 'not-an-objectid', quantity: 1 }],
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });

    /* ------------------------------------------------------------------ *
     * CASE 5 — product does not exist (waiter flow with valid ObjectId shape)
     * ------------------------------------------------------------------ */
    it('5. rejects when a productId does not exist in the catalog (400 PRODUCT_NOT_FOUND)', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await request(app)
        .post('/api/orders')
        .set(authHeader(fixtures.waiter._id.toString(), 'waiter'))
        .send({
          orderType: 'TAKEAWAY',
          items: [{ productId: fakeId, quantity: 1 }],
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('PRODUCT_NOT_FOUND');
    });

    /* ------------------------------------------------------------------ *
     * CASE 6 — product is unavailable (customer flow: cart contains an
     *          unavailable product that was added bypassing the add-to-cart
     *          endpoint via direct DB insertion)
     * ------------------------------------------------------------------ */
    it('6. rejects when a product is unavailable (400 PRODUCT_UNAVAILABLE)', async () => {
      // Insert an unavailable product directly into the cart (bypassing the
      // add-to-cart endpoint, which would reject the unavailable product).
      const { CartModel } = await import('../src/models/cart.model');
      await CartModel.create({
        customerId: fixtures.customer._id,
        items: [{ productId: fixtures.unavailable._id, quantity: 1 }],
      });

      const res = await request(app)
        .post('/api/orders')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'))
        .send({ orderType: 'TAKEAWAY' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('PRODUCT_UNAVAILABLE');
    });

    /* ------------------------------------------------------------------ *
     * CASE 7 — invalid quantity (waiter flow with negative quantity)
     * ------------------------------------------------------------------ */
    it('7. rejects negative / zero / non-integer quantity (400 VALIDATION_ERROR)', async () => {
      const res = await request(app)
        .post('/api/orders')
        .set(authHeader(fixtures.waiter._id.toString(), 'waiter'))
        .send({
          orderType: 'TAKEAWAY',
          items: [{ productId: fixtures.burger._id.toString(), quantity: -1 }],
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });

    /* ------------------------------------------------------------------ *
     * CASE 8 — unauthorized request (no JWT)
     * ------------------------------------------------------------------ */
    it('8. rejects unauthenticated requests (401)', async () => {
      const res = await request(app)
        .post('/api/orders')
        .send({ orderType: 'TAKEAWAY' });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('UNAUTHORIZED');
    });

    /* ------------------------------------------------------------------ *
     * CASE 9 — invalid / non-existing diningSessionId (valid ObjectId shape)
     * ------------------------------------------------------------------ */
    it('9. rejects DINE_IN order with non-existing diningSessionId (404 DINING_SESSION_NOT_FOUND)', async () => {
      const fakeSessionId = new mongoose.Types.ObjectId().toString();
      await addCartItems(fixtures.customer._id.toString(), [
        { productId: fixtures.burger._id.toString(), quantity: 1 },
      ]);

      const res = await request(app)
        .post('/api/orders')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'))
        .send({
          orderType: 'DINE_IN',
          diningSessionId: fakeSessionId,
        });
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('DINING_SESSION_NOT_FOUND');
    });

    /* ------------------------------------------------------------------ *
     * CASE 9b — DINE_IN missing diningSessionId
     * ------------------------------------------------------------------ */
    it('9b. rejects DINE_IN order without diningSessionId (400 VALIDATION_ERROR)', async () => {
      await addCartItems(fixtures.customer._id.toString(), [
        { productId: fixtures.burger._id.toString(), quantity: 1 },
      ]);

      const res = await request(app)
        .post('/api/orders')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'))
        .send({ orderType: 'DINE_IN' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });

    /* ------------------------------------------------------------------ *
     * CASE 9c — DINE_IN with a closed dining session
     * ------------------------------------------------------------------ */
    it('9c. rejects DINE_IN order against a closed dining session (400 SESSION_CLOSED)', async () => {
      const session = await DiningSessionModel.create({
        tableId: fixtures.table._id,
        startedBy: fixtures.customer._id,
        status: 'closed',
        startedAt: new Date(),
        endedAt: new Date(),
      });
      await addCartItems(fixtures.customer._id.toString(), [
        { productId: fixtures.burger._id.toString(), quantity: 1 },
      ]);

      const res = await request(app)
        .post('/api/orders')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'))
        .send({
          orderType: 'DINE_IN',
          diningSessionId: session._id.toString(),
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('SESSION_CLOSED');
    });

    /* ------------------------------------------------------------------ *
     * CASE 10 — verify prices are pulled from MongoDB (not from client)
     * ------------------------------------------------------------------ */
    it('10. rejects waiter-supplied unitPrice / subtotal / total — backend is source of truth', async () => {
      const res = await request(app)
        .post('/api/orders')
        .set(authHeader(fixtures.waiter._id.toString(), 'waiter'))
        .send({
          orderType: 'TAKEAWAY',
          items: [
            {
              productId: fixtures.burger._id.toString(),
              quantity: 1,
              // Injected by malicious / buggy client — must be rejected by `.strict()`
              unitPrice: 1,
              subtotal: 1,
            } as unknown as { productId: string; quantity: number },
          ],
          total: 1,
        });
      // Zod strict() rejects unknown keys
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });

    /* ------------------------------------------------------------------ *
     * CASE 11 — verify total calculation matches the formula
     * ------------------------------------------------------------------ */
    it('11. verifies total = subtotal + (subtotal × TAX_RATE)', async () => {
      const qty = 3;
      await addCartItems(fixtures.customer._id.toString(), [
        { productId: fixtures.pizza._id.toString(), quantity: qty },
      ]);

      const res = await request(app)
        .post('/api/orders')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'))
        .send({ orderType: 'TAKEAWAY' });
      expect(res.status).toBe(201);
      const { subtotal, tax, total } = res.body.data;
      const expectedSubtotal = fixtures.pizza.price * qty;
      const expectedTax = round2(expectedSubtotal * env.TAX_RATE);
      const expectedTotal = round2(expectedSubtotal + expectedTax);
      expect(subtotal).toBe(expectedSubtotal);
      expect(tax).toBe(expectedTax);
      expect(total).toBe(expectedTotal);
    });

    /* ------------------------------------------------------------------ *
     * CASE 12 — verify the API does NOT mutate any state on failure
     *           (cart must NOT be cleared on failure)
     * ------------------------------------------------------------------ */
    it('12. on failure, no order is persisted (cart must remain intact on client)', async () => {
      // Insert a cart with an unavailable product (bypassing endpoint validation)
      const { CartModel } = await import('../src/models/cart.model');
      await CartModel.create({
        customerId: fixtures.customer._id,
        items: [{ productId: fixtures.unavailable._id, quantity: 1 }],
      });

      const before = await mongoose.connection.collection('orders').countDocuments();
      const res = await request(app)
        .post('/api/orders')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'))
        .send({ orderType: 'TAKEAWAY' });
      expect(res.status).toBe(400); // PRODUCT_UNAVAILABLE
      const after = await mongoose.connection.collection('orders').countDocuments();
      expect(after).toBe(before); // nothing persisted — client safe to keep cart

      // Cart must still have its items
      const cartRes = await request(app)
        .get('/api/cart')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'));
      expect(cartRes.body.data.cart.items.length).toBe(1);
    });

    /* ------------------------------------------------------------------ *
     * CASE 13 — verify the API ONLY persists on success
     *           (cart cleared after a successful customer checkout)
     * ------------------------------------------------------------------ */
    it('13. on success, exactly one order is persisted and cart is cleared', async () => {
      await addCartItems(fixtures.customer._id.toString(), [
        { productId: fixtures.burger._id.toString(), quantity: 1 },
      ]);

      const before = await mongoose.connection.collection('orders').countDocuments();
      const res = await request(app)
        .post('/api/orders')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'))
        .send({ orderType: 'TAKEAWAY' });
      expect(res.status).toBe(201);
      const after = await mongoose.connection.collection('orders').countDocuments();
      expect(after).toBe(before + 1); // exactly one order persisted

      // Cart must be cleared
      const cartRes = await request(app)
        .get('/api/cart')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'));
      expect(cartRes.body.data.cart.items).toEqual([]);
    });

    /* ------------------------------------------------------------------ *
     * CASE 14 — customer sending `items` in the body is rejected
     * ------------------------------------------------------------------ */
    it('14. rejects when a customer sends `items` in the body (must use cart)', async () => {
      const res = await request(app)
        .post('/api/orders')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'))
        .send({
          orderType: 'TAKEAWAY',
          items: [{ productId: fixtures.burger._id.toString(), quantity: 1 }],
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });

    /* ------------------------------------------------------------------ *
     * CASE 15 — waiter can place an order with items in body
     * ------------------------------------------------------------------ */
    it('15. waiter places a TAKEAWAY order with items in body', async () => {
      const res = await request(app)
        .post('/api/orders')
        .set(authHeader(fixtures.waiter._id.toString(), 'waiter'))
        .send({
          orderType: 'TAKEAWAY',
          items: [{ productId: fixtures.burger._id.toString(), quantity: 1 }],
        });
      expect(res.status).toBe(201);
      expect(res.body.data.items.length).toBe(1);
      expect(res.body.data.orderType).toBe('TAKEAWAY');
    });

    /* ------------------------------------------------------------------ *
     * CASE 16 — waiter cannot place order without items in body
     * ------------------------------------------------------------------ */
    it('16. rejects a waiter order without items in body (400 VALIDATION_ERROR)', async () => {
      const res = await request(app)
        .post('/api/orders')
        .set(authHeader(fixtures.waiter._id.toString(), 'waiter'))
        .send({ orderType: 'TAKEAWAY' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });

    /* ------------------------------------------------------------------ *
     * CASE — extra coverage: invalid orderType
     * ------------------------------------------------------------------ */
    it('rejects an invalid orderType value (400 VALIDATION_ERROR)', async () => {
      const res = await request(app)
        .post('/api/orders')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'))
        .send({ orderType: 'DELIVERY' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });

    /* ------------------------------------------------------------------ *
     * CASE — extra coverage: missing orderType field
     * ------------------------------------------------------------------ */
    it('rejects a request missing orderType (400 VALIDATION_ERROR)', async () => {
      const res = await request(app)
        .post('/api/orders')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'))
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });
  });

  describe('Order lifecycle (status transitions)', () => {
    /**
     * Helper for lifecycle tests: create an order from the cart and return
     * its ID. The lifecycle tests don't care about the items themselves;
     * they just need an order to drive through status transitions.
     */
    async function createOrderFromCart(role: 'customer' | 'waiter' = 'customer', customerId?: string) {
      const userId = customerId ?? fixtures.customer._id.toString();
      if (role === 'customer') {
        await addCartItems(userId, [
          { productId: fixtures.burger._id.toString(), quantity: 1 },
        ]);
        const res = await request(app)
          .post('/api/orders')
          .set(authHeader(userId, 'customer'))
          .send({ orderType: 'TAKEAWAY' });
        expect(res.status).toBe(201);
        return res.body.data.orderId;
      } else {
        // waiter flow — items in body
        const res = await request(app)
          .post('/api/orders')
          .set(authHeader(userId, 'waiter'))
          .send({
            orderType: 'TAKEAWAY',
            items: [{ productId: fixtures.burger._id.toString(), quantity: 1 }],
          });
        expect(res.status).toBe(201);
        return res.body.data.orderId;
      }
    }

    it('runs through pending → confirmed → preparing → ready → served → completed', async () => {
      const orderId = await createOrderFromCart();

      for (const [role, status] of [
        ['kitchen', 'confirmed'],
        ['kitchen', 'preparing'],
        ['kitchen', 'ready'],
        ['waiter', 'served'],
        ['waiter', 'completed'],
      ] as const) {
        const res = await request(app)
          .patch(`/api/orders/${orderId}/status`)
          .set(authHeader(
            role === 'kitchen' ? fixtures.kitchen._id.toString() : fixtures.waiter._id.toString(),
            role,
          ))
          .send({ status });
        expect(res.status).toBe(200);
        expect(res.body.data.order.status).toBe(status);
      }
    });

    it('rejects invalid transition: completed → preparing', async () => {
      const orderId = await createOrderFromCart();

      await request(app).patch(`/api/orders/${orderId}/status`).set(authHeader(fixtures.kitchen._id.toString(), 'kitchen')).send({ status: 'confirmed' });
      await request(app).patch(`/api/orders/${orderId}/status`).set(authHeader(fixtures.kitchen._id.toString(), 'kitchen')).send({ status: 'preparing' });
      await request(app).patch(`/api/orders/${orderId}/status`).set(authHeader(fixtures.kitchen._id.toString(), 'kitchen')).send({ status: 'ready' });
      await request(app).patch(`/api/orders/${orderId}/status`).set(authHeader(fixtures.waiter._id.toString(), 'waiter')).send({ status: 'served' });
      await request(app).patch(`/api/orders/${orderId}/status`).set(authHeader(fixtures.waiter._id.toString(), 'waiter')).send({ status: 'completed' });

      const res = await request(app)
        .patch(`/api/orders/${orderId}/status`)
        .set(authHeader(fixtures.kitchen._id.toString(), 'kitchen'))
        .send({ status: 'preparing' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('INVALID_STATUS_TRANSITION');
    });

    it('customer can cancel pending order', async () => {
      const orderId = await createOrderFromCart();

      const cancel = await request(app)
        .patch(`/api/orders/${orderId}/cancel`)
        .set(authHeader(fixtures.customer._id.toString(), 'customer'));
      expect(cancel.status).toBe(200);
      expect(cancel.body.data.order.status).toBe('cancelled');
    });

    it('customer CANNOT cancel a preparing order', async () => {
      const orderId = await createOrderFromCart();

      await request(app).patch(`/api/orders/${orderId}/status`).set(authHeader(fixtures.kitchen._id.toString(), 'kitchen')).send({ status: 'confirmed' });
      await request(app).patch(`/api/orders/${orderId}/status`).set(authHeader(fixtures.kitchen._id.toString(), 'kitchen')).send({ status: 'preparing' });

      const cancel = await request(app)
        .patch(`/api/orders/${orderId}/cancel`)
        .set(authHeader(fixtures.customer._id.toString(), 'customer'));
      expect(cancel.status).toBe(400);
      expect(cancel.body.error).toBe('ORDER_NOT_CANCELLABLE');
    });

    it('kitchen cannot do waiter-only transitions (e.g. served)', async () => {
      const orderId = await createOrderFromCart();
      await request(app).patch(`/api/orders/${orderId}/status`).set(authHeader(fixtures.kitchen._id.toString(), 'kitchen')).send({ status: 'confirmed' });
      await request(app).patch(`/api/orders/${orderId}/status`).set(authHeader(fixtures.kitchen._id.toString(), 'kitchen')).send({ status: 'preparing' });
      await request(app).patch(`/api/orders/${orderId}/status`).set(authHeader(fixtures.kitchen._id.toString(), 'kitchen')).send({ status: 'ready' });

      const res = await request(app)
        .patch(`/api/orders/${orderId}/status`)
        .set(authHeader(fixtures.kitchen._id.toString(), 'kitchen'))
        .send({ status: 'served' });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('FORBIDDEN');
    });
  });

  describe('Authorization', () => {
    it('customer cannot update order status (only kitchen/waiter)', async () => {
      await addCartItems(fixtures.customer._id.toString(), [
        { productId: fixtures.burger._id.toString(), quantity: 1 },
      ]);
      const create = await request(app)
        .post('/api/orders')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'))
        .send({ orderType: 'TAKEAWAY' });
      const orderId = create.body.data.orderId;
      const res = await request(app)
        .patch(`/api/orders/${orderId}/status`)
        .set(authHeader(fixtures.customer._id.toString(), 'customer'))
        .send({ status: 'confirmed' });
      expect(res.status).toBe(403);
    });

    it('customer sees only their own orders', async () => {
      await addCartItems(fixtures.customer._id.toString(), [
        { productId: fixtures.burger._id.toString(), quantity: 1 },
      ]);
      await request(app)
        .post('/api/orders')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'))
        .send({ orderType: 'TAKEAWAY' });
      const kitchenList = await request(app)
        .get('/api/orders')
        .set(authHeader(fixtures.kitchen._id.toString(), 'kitchen'));
      expect(kitchenList.body.data.items.length).toBe(1);

      const myOrders = await request(app)
        .get('/api/orders')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'));
      expect(myOrders.body.data.items.length).toBe(1);
    });
  });
});
