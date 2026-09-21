# DineFlow API Reference

Base URL: `http://localhost:3000/api`

## Standard response envelope

### Success

```json
{
  "success": true,
  "message": "Products retrieved successfully",
  "data": { ... }
}
```

### Error

```json
{
  "success": false,
  "message": "Product not found",
  "error": "PRODUCT_NOT_FOUND",
  "details": { ... }   // optional, present on validation errors
}
```

## HTTP status codes

| Code | Meaning                  |
|------|--------------------------|
| 200  | OK                       |
| 201  | Created                  |
| 400  | Bad Request              |
| 401  | Unauthorized             |
| 403  | Forbidden                |
| 404  | Not Found                |
| 409  | Conflict                 |
| 422  | Unprocessable Entity     |
| 500  | Internal Server Error    |

## Authentication

Send a JWT as:

```
Authorization: Bearer <token>
```

JWT is returned by `POST /api/auth/register` and `POST /api/auth/login`.

---

## Auth

### POST /api/auth/register

**Auth**: none
**Role**: n/a (always creates a `customer`)

```json
{
  "name": "John Customer",
  "email": "john@example.com",
  "password": "Password123!",
  "phone": "+201000000001"
}
```

Response (201):

```json
{
  "success": true,
  "message": "Customer registered successfully",
  "data": {
    "user": { "id": "...", "name": "...", "email": "...", "role": "customer" },
    "token": "eyJhbGciOi..."
  }
}
```

Errors: `400 VALIDATION_ERROR`, `409 DUPLICATE_EMAIL`

### POST /api/auth/login

**Auth**: none
**Role**: n/a

```json
{ "email": "john@example.com", "password": "Password123!" }
```

Response (200): same shape as register.

Errors: `401 INVALID_CREDENTIALS`, `400 VALIDATION_ERROR`

### GET /api/auth/me

**Auth**: required (any role)

Response (200):

```json
{
  "success": true,
  "message": "User retrieved successfully",
  "data": { "user": { "id": "...", "name": "...", "email": "...", "role": "customer", "phone": "...", "profileImage": "" } }
}
```

Errors: `401 UNAUTHORIZED`

---

## Users

### GET /api/users/me

**Auth**: required
**Role**: any

Returns the authenticated user's profile.

### PATCH /api/users/me

**Auth**: required
**Role**: any

```json
{ "name": "John Updated", "phone": "+201000000009" }
```

At least one field must be provided. `email` and `role` cannot be changed here.

Errors: `400 VALIDATION_ERROR`

### PATCH /api/users/me/profile-image

**Auth**: required
**Role**: any
**Content-Type**: `multipart/form-data`

Form fields:

| Field | Type   | Required |
|-------|--------|----------|
| image | file   | yes      |

Allowed MIME types: `image/jpeg`, `image/png`, `image/webp`. Max size 5 MB (configurable via `MAX_UPLOAD_MB`).

Response (200):

```json
{
  "success": true,
  "message": "Profile image updated successfully",
  "data": { "user": { ..., "profileImage": "https://res.cloudinary.com/...", "profileImagePublicId": "dineflow/profiles/..." } }
}
```

Errors: `400 INVALID_FILE` (wrong type / too large)

---

## Categories

### GET /api/categories

**Auth**: required
**Role**: any

Returns array of all categories (active and inactive).

### GET /api/categories/:id

**Auth**: required
**Role**: any

Errors: `404 CATEGORY_NOT_FOUND`, `400 INVALID_OBJECT_ID`

### POST /api/categories

**Auth**: required
**Role**: `waiter` or `kitchen`
**Content-Type**: `multipart/form-data`

Form fields:

| Field        | Type    | Required |
|--------------|---------|----------|
| name         | string  | yes      |
| description  | string  | no       |
| isActive     | boolean | no       |
| image        | file    | no       |

Response (201):

```json
{
  "success": true,
  "message": "Category created successfully",
  "data": { "category": { "id": "...", "name": "...", "imageUrl": "https://..." } }
}
```

### PATCH /api/categories/:id

Same fields as POST. Multipart supported. The old Cloudinary asset is deleted when a new image is uploaded.

### DELETE /api/categories/:id

**Auth**: required
**Role**: `waiter` or `kitchen`

Errors: `409 VALIDATION_ERROR` if the category still has products attached.

---

## Products

### GET /api/products

**Auth**: required
**Role**: any

Query parameters:

