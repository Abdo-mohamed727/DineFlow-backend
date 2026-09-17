# DineFlow — Restaurant Ordering Backend

A production-oriented backend for a restaurant ordering system built with **Node.js + Express + TypeScript + MongoDB**. Designed to be consumed by a Flutter mobile app.

## Project Overview

DineFlow supports three roles — **customer**, **waiter**, and **kitchen** — and implements the full restaurant workflow:

- Customer can browse the menu, start a dining session at a table, place DINE_IN or TAKEAWAY orders, track their status, cancel orders (in allowed states), call a waiter, request a bill, and view notifications.
- Waiter can see active dining sessions, view all orders, drive `ready → served → completed`, manage waiter requests, and generate bills.
- Kitchen can see incoming/active orders and drive `pending → confirmed → preparing → ready`.

The backend is the **single source of truth** for all money calculations (subtotal, tax, total). Clients are NEVER trusted to send totals or item prices — every order is recomputed from the product catalog.

## Tech Stack

- **Runtime**: Node.js 18+ / TypeScript 5
- **HTTP**: Express.js 4
- **Database**: MongoDB (local or Atlas) via Mongoose 8
- **Auth**: JWT + bcryptjs
- **Validation**: Zod
- **File uploads**: Multer → Cloudinary
- **Security**: Helmet, CORS
- **Logging**: Morgan
- **Tests**: Jest + Supertest + mongodb-memory-server

## Requirements

- Node.js 18+ (developed on 24)
- npm 10+
- A running MongoDB instance — either:
  - **Local** MongoDB on `mongodb://127.0.0.1:27017`, OR
  - **MongoDB Atlas** cloud cluster (recommended for production)
- (Optional) A Cloudinary account for image uploads. If you skip it, the dev mode returns placeholder URLs so the API still works end-to-end.

## Installation

```bash
cd backend
npm install
cp .env.example .env
# Edit .env to set MONGODB_URI, JWT_SECRET, and optionally Cloudinary credentials
```

## Environment Variables

Edit `.env`:

```env
PORT=3000
NODE_ENV=development
MONGODB_URI=mongodb://127.0.0.1:27017/dineflow     # local
# MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/dineflow?retryWrites=true&w=majority  # Atlas
JWT_SECRET=replace_with_a_long_random_secret_min_32_chars
JWT_EXPIRES_IN=7d
CORS_ORIGIN=*

# Optional in development, required in production for real image hosting
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

TAX_RATE=0.14      # 14% VAT
MAX_UPLOAD_MB=5
```

> **Never commit `.env`.** The included `.gitignore` already excludes it.

## MongoDB Setup

### Option A — Local MongoDB

Install MongoDB Community Edition for your OS, then start it:

```bash
# macOS (brew)
brew services start mongodb-community

# Ubuntu / Debian
sudo systemctl start mongod

# Windows
net start MongoDB
```

Leave `MONGODB_URI=mongodb://127.0.0.1:27017/dineflow` in `.env`.

### Option B — MongoDB Atlas (cloud)

1. Sign up at <https://www.mongodb.com/cloud/atlas/register>
2. Create a free shared cluster (M0).
3. Database Access → add a user, note the password.
4. Network Access → add your IP (or `0.0.0.0/0` for development only).
5. Connect → Drivers → copy the connection string. It looks like:
   ```
   mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
6. Paste into `.env` as `MONGODB_URI` and append the database name:
   ```
   mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/dineflow?retryWrites=true&w=majority
   ```

## Running the Project

```bash
# Development (hot reload with tsx watch)
npm run dev

# Production build
npm run build
npm start
```

Server URL: `http://localhost:3000`
Health check: `GET http://localhost:3000/api/health`

## Seeding

The seed script creates test users, categories, products and tables so you can immediately exercise the API.

```bash
npm run seed
```

Creates the following test users (all share the same dev password `Password123!`):

| Role    | Email              |
|---------|--------------------|
| customer | `customer@dev.com` |
| waiter   | `waiter@dev.com`   |
| kitchen  | `kitchen@dev.com`  |

