import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app';
import { startMemoryDB, stopMemoryDB, clearCollections } from './setup/memoryDb';
import { seedFixtures } from './helpers/fixtures';
import { authHeader } from './helpers/auth';
import { env } from '../src/config/env';
import { CartModel } from '../src/models/cart.model';

/**
 * Cart tests — covers all 5 cart endpoints + authorization + the
 * cart → order checkout flow.
 *
 * Test fixtures reuse the same seedFixtures() used by the other test suites
 * (see tests/helpers/fixtures.ts): burger, soup, pizza, unavailable product,
 * customer / waiter / kitchen users.
 */
describe('Cart', () => {
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

  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

  /* ====================================================================== */
  /* GET /api/cart                                                          */
  /* ====================================================================== */
  describe('GET /api/cart', () => {
    it('returns an empty cart for a new customer (no error)', async () => {
      const res = await request(app)
        .get('/api/cart')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'));
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.cart.items).toEqual([]);
      expect(res.body.data.cart.subtotal).toBe(0);
      expect(res.body.data.cart.total).toBe(0);
      expect(res.body.data.cart.itemCount).toBe(0);
    });

    it('returns the cart with populated items after products are added', async () => {
      // Add an item first
      await request(app)
        .post('/api/cart/items')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'))
        .send({ productId: fixtures.burger._id.toString(), quantity: 2 });

      const res = await request(app)
        .get('/api/cart')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'));
      expect(res.status).toBe(200);
      expect(res.body.data.cart.items.length).toBe(1);
      expect(res.body.data.cart.items[0].productId).toBe(fixtures.burger._id.toString());
      expect(res.body.data.cart.items[0].name).toBe('Beef Burger');
      expect(res.body.data.cart.items[0].price).toBe(fixtures.burger.price);
      expect(res.body.data.cart.items[0].quantity).toBe(2);
      expect(res.body.data.cart.items[0].subtotal).toBe(fixtures.burger.price * 2);
      expect(res.body.data.cart.subtotal).toBe(fixtures.burger.price * 2);
      expect(res.body.data.cart.itemCount).toBe(2);
    });

    it('rejects unauthenticated requests (401)', async () => {
      const res = await request(app).get('/api/cart');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('UNAUTHORIZED');
    });

    it('rejects non-customer roles (403)', async () => {
      const res = await request(app)
        .get('/api/cart')
        .set(authHeader(fixtures.waiter._id.toString(), 'waiter'));
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('FORBIDDEN');
    });
  });

  /* ====================================================================== */
  /* POST /api/cart/items                                                   */
  /* ====================================================================== */
  describe('POST /api/cart/items', () => {
    it('adds a new product to the cart and returns 201', async () => {
      const res = await request(app)
        .post('/api/cart/items')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'))
        .send({ productId: fixtures.burger._id.toString(), quantity: 2 });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.cart.items.length).toBe(1);
      expect(res.body.data.cart.items[0].productId).toBe(fixtures.burger._id.toString());
      expect(res.body.data.cart.items[0].quantity).toBe(2);
    });

    it('increments quantity when adding the same product twice (not a duplicate)', async () => {
      // First add: qty 2
      await request(app)
        .post('/api/cart/items')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'))
        .send({ productId: fixtures.burger._id.toString(), quantity: 2 });

      // Second add: qty 1 → should result in qty 3, not two items
      const res = await request(app)
        .post('/api/cart/items')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'))
        .send({ productId: fixtures.burger._id.toString(), quantity: 1 });
      expect(res.status).toBe(201);
      expect(res.body.data.cart.items.length).toBe(1);
      expect(res.body.data.cart.items[0].quantity).toBe(3);
    });

    it('rejects an invalid productId format (400 VALIDATION_ERROR)', async () => {
      const res = await request(app)
        .post('/api/cart/items')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'))
        .send({ productId: 'not-an-objectid', quantity: 1 });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });

    it('rejects a non-existent productId (404 PRODUCT_NOT_FOUND)', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await request(app)
        .post('/api/cart/items')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'))
        .send({ productId: fakeId, quantity: 1 });
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('PRODUCT_NOT_FOUND');
    });

    it('rejects an unavailable product (400 PRODUCT_UNAVAILABLE)', async () => {
      const res = await request(app)
        .post('/api/cart/items')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'))
        .send({ productId: fixtures.unavailable._id.toString(), quantity: 1 });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('PRODUCT_UNAVAILABLE');
    });

    it('rejects invalid quantity (0, negative, decimal, string)', async () => {
      for (const qty of [0, -1, 1.5, 'abc']) {
        const res = await request(app)
          .post('/api/cart/items')
          .set(authHeader(fixtures.customer._id.toString(), 'customer'))
          .send({ productId: fixtures.burger._id.toString(), quantity: qty });
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('VALIDATION_ERROR');
      }
    });

    it('rejects unauthenticated requests (401)', async () => {
      const res = await request(app)
        .post('/api/cart/items')
        .send({ productId: fixtures.burger._id.toString(), quantity: 1 });
      expect(res.status).toBe(401);
    });

    it('rejects non-customer roles (waiter → 403)', async () => {
      const res = await request(app)
        .post('/api/cart/items')
        .set(authHeader(fixtures.waiter._id.toString(), 'waiter'))
        .send({ productId: fixtures.burger._id.toString(), quantity: 1 });
      expect(res.status).toBe(403);
    });

    it('rejects non-customer roles (kitchen → 403)', async () => {
      const res = await request(app)
        .post('/api/cart/items')
        .set(authHeader(fixtures.kitchen._id.toString(), 'kitchen'))
        .send({ productId: fixtures.burger._id.toString(), quantity: 1 });
      expect(res.status).toBe(403);
    });
  });

  /* ====================================================================== */
  /* PATCH /api/cart/items/:productId                                       */
  /* ====================================================================== */
  describe('PATCH /api/cart/items/:productId', () => {
    it('updates the quantity of an existing cart item', async () => {
      // Add the item first
      await request(app)
        .post('/api/cart/items')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'))
        .send({ productId: fixtures.burger._id.toString(), quantity: 1 });

      const res = await request(app)
        .patch(`/api/cart/items/${fixtures.burger._id}`)
        .set(authHeader(fixtures.customer._id.toString(), 'customer'))
        .send({ quantity: 5 });
      expect(res.status).toBe(200);
      expect(res.body.data.cart.items[0].quantity).toBe(5);
      expect(res.body.data.cart.items[0].subtotal).toBe(fixtures.burger.price * 5);
    });

    it('rejects invalid quantity', async () => {
      await request(app)
        .post('/api/cart/items')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'))
        .send({ productId: fixtures.burger._id.toString(), quantity: 1 });

      for (const qty of [0, -1, 1.5, 'abc']) {
        const res = await request(app)
          .patch(`/api/cart/items/${fixtures.burger._id}`)
          .set(authHeader(fixtures.customer._id.toString(), 'customer'))
          .send({ quantity: qty });
        expect(res.status).toBe(400);
      }
    });

    it('returns 404 when the product is not in the cart (CART_ITEM_NOT_FOUND)', async () => {
      // Customer has a cart but the product is NOT in it
      const res = await request(app)
        .patch(`/api/cart/items/${fixtures.burger._id}`)
        .set(authHeader(fixtures.customer._id.toString(), 'customer'))
        .send({ quantity: 2 });
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('CART_ITEM_NOT_FOUND');
    });

    it('rejects unauthenticated requests (401)', async () => {
      const res = await request(app)
        .patch(`/api/cart/items/${fixtures.burger._id}`)
        .send({ quantity: 2 });
      expect(res.status).toBe(401);
    });
  });

  /* ====================================================================== */
  /* DELETE /api/cart/items/:productId                                      */
  /* ====================================================================== */
  describe('DELETE /api/cart/items/:productId', () => {
    it('removes an item from the cart', async () => {
      // Add two items
      await request(app)
        .post('/api/cart/items')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'))
        .send({ productId: fixtures.burger._id.toString(), quantity: 1 });
      await request(app)
        .post('/api/cart/items')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'))
        .send({ productId: fixtures.soup._id.toString(), quantity: 2 });

      // Remove the burger
      const res = await request(app)
        .delete(`/api/cart/items/${fixtures.burger._id}`)
        .set(authHeader(fixtures.customer._id.toString(), 'customer'));
      expect(res.status).toBe(200);
      expect(res.body.data.cart.items.length).toBe(1);
      expect(res.body.data.cart.items[0].productId).toBe(fixtures.soup._id.toString());
    });

    it('returns 404 when the product is not in the cart', async () => {
      const res = await request(app)
        .delete(`/api/cart/items/${fixtures.burger._id}`)
        .set(authHeader(fixtures.customer._id.toString(), 'customer'));
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('CART_ITEM_NOT_FOUND');
    });

    it('rejects unauthenticated requests (401)', async () => {
      const res = await request(app).delete(`/api/cart/items/${fixtures.burger._id}`);
      expect(res.status).toBe(401);
    });
  });

  /* ====================================================================== */
  /* DELETE /api/cart (clear cart)                                          */
  /* ====================================================================== */
  describe('DELETE /api/cart (clear)', () => {
    it('clears all items from the cart', async () => {
      // Add two items
      await request(app)
        .post('/api/cart/items')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'))
        .send({ productId: fixtures.burger._id.toString(), quantity: 1 });
      await request(app)
        .post('/api/cart/items')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'))
        .send({ productId: fixtures.soup._id.toString(), quantity: 2 });

      const res = await request(app)
        .delete('/api/cart')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'));
      expect(res.status).toBe(200);
      expect(res.body.data.cart.items).toEqual([]);
      expect(res.body.data.cart.subtotal).toBe(0);
      expect(res.body.data.cart.itemCount).toBe(0);
    });

    it('clearing an already-empty cart is idempotent (200)', async () => {
      const res = await request(app)
        .delete('/api/cart')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'));
      expect(res.status).toBe(200);
      expect(res.body.data.cart.items).toEqual([]);
    });

    it('rejects unauthenticated requests (401)', async () => {
      const res = await request(app).delete('/api/cart');
      expect(res.status).toBe(401);
    });
  });

  /* ====================================================================== */
  /* Cart isolation — one customer cannot touch another customer's cart    */
  /* ====================================================================== */
  describe('Cart isolation between customers', () => {
    it('customer A cannot see customer B\'s cart', async () => {
      // Create a second customer
      const { UserModel } = await import('../src/models/user.model');
      const { hashPassword } = await import('../src/utils/password');
      const { ROLES } = await import('../src/types');
      const customerB = await UserModel.create({
        name: 'Customer B',
        email: 'b@test.com',
        passwordHash: await hashPassword('Password123!'),
        role: ROLES.CUSTOMER,
      });

      // Customer A adds an item
      await request(app)
        .post('/api/cart/items')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'))
        .send({ productId: fixtures.burger._id.toString(), quantity: 2 });

      // Customer B should see an empty cart
      const res = await request(app)
        .get('/api/cart')
        .set(authHeader(customerB._id.toString(), 'customer'));
      expect(res.status).toBe(200);
      expect(res.body.data.cart.items).toEqual([]);
      expect(res.body.data.cart.itemCount).toBe(0);
    });

    it('customer A cannot update customer B\'s cart item', async () => {
      // Customer A adds an item
      await request(app)
        .post('/api/cart/items')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'))
        .send({ productId: fixtures.burger._id.toString(), quantity: 2 });

      // Customer B has no cart yet — PATCH should 404 (CART_NOT_FOUND)
      const { UserModel } = await import('../src/models/user.model');
      const { hashPassword } = await import('../src/utils/password');
      const { ROLES } = await import('../src/types');
      const customerB = await UserModel.create({
        name: 'Customer B',
        email: 'b@test.com',
        passwordHash: await hashPassword('Password123!'),
        role: ROLES.CUSTOMER,
      });

      const res = await request(app)
        .patch(`/api/cart/items/${fixtures.burger._id}`)
        .set(authHeader(customerB._id.toString(), 'customer'))
        .send({ quantity: 5 });
      expect(res.status).toBe(404);
    });
  });

  /* ====================================================================== */
  /* POST /api/orders — Cart → Checkout integration                        */
  /* ====================================================================== */
  describe('POST /api/orders — Cart → Checkout', () => {
    it('creates an order from the cart (no items in body) and clears the cart', async () => {
      // Populate the cart
      await request(app)
        .post('/api/cart/items')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'))
        .send({ productId: fixtures.burger._id.toString(), quantity: 2 });
      await request(app)
        .post('/api/cart/items')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'))
        .send({ productId: fixtures.soup._id.toString(), quantity: 1 });

      // Place order WITHOUT items in body — backend reads from cart
      const res = await request(app)
        .post('/api/orders')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'))
        .send({ orderType: 'TAKEAWAY' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items.length).toBe(2);

      // Backend computed snapshot — prices from MongoDB, NOT client
      const burgerItem = res.body.data.items.find(
        (i: { productId: string }) => i.productId === fixtures.burger._id.toString(),
      );
      expect(burgerItem.productName).toBe('Beef Burger');
      expect(burgerItem.unitPrice).toBe(fixtures.burger.price);
      expect(burgerItem.subtotal).toBe(fixtures.burger.price * 2);

      const soupItem = res.body.data.items.find(
        (i: { productId: string }) => i.productId === fixtures.soup._id.toString(),
      );
      expect(soupItem.subtotal).toBe(fixtures.soup.price * 1);

      // Totals
      const expectedSubtotal = fixtures.burger.price * 2 + fixtures.soup.price * 1;
      const expectedTax = round2(expectedSubtotal * env.TAX_RATE);
      const expectedTotal = round2(expectedSubtotal + expectedTax);
      expect(res.body.data.subtotal).toBe(expectedSubtotal);
      expect(res.body.data.tax).toBe(expectedTax);
      expect(res.body.data.total).toBe(expectedTotal);

      // CRITICAL: cart must be cleared after a successful order
      const cartRes = await request(app)
        .get('/api/cart')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'));
      expect(cartRes.body.data.cart.items).toEqual([]);
      expect(cartRes.body.data.cart.itemCount).toBe(0);
    });

    it('rejects order creation with an empty cart (400 EMPTY_CART)', async () => {
      // No items added to cart
      const res = await request(app)
        .post('/api/orders')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'))
        .send({ orderType: 'TAKEAWAY' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('EMPTY_CART');
    });

    it('does NOT clear the cart when order creation fails (e.g. unavailable product)', async () => {
      // Manually insert a cart with an unavailable product (bypassing the
      // add-to-cart endpoint, which would reject the unavailable product).
      await CartModel.create({
        customerId: fixtures.customer._id,
        items: [
          { productId: fixtures.unavailable._id, quantity: 1 },
          { productId: fixtures.burger._id, quantity: 2 },
        ],
      });

      // Attempt to place order → should fail with PRODUCT_UNAVAILABLE
      const res = await request(app)
        .post('/api/orders')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'))
        .send({ orderType: 'TAKEAWAY' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('PRODUCT_UNAVAILABLE');

      // Cart must still contain the items (NOT cleared)
      const cartRes = await request(app)
        .get('/api/cart')
        .set(authHeader(fixtures.customer._id.toString(), 'customer'));
      expect(cartRes.body.data.cart.items.length).toBe(2);
    });

    it('rejects when a customer sends `items` in the body (must use cart)', async () => {
      // Per the new business rule: customers MUST create orders from their
      // cart. Sending `items` in the body is rejected with VALIDATION_ERROR
      // by the strict `createCustomerOrderSchema` (which does not include
      // an `items` field).
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

    it('waiter can place an order with items in body (no cart required)', async () => {
      const res = await request(app)
        .post('/api/orders')
        .set(authHeader(fixtures.waiter._id.toString(), 'waiter'))
        .send({
          orderType: 'TAKEAWAY',
          items: [{ productId: fixtures.burger._id.toString(), quantity: 1 }],
        });
      expect(res.status).toBe(201);
      expect(res.body.data.items.length).toBe(1);
    });

    it('waiter cannot place an order without items in body (400 VALIDATION_ERROR)', async () => {
      const res = await request(app)
        .post('/api/orders')
        .set(authHeader(fixtures.waiter._id.toString(), 'waiter'))
        .send({ orderType: 'TAKEAWAY' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });
  });
});