| Param        | Type    | Description                       |
|--------------|---------|-----------------------------------|
| categoryId   | string  | filter by category                |
| search       | string  | case-insensitive name search      |
| isAvailable  | boolean | `"true"` / `"false"`              |
| page         | number  | default 1                         |
| limit        | number  | default 50, max 100               |

Response:

```json
{
  "success": true,
  "message": "Products retrieved successfully",
  "data": {
    "items": [ { "id": "...", "name": "...", "price": 150, "categoryId": {...}, "isAvailable": true, "image": "" } ],
    "total": 25,
    "page": 1,
    "limit": 50,
    "totalPages": 1
  }
}
```

### GET /api/products/:id

Returns a single product populated with its category.

Errors: `404 PRODUCT_NOT_FOUND`, `400 INVALID_OBJECT_ID`

### POST /api/products

**Auth**: required
**Role**: `waiter` or `kitchen`
**Content-Type**: `multipart/form-data`

Form fields:

| Field        | Type    | Required |
|--------------|---------|----------|
| name         | string  | yes      |
| description  | string  | no       |
| price        | number  | yes (>= 0) |
| categoryId   | string  | yes      |
| isAvailable  | boolean | no       |
| image        | file    | no       |

### PATCH /api/products/:id

Same fields as POST (all optional). Multipart supported.

### DELETE /api/products/:id

Also deletes the Cloudinary asset if one exists.

---

## Tables

### GET /api/tables

**Auth**: required
**Role**: any

Query: `?status=available|occupied|reserved`

### GET /api/tables/:id

Errors: `404 TABLE_NOT_FOUND`

### POST /api/tables

**Auth**: required
**Role**: `waiter`

```json
{ "tableNumber": 11, "capacity": 4, "status": "available", "location": "Patio" }
```

### PATCH /api/tables/:id

```json
{ "status": "reserved" }
```

### DELETE /api/tables/:id

---

## Dining Sessions

### POST /api/dining-sessions

**Auth**: required
**Role**: `customer` or `waiter`

```json
{ "tableId": "<tableObjectId>", "guestCount": 2, "notes": "Window seat please" }
```

Response (201):

```json
{
  "success": true,
  "message": "Dining session started successfully",
  "data": {
    "session": {
      "id": "...",
      "tableId": { "id": "...", "tableNumber": 5, "capacity": 4, "status": "occupied" },
      "startedBy": { "id": "...", "name": "John" },
      "status": "active",
      "startedAt": "2026-09-16T...",
      "guestCount": 2
    }
  }
}
```

Errors: `409 TABLE_NOT_AVAILABLE` (table occupied or already has active session)

### GET /api/dining-sessions

**Auth**: required
**Role**: `waiter`

Returns active sessions.

### GET /api/dining-sessions/:id

**Auth**: required
**Role**: any authenticated user

### POST /api/dining-sessions/:id/close

**Auth**: required
**Role**: `waiter`

Closes the session and frees the table (status → `available`).

Errors: `409 SESSION_CLOSED`

---

## Cart

Cart endpoints are **customer-only**. The authenticated customer id is always taken from the JWT (`req.user.id`) — never from the request body. Each customer has exactly one cart (enforced by a unique index on `customerId`).

The cart stores only `{ productId, quantity }`. Product price, name, image, and availability are read live from MongoDB on every request so the customer always sees current catalog data. Prices are never cached in the cart — they are snapshotted into the Order at checkout time.

### GET /api/cart

**Auth**: required
**Role**: `customer`

Returns the authenticated customer's cart. If the customer has no cart yet, returns an empty-cart shape (does NOT throw).

Response (200):

```json
{
  "success": true,
  "message": "Cart retrieved successfully",
  "data": {
    "cart": {
      "id": "65f2c4a8b3e1c8a12b7d0f99",
      "items": [
        {
          "productId": "65f2c4a8b3e1c8a12b7d0f10",
          "name": "Classic Beef Burger",
          "price": 220,
          "image": "https://res.cloudinary.com/...",
          "isAvailable": true,
          "quantity": 2,
          "subtotal": 440
        }
      ],
      "subtotal": 440,
      "taxRate": 0.14,
      "tax": 61.6,
      "total": 501.6,
      "itemCount": 2
    }
  }
}
```

For a new customer with no cart:

```json
{
  "success": true,
  "message": "Cart retrieved successfully",
  "data": {
    "cart": {
      "id": null,
      "items": [],
      "subtotal": 0,
      "taxRate": 0,
      "tax": 0,
      "total": 0,
      "itemCount": 0
    }
  }
}
```

### POST /api/cart/items

**Auth**: required
**Role**: `customer`

