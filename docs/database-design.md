# Database Design

This document describes the MongoDB collections used by DineFlow and the rationale behind the schema decisions.

## Collections

| Collection         | Purpose                                              |
|--------------------|------------------------------------------------------|
| `users`            | All accounts (customer / waiter / kitchen)          |
| `categories`       | Menu categories (Starters, Mains, Desserts, …)       |
| `products`         | Items on the menu                                    |
| `tables`           | Physical restaurant tables                           |
| `dining_sessions`  | A meal happening at a table                         |
| `orders`           | Customer orders with embedded item snapshots        |
| `notifications`    | Per-user notifications                               |
| `waiter_requests`  | Customer-initiated requests for waiter assistance    |
| `bills`            | Aggregated totals for a dining session              |

## Design Principles

### 1. Embed when data is read together and changes rarely

Order items are embedded inside the order document. They contain a snapshot of `productId`, `name`, `quantity`, `unitPrice`, `subtotal` at the moment of ordering. This is critical:

- Product prices change over time. A receipt issued yesterday at 50 EGP must stay 50 EGP even if the catalog price is updated today.
- Product names can be renamed. The historical order must still show the old name.
- Embedding avoids an extra `populate` round-trip when fetching a single order or building a bill.

### 2. Reference when data is shared and updated independently

`customerId`, `tableId`, `diningSessionId`, `categoryId`, `handledBy`, `startedBy`, `paidBy` are all references. These entities have their own lifecycle independent of the order.

### 3. Reference with populate for read-heavy paths

`GET /api/products` populates `categoryId` so the response includes the category name in a single round-trip — no client-side join needed.

`GET /api/orders/:id` populates `customerId`, `tableId`, and `diningSessionId` for the same reason.

### 4. Backend is the source of truth for money

Clients **never** send `unitPrice`, `subtotal`, `tax`, or `total`. The order schema stores all of these but they are computed by the `OrderService.create` method from current product prices. The same applies to `Bill` — its totals are always derived from the underlying orders via `BillRepository.getOrCreateForSession`.

### 5. Snapshot the price, not the entire product

We snapshot only `productId`, `name`, `unitPrice`, and `quantity` per item. We do NOT embed the entire product document — only what the bill/receipt needs to display. This keeps orders small.

---

## Schemas

### users

```js
{
  _id: ObjectId,
  name: String,                 // 2–80 chars
  email: String,                // unique, lowercase, regex-validated
  passwordHash: String,         // bcrypt, select:false so it never leaks
  phone: String,
  role: 'customer' | 'waiter' | 'kitchen',
  profileImage: String,         // Cloudinary URL
  profileImagePublicId: String, // for deletion
  createdAt, updatedAt
}
```

Indexes:
- unique on `email`

### categories

```js
{
  _id: ObjectId,
  name: String,                  // unique
  description: String,
  image: String,                 // Cloudinary URL
  imagePublicId: String,
  isActive: Boolean,
  createdAt, updatedAt
}
```

Indexes:
- unique on `name`

### products

```js
{
  _id: ObjectId,
  name: String,
  description: String,
  price: Number,                 // >= 0
  image: String,
  imagePublicId: String,
  categoryId: ObjectId -> categories._id,
  isAvailable: Boolean,
  createdAt, updatedAt
}
```

Indexes:
- `categoryId` (lookup by category)
- `name` text index (search)
- `isAvailable` (filter)

### tables

```js
{
  _id: ObjectId,
  tableNumber: Number,           // unique, >= 1
  capacity: Number,              // 1–30
  status: 'available' | 'occupied' | 'reserved',
  location: String,
  createdAt, updatedAt
}
```

Indexes:
- unique on `tableNumber`
- `status`

### dining_sessions

```js
{
  _id: ObjectId,
  tableId: ObjectId -> tables._id,
  startedBy: ObjectId -> users._id,   // optional, just for traceability
  status: 'active' | 'closed',
  startedAt: Date,
  endedAt: Date,
  guestCount: Number,
  notes: String,
  createdAt, updatedAt
}
```

Indexes:
- `tableId`
- `status`
- compound `(status, tableId)` — used to find the active session on a table efficiently

**Design decision**: A `DiningSession` is conceptually independent of any one customer (spec §5). Multiple people at a table for 4 can place orders under the same session. `startedBy` records who opened it for traceability but does NOT imply ownership. All orders linked to the same session are aggregated when generating the bill.

### orders

