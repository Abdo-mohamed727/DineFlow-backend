/**
 * Generates the Postman collection JSON for DineFlow.
 * Run: node scripts/generate-postman.js
 */
const fs = require('fs');
const path = require('path');

const baseUrl = '{{baseUrl}}';

function item(name, method, url, body, scripts, headers) {
  const req = {
    method,
    header: [
      { key: 'Content-Type', value: body && body.mode === 'formdata' ? 'multipart/form-data' : 'application/json' },
      ...(headers || []),
    ],
    url: { raw: `${baseUrl}${url}`, host: [baseUrl], path: url.split('/').filter(Boolean) },
  };
  if (body) req.body = body;
  const ev = {};
  if (scripts && scripts.test) ev.test = scripts.test;
  return {
    name,
    request: req,
    event: scripts ? [ev] : undefined,
  };
}

function jsonBody(obj) {
  return { mode: 'raw', raw: JSON.stringify(obj, null, 2) };
}

function formData(fields) {
  return {
    mode: 'formdata',
    formdata: fields.map((f) => ({
      key: f.key,
      value: f.value,
      type: f.type || 'text',
      src: f.src,
    })),
  };
}

const loginCustomerScript = `
const json = pm.response.json();
if (json.data && json.data.token) {
  pm.collectionVariables.set('customerToken', json.data.token);
  pm.collectionVariables.set('customerId', json.data.user.id);
  console.log('Saved customerToken');
}
`;

const loginWaiterScript = `
const json = pm.response.json();
if (json.data && json.data.token) {
  pm.collectionVariables.set('waiterToken', json.data.token);
  pm.collectionVariables.set('waiterId', json.data.user.id);
  console.log('Saved waiterToken');
}
`;

const loginKitchenScript = `
const json = pm.response.json();
if (json.data && json.data.token) {
  pm.collectionVariables.set('kitchenToken', json.data.token);
  pm.collectionVariables.set('kitchenId', json.data.user.id);
  console.log('Saved kitchenToken');
}
`;

const authHeader = (tokenVar) => [{ key: 'Authorization', value: `Bearer {{${tokenVar}}}` }];