Adds a product to the cart. If the product is already in the cart, increments its quantity (does NOT create a duplicate item).

Request:

```json
{
  "productId": "65f2c4a8b3e1c8a12b7d0f10",
  "quantity": 2
}
```

The backend:
1. Validates `productId` is a valid ObjectId.
2. Validates `quantity` is an integer >= 1 (and <= 100).
3. Verifies the product exists (`404 PRODUCT_NOT_FOUND` if not).
4. Verifies the product `isAvailable === true` (`400 PRODUCT_UNAVAILABLE` if not).
5. Creates the cart document if the customer doesn't have one yet.
6. Adds the product, or increments its quantity if already in the cart.
7. Returns the refreshed cart (with live product info + computed totals).

The client must NOT send `unitPrice`, `price`, or `subtotal` — the schema is `.strict()`.

Response (201): same shape as GET /api/cart, with the updated cart.

Errors: `400 VALIDATION_ERROR`, `400 PRODUCT_UNAVAILABLE`, `404 PRODUCT_NOT_FOUND`, `401 UNAUTHORIZED`, `403 FORBIDDEN`

### PATCH /api/cart/items/:productId

**Auth**: required
**Role**: `customer`

Replaces the quantity of an existing cart item.

Request:

```json
{
  "quantity": 3
}
```

Response (200): the updated cart.

Errors: `400 VALIDATION_ERROR` (invalid quantity), `404 CART_ITEM_NOT_FOUND` (product not in cart), `401 UNAUTHORIZED`, `403 FORBIDDEN`

### DELETE /api/cart/items/:productId

**Auth**: required
**Role**: `customer`

Removes a product from the cart.

Response (200): the updated cart.

Errors: `404 CART_ITEM_NOT_FOUND` (product not in cart), `401 UNAUTHORIZED`, `403 FORBIDDEN`

### DELETE /api/cart

**Auth**: required
**Role**: `customer`

Clears all items from the cart. Idempotent — clearing an already-empty cart returns 200 with an empty cart.

Response (200): the empty cart.

---

## Orders

### POST /api/orders

**Auth**: required
**Role**: `customer` or `waiter`

> See also: [`docs/cart-checkout-flow.md`](./cart-checkout-flow.md) for the full Flutter cart → checkout contract.

**Role-based request shapes — STRICT business rule:**

| Role | Request shape | Source of items |
|---|---|---|
| **Customer** | `{ orderType, diningSessionId?, notes? }` — NO `items` field allowed | Server-side Cart |
| **Waiter** | `{ orderType, diningSessionId?, items: [...], notes? }` — `items` REQUIRED | Request body |

#### Customer flow — cart-driven checkout (recommended for Flutter)

The customer does NOT send `items` in the request body. The schema is `.strict()`, so any `items` field is rejected with `400 VALIDATION_ERROR`. The backend reads the authenticated customer's cart, validates it is non-empty, snapshots the current catalog prices, creates the order, and **clears the cart automatically after the order is successfully created**.

```json
{
  "orderType": "TAKEAWAY"
}
```

For DINE_IN:

```json
{
  "orderType": "DINE_IN",
  "diningSessionId": "<sessionObjectId>",
  "notes": "No onions"
}
```

If the cart is empty, the backend returns `400 EMPTY_CART`. The cart is NOT cleared when order creation fails (validation error, unavailable product, closed session, etc.) — the customer can retry without re-adding items.

> A customer sending `items` in the body is ALWAYS rejected with `400 VALIDATION_ERROR`. Customers must use `/api/cart/*` to manage their cart.

#### Waiter flow — items-in-body

Waiters do not have a cart. They MUST send `items` in the body directly:

```json
{
  "orderType": "DINE_IN",
  "diningSessionId": "<sessionObjectId>",
  "items": [
    { "productId": "<productObjectId>", "quantity": 2 }
  ],
  "notes": "No onions"
}
```

For `TAKEAWAY`, omit `diningSessionId`:

```json
{
  "orderType": "TAKEAWAY",
  "items": [
    { "productId": "<productObjectId>", "quantity": 2 }
  ]
}
```

A waiter sending a request without `items` is rejected with `400 VALIDATION_ERROR`. The cart is NEVER touched for waiter-placed orders.

The client must NOT send `unitPrice`, `subtotal`, `tax`, or `total` — both schemas are `.strict()` and will reject them. The backend is the single source of truth for all money fields.