Also creates **4 categories** (Starters, Mains, Desserts, Beverages) and **20 realistic restaurant products** with prices in EGP.

> The seed script is **idempotent** — it clears existing dev data before seeding. **NEVER run it against a production database.**

## Architecture

The project follows a clean layered architecture:

```
HTTP Request
     ↓
Route               ← middleware wiring (auth, validate, upload)
     ↓
Middleware
     ↓
Controller          ← HTTP-specific: parses req, calls service, returns response envelope
     ↓
Service             ← Business logic: totals, status transitions, role checks
     ↓
Repository          ← Database access only (Mongoose queries)
     ↓
Mongoose Model      ← Schema + indexes + hooks
     ↓
MongoDB
```

### Folder structure

```
src/
├── config/        # env, database connection, Cloudinary
├── controllers/   # HTTP layer (one per resource)
├── services/      # Business logic (one per resource)
├── repositories/  # Data access (one per resource)
├── models/        # Mongoose schemas (one per collection)
├── routes/        # Express route definitions (one per resource)
├── middlewares/   # authenticate, authorize, validate, upload, error
├── validators/    # Zod schemas (one per resource)
├── utils/         # jwt, password, pricing, orderStatus, apiResponse, mongoose
├── types/         # shared TS types & enums
├── errors/        # AppError + error codes
├── app.ts         # Express app factory
└── server.ts      # Bootstrap + graceful shutdown
```

### Responsibilities

- **Controllers** parse HTTP, call services, return the standard response envelope `{ success, message, data }`. No business logic.
- **Services** contain business logic (totals computation, state machine checks, role authorization for state transitions, side effects like notifications).
- **Repositories** wrap Mongoose. They know about the DB schema; nothing else does.
- **Validators** (Zod) live in their own folder so they can be unit-tested in isolation.
- **Errors** centralize HTTP status codes and machine-readable error codes.

## Authentication

### JWT Flow

1. `POST /api/auth/register` (customer only) or `POST /api/auth/login` returns `{ user, token }`.
2. The client stores the JWT and sends it as `Authorization: Bearer <token>` on subsequent requests.
3. The `authenticate` middleware verifies the JWT and attaches `req.user = { id, role }`.
4. The `authorize('customer'|'waiter'|'kitchen')` middleware enforces role-based access on specific routes.

### JWT contents

The JWT payload is minimal:

```json
{
  "userId": "<mongodb _id>",
  "role": "customer",
  "iat": 1710000000,
  "exp": 1710604800
}
```

No sensitive data (no password, no email, no phone) is placed in the token.

### Roles

- **`customer`** — default role on self-registration. Can browse, place orders, cancel their own (pre-preparing) orders, create waiter requests, view own notifications.
- **`waiter`** — manages tables, dining sessions, drives `ready → served → completed`, handles waiter requests, generates bills.
- **`kitchen`** — drives `pending → confirmed → preparing → ready`, can create/update products.

Customers **cannot** self-register as waiter or kitchen. The `/api/auth/register` endpoint forces `role = 'customer'` regardless of what the client sends. Elevated users are created only via the secure seed script (`npm run seed`) — which is a development-only tool — or directly in the database.

## API Endpoints

See [`docs/api.md`](./docs/api.md) for the complete endpoint reference. Summary:

```
Auth                 POST   /api/auth/register
                     POST   /api/auth/login
                     GET    /api/auth/me

Users                GET    /api/users/me
                     PATCH  /api/users/me
                     PATCH  /api/users/me/profile-image  (multipart)

Categories           GET    /api/categories
                     GET    /api/categories/:id
                     POST   /api/categories               (waiter/kitchen, multipart)
                     PATCH  /api/categories/:id           (waiter/kitchen, multipart)
                     DELETE /api/categories/:id            (waiter/kitchen)

Products             GET    /api/products?categoryId=&search=&isAvailable=
                     GET    /api/products/:id
                     POST   /api/products                 (waiter/kitchen, multipart)
                     PATCH  /api/products/:id             (waiter/kitchen, multipart)
                     DELETE /api/products/:id             (waiter/kitchen)

Tables               GET    /api/tables?status=
                     GET    /api/tables/:id
                     POST   /api/tables                   (waiter)
                     PATCH  /api/tables/:id               (waiter)
                     DELETE /api/tables/:id               (waiter)

Dining Sessions      POST   /api/dining-sessions          (customer/waiter)
                     GET    /api/dining-sessions           (waiter)
                     GET    /api/dining-sessions/:id
                     POST   /api/dining-sessions/:id/close (waiter)

Orders               POST   /api/orders                   (customer/waiter)
                     GET    /api/orders                   (customer=own; staff=all)
                     GET    /api/orders/:id
                     PATCH  /api/orders/:id/cancel        (customer, before preparing)
                     PATCH  /api/orders/:id/status        (kitchen/waiter by transition)

Notifications        GET    /api/notifications
                     PATCH  /api/notifications/:id/read
                     PATCH  /api/notifications/read-all

Waiter Requests      POST   /api/waiter-requests          (customer)
                     GET    /api/waiter-requests          (customer=own; waiter=all)
                     GET    /api/waiter-requests/:id
                     PATCH  /api/waiter-requests/:id/status (waiter)

Bills                GET    /api/bills/dining-sessions/:id (waiter/kitchen)
                     GET    /api/bills/:id                 (waiter/kitchen)
                     PATCH  /api/bills/:id/pay             (waiter/kitchen)
```

## Postman

### Import the collection

1. Open Postman.
2. Click **Import**.
3. Select `postman/DineFlow.postman_collection.json`.
4. Import the environment `postman/DineFlow.postman_environment.json` and select it as the active environment.
5. Start the server (`npm run dev`) and seed the database (`npm run seed`).

### Obtaining tokens

The collection ships with login requests whose **Tests** script automatically saves the returned JWT into the corresponding variable:

| Request              | Variable saved   |
|----------------------|------------------|
| `Auth / Login as Customer` | `customerToken`  |
| `Auth / Login as Waiter`   | `waiterToken`    |
| `Auth / Login as Kitchen`  | `kitchenToken`   |

After running each login once, the variables are populated and subsequent requests that use `{{customerToken}}`, `{{waiterToken}}`, `{{kitchenToken}}` work automatically.

### Other auto-captured variables

Several create endpoints save their created resource ID back into the environment:

| Request                              | Variable saved       |
|--------------------------------------|----------------------|
| `Categories / Create Category`        | `categoryId`         |
| `Products / Create Product`           | `productId`          |
| `Tables / Create Table`               | `tableId`            |
| `Dining Sessions / Start Dining Session` | `diningSessionId` |
| `Orders / Create DINE_IN Order`       | `orderId`            |
| `Waiter Requests / Customer - Call Waiter` | `waiterRequestId` |
| `Bills / Get Bill for Dining Session` | `billId`             |

> If you have already seeded the database, you can also call `GET /api/products` to find an existing `productId` and set the variable manually.

## Flutter Integration

See [`docs/flutter-integration.md`](./docs/flutter-integration.md) for a complete guide including Dio setup, JWT storage, login flow, fetching products, creating an order, and handling errors.

For image uploads (profile / product / category images), see [`docs/image-upload.md`](./docs/image-upload.md).

## Testing

Run the test suite (uses an in-memory MongoDB so no external DB is required):

```bash
npm test
```

Test coverage includes:

- Auth: register, login, duplicate email, validation, role enforcement, token-based `/me`
- Products: list, filter by category, search, availability filter, authorization
- Orders: creation with backend-computed totals, snapshot pricing, validation, full lifecycle (`pending → confirmed → preparing → ready → served → completed`), invalid transitions, customer cancellation rules, role matrix for transitions
- Waiter requests: customer create, waiter list/accept/complete
- Notifications: isolation between users, mark read, mark all read
- Authorization: 401 for unauthenticated, 403 for wrong role

## Database Design

See [`docs/database-design.md`](./docs/database-design.md) for the full schema reference, indexes, and design rationale (embedding vs referencing, snapshot pricing, bill generation strategy, etc.).

## License

MIT.