const collection = {
  info: {
    name: 'DineFlow API',
    _postman_id: 'dineflow-' + Date.now(),
    description: 'Complete Postman collection for the DineFlow restaurant ordering backend.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  variable: [
    { key: 'baseUrl', value: 'http://localhost:3000', type: 'string' },
    { key: 'customerToken', value: '', type: 'string' },
    { key: 'waiterToken', value: '', type: 'string' },
    { key: 'kitchenToken', value: '', type: 'string' },
    { key: 'customerId', value: '', type: 'string' },
    { key: 'waiterId', value: '', type: 'string' },
    { key: 'kitchenId', value: '', type: 'string' },
    { key: 'categoryId', value: '', type: 'string' },
    { key: 'productId', value: '', type: 'string' },
    { key: 'tableId', value: '', type: 'string' },
    { key: 'diningSessionId', value: '', type: 'string' },
    { key: 'orderId', value: '', type: 'string' },
    { key: 'waiterRequestId', value: '', type: 'string' },
    { key: 'billId', value: '', type: 'string' },
  ],
  item: [
    // ===== AUTH =====
    {
      name: 'Auth',
      item: [
        item('Register (Customer)', 'POST', '/api/auth/register', jsonBody({
          name: 'John Customer',
          email: 'customer@dev.com',
          password: 'Password123!',
          phone: '+201000000001',
        }), { test: loginCustomerScript }),
        item('Login as Customer', 'POST', '/api/auth/login', jsonBody({
          email: 'customer@dev.com',
          password: 'Password123!',
        }), { test: loginCustomerScript }),
        item('Login as Waiter', 'POST', '/api/auth/login', jsonBody({
          email: 'waiter@dev.com',
          password: 'Password123!',
        }), { test: loginWaiterScript }),
        item('Login as Kitchen', 'POST', '/api/auth/login', jsonBody({
          email: 'kitchen@dev.com',
          password: 'Password123!',
        }), { test: loginKitchenScript }),
        item('Get Me', 'GET', '/api/auth/me', null, null, authHeader('customerToken')),
      ],
    },

    // ===== USERS =====
    {
      name: 'Users',
      item: [
        item('Get My Profile', 'GET', '/api/users/me', null, null, authHeader('customerToken')),
        item('Update My Profile', 'PATCH', '/api/users/me', jsonBody({
          name: 'John Customer Updated',
          phone: '+201000000009',
        }), null, authHeader('customerToken')),
        item('Upload Profile Image', 'PATCH', '/api/users/me/profile-image',
          formData([
            { key: 'image', type: 'file', src: [] },
          ]),
          null, authHeader('customerToken')),
      ],
    },

    // ===== CATEGORIES =====
    {
      name: 'Categories',
      item: [
        item('List Categories', 'GET', '/api/categories', null, null, authHeader('customerToken')),
        item('Get Category by ID', 'GET', '/api/categories/{{categoryId}}', null, null, authHeader('customerToken')),
        item('Create Category (multipart)', 'POST', '/api/categories',
          formData([
            { key: 'name', value: 'Starters' },
            { key: 'description', value: 'Small plates to begin your meal' },
            { key: 'isActive', value: 'true' },
            { key: 'image', type: 'file', src: [] },
          ]),
          { test: `
const json = pm.response.json();
if (json.data && json.data.category && json.data.category.id) {
  pm.collectionVariables.set('categoryId', json.data.category.id);
}
` }, authHeader('kitchenToken')),
        item('Update Category (multipart)', 'PATCH', '/api/categories/{{categoryId}}',
          formData([
            { key: 'name', value: 'Appetizers' },
            { key: 'description', value: 'Updated description' },
            { key: 'image', type: 'file', src: [] },
          ]),
          null, authHeader('kitchenToken')),
        item('Delete Category', 'DELETE', '/api/categories/{{categoryId}}', null, null, authHeader('kitchenToken')),
      ],
    },

    // ===== PRODUCTS =====
    {
      name: 'Products',
      item: [
        item('List Products', 'GET', '/api/products', null, null, authHeader('customerToken')),
        item('Filter by Category', 'GET', '/api/products?categoryId={{categoryId}}', null, null, authHeader('customerToken')),
        item('Search Products', 'GET', '/api/products?search=burger', null, null, authHeader('customerToken')),
        item('Filter Available Only', 'GET', '/api/products?isAvailable=true', null, null, authHeader('customerToken')),
        item('Get Product by ID', 'GET', '/api/products/{{productId}}', null, null, authHeader('customerToken')),
        item('Create Product (multipart)', 'POST', '/api/products',
          formData([
            { key: 'name', value: 'Classic Beef Burger' },
            { key: 'description', value: '180g beef patty, cheddar, fries' },
            { key: 'price', value: '220' },
            { key: 'categoryId', value: '{{categoryId}}' },
            { key: 'isAvailable', value: 'true' },
            { key: 'image', type: 'file', src: [] },
          ]),
          { test: `
const json = pm.response.json();
if (json.data && json.data.product && json.data.product.id) {
  pm.collectionVariables.set('productId', json.data.product.id);
}
` }, authHeader('kitchenToken')),
        item('Update Product (multipart)', 'PATCH', '/api/products/{{productId}}',
          formData([
            { key: 'price', value: '230' },
            { key: 'isAvailable', value: 'true' },
          ]),
          null, authHeader('kitchenToken')),
        item('Delete Product', 'DELETE', '/api/products/{{productId}}', null, null, authHeader('kitchenToken')),
      ],
    },

    // ===== TABLES =====
    {
      name: 'Tables',
      item: [
        item('List Tables', 'GET', '/api/tables', null, null, authHeader('customerToken')),
        item('List Available Tables', 'GET', '/api/tables?status=available', null, null, authHeader('customerToken')),
        item('Get Table by ID', 'GET', '/api/tables/{{tableId}}', null, null, authHeader('customerToken')),
        item('Create Table', 'POST', '/api/tables', jsonBody({
          tableNumber: 11,
          capacity: 4,
          status: 'available',
          location: 'Patio',
        }), { test: `
const json = pm.response.json();
if (json.data && json.data.table && json.data.table.id) {
  pm.collectionVariables.set('tableId', json.data.table.id);
}
` }, authHeader('waiterToken')),
        item('Update Table Status', 'PATCH', '/api/tables/{{tableId}}', jsonBody({
          status: 'reserved',
        }), null, authHeader('waiterToken')),
        item('Delete Table', 'DELETE', '/api/tables/{{tableId}}', null, null, authHeader('waiterToken')),
      ],
    },

    // ===== DINING SESSIONS =====
    {
      name: 'Dining Sessions',
      item: [
        item('Start Dining Session', 'POST', '/api/dining-sessions', jsonBody({
          tableId: '{{tableId}}',
          guestCount: 2,
          notes: 'Window seat please',
        }), { test: `
const json = pm.response.json();
if (json.data && json.data.session && json.data.session.id) {
  pm.collectionVariables.set('diningSessionId', json.data.session.id);
}
` }, authHeader('customerToken')),
        item('List Active Sessions', 'GET', '/api/dining-sessions', null, null, authHeader('waiterToken')),
        item('Get Dining Session', 'GET', '/api/dining-sessions/{{diningSessionId}}', null, null, authHeader('customerToken')),
        item('Close Dining Session', 'POST', '/api/dining-sessions/{{diningSessionId}}/close', null, null, authHeader('waiterToken')),
      ],
    },

    // ===== ORDERS =====
    {
      name: 'Orders',
      item: [
        item('Create DINE_IN Order (Cart → Checkout)', 'POST', '/api/orders', jsonBody({
          orderType: 'DINE_IN',
          diningSessionId: '{{diningSessionId}}',
          items: [
            { productId: '{{productId}}', quantity: 2 },
          ],
          notes: 'No onions',
        }), { test: `
const json = pm.response.json();
if (json.data && json.data.orderId) {
  pm.collectionVariables.set('orderId', json.data.orderId);
}
` }, authHeader('customerToken')),
        item('Create TAKEAWAY Order (Cart → Checkout)', 'POST', '/api/orders', jsonBody({
          orderType: 'TAKEAWAY',
          items: [
            { productId: '{{productId}}', quantity: 2 },
          ],
        }), null, authHeader('customerToken')),
        item('List Orders (Customer - own)', 'GET', '/api/orders', null, null, authHeader('customerToken')),
        item('List Orders (Waiter - all)', 'GET', '/api/orders', null, null, authHeader('waiterToken')),
        item('List Orders - filter by status', 'GET', '/api/orders?status=pending', null, null, authHeader('waiterToken')),
        item('Get Order by ID', 'GET', '/api/orders/{{orderId}}', null, null, authHeader('customerToken')),
        item('Customer Cancels Order', 'PATCH', '/api/orders/{{orderId}}/cancel', null, null, authHeader('customerToken')),
        item('Kitchen - Confirm Order', 'PATCH', '/api/orders/{{orderId}}/status', jsonBody({
          status: 'confirmed',
        }), null, authHeader('kitchenToken')),
        item('Kitchen - Start Preparing', 'PATCH', '/api/orders/{{orderId}}/status', jsonBody({
          status: 'preparing',
        }), null, authHeader('kitchenToken')),
        item('Kitchen - Mark Ready', 'PATCH', '/api/orders/{{orderId}}/status', jsonBody({
          status: 'ready',
        }), null, authHeader('kitchenToken')),
        item('Waiter - Mark Served', 'PATCH', '/api/orders/{{orderId}}/status', jsonBody({
          status: 'served',
        }), null, authHeader('waiterToken')),
        item('Waiter - Mark Completed', 'PATCH', '/api/orders/{{orderId}}/status', jsonBody({
          status: 'completed',
        }), null, authHeader('waiterToken')),
      ],
    },

    // ===== NOTIFICATIONS =====
    {
      name: 'Notifications',
      item: [
        item('List My Notifications', 'GET', '/api/notifications', null, null, authHeader('customerToken')),
        item('List Unread Notifications', 'GET', '/api/notifications?isRead=false', null, null, authHeader('customerToken')),
        item('Mark Notification as Read', 'PATCH', '/api/notifications/{{notificationId}}/read', null, null, authHeader('customerToken')),
        item('Mark All as Read', 'PATCH', '/api/notifications/read-all', null, null, authHeader('customerToken')),
      ],
    },

    // ===== WAITER REQUESTS =====
    {
      name: 'Waiter Requests',
      item: [
        item('Customer - Call Waiter', 'POST', '/api/waiter-requests', jsonBody({
          type: 'CALL_WAITER',
          diningSessionId: '{{diningSessionId}}',
          message: 'Need water please',
        }), { test: `
const json = pm.response.json();
if (json.data && json.data.request && json.data.request.id) {
  pm.collectionVariables.set('waiterRequestId', json.data.request.id);
}
` }, authHeader('customerToken')),
        item('Customer - Request Bill', 'POST', '/api/waiter-requests', jsonBody({
          type: 'REQUEST_BILL',
          diningSessionId: '{{diningSessionId}}',
        }), null, authHeader('customerToken')),
        item('Waiter - List Pending Requests', 'GET', '/api/waiter-requests?status=pending', null, null, authHeader('waiterToken')),
        item('Waiter - Accept Request', 'PATCH', '/api/waiter-requests/{{waiterRequestId}}/status', jsonBody({
          status: 'accepted',
        }), null, authHeader('waiterToken')),
        item('Waiter - Complete Request', 'PATCH', '/api/waiter-requests/{{waiterRequestId}}/status', jsonBody({
          status: 'completed',
        }), null, authHeader('waiterToken')),
      ],
    },

    // ===== BILLS =====
    {
      name: 'Bills',
      item: [
        item('Get Bill for Dining Session', 'GET', '/api/bills/dining-sessions/{{diningSessionId}}', null, { test: `
const json = pm.response.json();
if (json.data && json.data.bill && json.data.bill.id) {
  pm.collectionVariables.set('billId', json.data.bill.id);
}
` }, authHeader('waiterToken')),
        item('Get Bill by ID', 'GET', '/api/bills/{{billId}}', null, null, authHeader('waiterToken')),
        item('Mark Bill as Paid', 'PATCH', '/api/bills/{{billId}}/pay', null, null, authHeader('waiterToken')),
      ],
    },
  ],
};

const outPath = path.join(__dirname, '..', 'postman', 'DineFlow.postman_collection.json');
fs.writeFileSync(outPath, JSON.stringify(collection, null, 2));
console.log('Wrote Postman collection to', outPath);