The backend:
1. Extracts the authenticated customer from the JWT.
2. Picks the validator by role: `createCustomerOrderSchema` (no `items` allowed) for customer, `createWaiterOrderSchema` (`items` required) for waiter.
3. Resolves the items: from the cart (customer) or from the body (waiter).
4. Validates the request shape with Zod (valid ObjectIds, quantity >= 1, etc.).
5. Fetches all requested products by `productId` from MongoDB in one round-trip.
6. Verifies every product exists (`404 PRODUCT_NOT_FOUND` if not).
7. Verifies every product `isAvailable === true` (`400 PRODUCT_UNAVAILABLE` if not).
8. Reads the current `price` from MongoDB (never from the client).
9. Snapshots `{ productId, productName, quantity, unitPrice, subtotal }` into each order item — so historical orders don't drift when the catalog changes.
10. Computes `subtotal`, `tax` (= subtotal × `TAX_RATE`), and `total`.
11. For `DINE_IN`: validates `diningSessionId` exists and `status === 'active'` (`400 SESSION_CLOSED` / `404 DINING_SESSION_NOT_FOUND`).
12. Persists the order with `status: pending` and a sequential `orderNumber: ORD-NNNNNN`.
13. Creates a notification for the customer ("Order received…").
14. **If items came from the cart (customer), clears the cart.** Best-effort: if cart clearing fails, the order is still persisted (logged as a warning).
15. Returns 201 with the order plus convenience top-level fields.

Response (201):

```json
{
  "success": true,
  "message": "Order created successfully",
  "data": {
    "order": {
      "id": "65f2c4a8b3e1c8a12b7d0f99",
      "orderNumber": "ORD-000001",
      "customerId": { "id": "...", "name": "John", "email": "...", "phone": "..." },
      "tableId": { "id": "...", "tableNumber": 5, "capacity": 4 },
      "diningSessionId": { "id": "...", "tableId": "...", "status": "active" },
      "type": "DINE_IN",
      "items": [
        { "productId": "...", "productName": "Beef Burger", "quantity": 2, "unitPrice": 220, "subtotal": 440 }
      ],
      "status": "pending",
      "subtotal": 440,
      "tax": 61.6,
      "total": 501.6,
      "notes": "No onions",
      "createdAt": "2026-09-17T10:30:00.000Z",
      "updatedAt": "2026-09-17T10:30:00.000Z"
    },
    "orderId": "65f2c4a8b3e1c8a12b7d0f99",
    "orderType": "DINE_IN",
    "items": [
      { "productId": "...", "productName": "Beef Burger", "quantity": 2, "unitPrice": 220, "subtotal": 440 }
    ],
    "subtotal": 440,
    "tax": 61.6,
    "total": 501.6,
    "status": "pending",
    "createdAt": "2026-09-17T10:30:00.000Z"
  }
}
```

Errors:

| Status | `error`                       | When                                              |
|--------|-------------------------------|---------------------------------------------------|
| 400    | `VALIDATION_ERROR`            | Bad shape / invalid quantity / extra fields       |
| 400    | `EMPTY_CART`                  | Customer omits `items` but their cart is empty    |
| 400    | `PRODUCT_UNAVAILABLE`         | One of the products has `isAvailable = false`    |
| 400    | `SESSION_CLOSED`              | DINE_IN against a closed dining session           |
| 401    | `UNAUTHORIZED`                | Missing / invalid / expired JWT                    |
| 403    | `FORBIDDEN`                   | Authenticated but role not allowed                |
| 404    | `PRODUCT_NOT_FOUND`           | A productId doesn't exist                         |
| 404    | `DINING_SESSION_NOT_FOUND`    | DINE_IN with a non-existing diningSessionId       |

> In every error case **no order is persisted and the cart is NOT cleared** — the customer can safely retry. Only call `clearCart()` after receiving a `201`.

### GET /api/orders

**Auth**: required
**Role**: any

Query parameters:

| Param            | Type   | Notes                                |
|------------------|--------|--------------------------------------|
| status           | enum   | pending, confirmed, preparing, ready, served, completed, cancelled |
| type             | enum   | DINE_IN, TAKEAWAY                    |
| customerId       | string | (staff only — customers always scoped to self) |
| diningSessionId  | string |                                      |
| page             | number | default 1                            |
| limit            | number | default 50, max 100                  |

Customers always see only their own orders regardless of filters.

### GET /api/orders/:id

Returns a single order with customer, table, and dining session populated.

### PATCH /api/orders/:id/cancel

**Auth**: required
**Role**: `customer`

Cancels the customer's own order, but **only if** the order is in `pending` or `confirmed` state. Once preparation starts, the customer can no longer cancel.

Errors: `403 FORBIDDEN` (not their order), `400 ORDER_NOT_CANCELLABLE`