```js
{
  _id: ObjectId,
  orderNumber: String,          // "ORD-000001", unique
  customerId: ObjectId,
  diningSessionId: ObjectId?,    // optional for TAKEAWAY
  tableId: ObjectId?,            // resolved from session for DINE_IN
  type: 'DINE_IN' | 'TAKEAWAY',
  items: [
    {
      productId: ObjectId,
      name: String,              // snapshot
      quantity: Number,           // >= 1
      unitPrice: Number,          // snapshot
      subtotal: Number            // = unitPrice * quantity
    }
  ],
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'served' | 'completed' | 'cancelled',
  subtotal: Number,
  tax: Number,
  total: Number,
  notes: String,
  cancelledBy: ObjectId?,
  cancelledAt: Date?,
  createdAt, updatedAt
}
```

Indexes:
- unique on `orderNumber`
- `customerId` + `createdAt` desc (customer history)
- `status` (kitchen dashboard filter)
- `diningSessionId` + `createdAt` (bill aggregation)

### notifications

```js
{
  _id: ObjectId,
  userId: ObjectId,
  title: String,
  message: String,
  type: 'ORDER_UPDATE' | 'WAITER_REQUEST' | 'PAYMENT' | 'SYSTEM',
  isRead: Boolean,
  data: Mixed,                  // optional payload (e.g. { orderId, status })
  createdAt, updatedAt
}
```

Indexes:
- compound `(userId, isRead, createdAt desc)` — efficient unread inbox query

### waiter_requests

```js
{
  _id: ObjectId,
  customerId: ObjectId,
  tableId: ObjectId?,
  diningSessionId: ObjectId?,
  type: 'CALL_WAITER' | 'REQUEST_BILL' | 'REQUEST_HELP',
  status: 'pending' | 'accepted' | 'completed' | 'cancelled',
  message: String,
  handledBy: ObjectId?,
  handledAt: Date?,
  createdAt, updatedAt
}
```

Indexes:
- `customerId` (customer history)
- compound `(status, createdAt desc)` (waiter dashboard "pending" list)

### bills

```js
{
  _id: ObjectId,
  billNumber: String,            // "BILL-000001", unique
  diningSessionId: ObjectId,
  tableId: ObjectId?,
  orders: [
    { orderId: ObjectId, orderNumber: String, total: Number }
  ],
  subtotal: Number,
  tax: Number,
  total: Number,
  paidBy: ObjectId?,
  status: 'open' | 'paid',
  createdAt, updatedAt
}
```

Indexes:
- unique on `billNumber`
- `diningSessionId` (1:1 lookup)

**Design decision**: A bill is generated **on demand** from the underlying orders when `GET /api/bills/dining-sessions/:id` is called, then cached as a document so it has a stable identity (`billNumber`). On subsequent calls the existing bill is recalculated from the orders (in case new orders were added after the bill was first generated). The bill document is never the source of truth for totals — the orders always are.

---

## Why MongoDB (not SQL)?

- **Schema flexibility** for the `data` field of notifications and the embedded items array of orders (which can change shape over time without a migration).
- **Document size** is well under the 16 MB limit for every collection — no need to split.
- **Atomic updates** of nested arrays (order items) are simpler than normalised SQL.
- **Atlas free tier** is sufficient for early development.

## Index strategy

Each index is justified by a concrete query path:

| Index                                      | Used by                                 |
|-------------------------------------------|-----------------------------------------|
| `users.email` unique                       | login lookup                            |
| `categories.name` unique                   | duplicate prevention                    |
| `products.categoryId`                      | `GET /products?categoryId=`             |
| `products.name` text                       | `GET /products?search=`                 |
| `products.isAvailable`                     | availability filter                    |
| `tables.tableNumber` unique                | duplicate prevention                    |
| `tables.status`                            | `GET /tables?status=`                   |
| `dining_sessions.tableId`                  | find active session on table            |
| `dining_sessions.(status, tableId)`        | `findActiveByTable`                     |
| `orders.orderNumber` unique                | receipt display                         |
| `orders.customerId + createdAt desc`       | customer history page                   |
| `orders.status`                            | kitchen dashboard                       |
| `orders.diningSessionId + createdAt`       | bill aggregation                        |
| `notifications.(userId, isRead, createdAt)` | unread inbox                          |
| `waiter_requests.(status, createdAt desc)` | waiter dashboard                       |
| `bills.billNumber` unique                  | receipt display                         |
| `bills.diningSessionId`                    | 1:1 lookup                              |

## Migrations

Mongoose does not run migrations like SQL databases. For schema changes:

1. Add the new field as optional in the Mongoose schema.
2. Deploy — existing documents simply lack the new field (returns `undefined`).
3. Run a one-off script to backfill if needed.
4. In a later release, make the field required once all documents have it.

This is the standard MongoDB evolutionary schema approach.