### PATCH /api/orders/:id/status

**Auth**: required
**Role**: `kitchen` (drives confirmed → preparing → ready) or `waiter` (drives ready → served → completed)

```json
{ "status": "confirmed" }
```

Allowed transitions:

| From        | To          | Driven by |
|-------------|-------------|-----------|
| pending     | confirmed   | kitchen   |
| pending     | cancelled   | customer (via /cancel) |
| confirmed   | preparing   | kitchen   |
| confirmed   | cancelled   | customer (via /cancel) |
| preparing   | ready       | kitchen   |
| ready       | served      | waiter    |
| served      | completed   | waiter    |

Any other transition returns `400 INVALID_STATUS_TRANSITION`. Wrong role returns `403 FORBIDDEN`.

The customer who owns the order automatically receives a notification when the status changes.

---

## Notifications

### GET /api/notifications

**Auth**: required
**Role**: any (sees only their own)

Query: `?isRead=true|false&page=1&limit=50`

Response:

```json
{
  "success": true,
  "message": "Notifications retrieved successfully",
  "data": {
    "items": [ { "id": "...", "title": "...", "message": "...", "type": "ORDER_UPDATE", "isRead": false, "data": { "orderId": "..." } } ],
    "total": 12,
    "unreadCount": 3,
    "page": 1,
    "limit": 50,
    "totalPages": 1
  }
}
```

### PATCH /api/notifications/:id/read

Marks one notification as read. Users can only mark their own notifications.

Errors: `403 FORBIDDEN`, `404 NOTIFICATION_NOT_FOUND`

### PATCH /api/notifications/read-all

Marks all of the user's notifications as read. Returns `{ modifiedCount }`.

---

## Waiter Requests

### POST /api/waiter-requests

**Auth**: required
**Role**: `customer`

```json
{
  "type": "CALL_WAITER",
  "diningSessionId": "<sessionObjectId>",
  "message": "Need water please"
}
```

Types: `CALL_WAITER`, `REQUEST_BILL`, `REQUEST_HELP`.

If `diningSessionId` is provided, `tableId` is automatically resolved from the session. The session must be `active`.

Response (201):

```json
{
  "success": true,
  "message": "Waiter request created successfully",
  "data": { "request": { "id": "...", "status": "pending", "type": "CALL_WAITER", ... } }
}
```

### GET /api/waiter-requests

**Auth**: required
**Role**: `customer` (own only) or `waiter` (all)

Query: `?status=pending|accepted|completed|cancelled&type=CALL_WAITER|REQUEST_BILL|REQUEST_HELP&page=1&limit=50`

### GET /api/waiter-requests/:id

Returns one waiter request.

### PATCH /api/waiter-requests/:id/status

**Auth**: required
**Role**: `waiter`

```json
{ "status": "accepted" }
```

Allowed transitions: `pending → accepted → completed` (or `cancelled`).

When a request is updated, the customer who created it receives a notification.

Errors: `409 INVALID_STATUS_TRANSITION`

---

## Bills

### GET /api/bills/dining-sessions/:id

**Auth**: required
**Role**: `waiter` or `kitchen`

Generates (or returns existing) bill for the dining session. The bill is computed from underlying non-cancelled orders — **the backend is the source of truth for totals**.

Response (200):

```json
{
  "success": true,
  "message": "Bill generated successfully",
  "data": {
    "bill": {
      "id": "...",
      "billNumber": "BILL-000001",
      "diningSessionId": { "id": "...", "tableId": {...}, "status": "active", "startedAt": "..." },
      "tableId": { "id": "...", "tableNumber": 5 },
      "orders": [
        { "orderId": "...", "orderNumber": "ORD-000001", "total": 501.6 }
      ],
      "subtotal": 440,
      "tax": 61.6,
      "total": 501.6,
      "status": "open",
      "createdAt": "..."
    }
  }
}
```

Errors: `404 DINING_SESSION_NOT_FOUND`, `409 VALIDATION_ERROR` (no active orders)

### GET /api/bills/:id

**Auth**: required
**Role**: `waiter` or `kitchen`

Returns one bill by its ID.

### PATCH /api/bills/:id/pay

**Auth**: required
**Role**: `waiter` or `kitchen`

Marks the bill as `paid` and records who paid.

Errors: `409 VALIDATION_ERROR` (already paid)

---

## Health Check

### GET /api/health

No auth required. Returns:

```json
{ "success": true, "message": "DineFlow API is up", "data": { "ts": "2026-09-16T..." } }
```
