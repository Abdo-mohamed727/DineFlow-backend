# Cart → Order Checkout Flow

This document describes the cart feature and the checkout flow from a Flutter cart to a placed order.

## High-level flow

```
Flutter — browse products
        ↓
POST /api/cart/items              (add product to cart, or increment qty)
        ↓
GET  /api/cart                    (review cart, see live totals)
        ↓
PATCH /api/cart/items/:productId  (change quantity)
DELETE /api/cart/items/:productId (remove an item)
DELETE /api/cart                  (clear cart)
        ↓
user taps "Place Order"
        ↓
POST /api/orders                  (NO items in body — backend reads cart)
        ↓
Express → Zod validates the request
        ↓
OrderService.create()
  • Reads the authenticated customer's cart from MongoDB
  • Validates the cart is non-empty (400 EMPTY_CART otherwise)
  • Fetches products from MongoDB (current prices)
  • Verifies each exists + isAvailable
  • Snapshots productName + unitPrice at order time
  • Computes subtotal / tax / total (TAX_RATE)
  • For DINE_IN: validates diningSessionId is active
  • Persists the order with status = pending
  • Creates a notification for the customer
  • Clears the cart on success
        ↓
201 Created  →  { success, message, data: { order, orderId, items, subtotal, tax, total, status, orderType, createdAt } }
        ↓
Flutter receives 201
        ↓
Flutter navigates to Order Details / Orders screen
        ↓
(cart is already cleared on the backend — no client-side clearCart() required)
```

## Server-side cart vs client-side cart

DineFlow now has a **server-side cart** stored in MongoDB (`Cart` collection). Each customer has exactly one cart (enforced by a unique index on `customerId`). The cart stores only `{ productId, quantity }` per item — never prices, names, or images. Those are always read live from the catalog when the customer views the cart, and snapshotted into the Order at checkout time.

Why server-side?

- The cart survives app reinstalls and device switches (the same customer logging in from a new phone sees their cart).
- The cart is the single source of truth for checkout — the customer just taps "Place Order" and the backend handles everything.
- Prices are validated and snapshotted at order time, so catalog changes between add-to-cart and checkout are correctly reflected.

## The golden rule — cart clearing placement

> The cart is cleared by the **backend** after a successful order creation. The Flutter client does NOT need to call `DELETE /api/cart` separately.

```dart
try {
  // Customer checkout: NO items in body — backend reads from cart.
  final response = await orderApi.createOrder(
    orderType: 'TAKEAWAY',
    // items: NOT sent — backend uses the cart
  );

  // ✅ Backend returned 201. Cart is already cleared server-side.
  // No client-side clearCart() call needed.

  // Navigate to order details
  navigator.pushReplacement(OrderDetailsPage(orderId: response.data['data']['orderId']));
} on DioException catch (e) {
  // ❌ Order creation failed. Cart is INTACT on the backend.
  // The customer can retry without re-adding items.
  showOrderFailedSnackBar(e);
}
```

When the cart is NOT cleared (backend guarantees):

- Network failure / timeout
- `400` VALIDATION_ERROR
- `400` EMPTY_CART (cart is already empty — nothing to clear)
- `400` PRODUCT_UNAVAILABLE
- `400` SESSION_CLOSED (dining session is not active)
- `401` UNAUTHORIZED (token expired)
- `403` FORBIDDEN (wrong role)
- `404` PRODUCT_NOT_FOUND / DINING_SESSION_NOT_FOUND
- `500` INTERNAL_ERROR
- Any other error

In all of the above cases, the cart remains **exactly as the user left it** so they can retry.

## API contract — Cart endpoints

All cart endpoints require `Authorization: Bearer {{customerToken}}` and the `customer` role.

### GET /api/cart

Returns the cart (empty shape if none exists). Product info (name, price, image, isAvailable) is populated live.

```json
{
  "success": true,
  "message": "Cart retrieved successfully",
  "data": {
    "cart": {
      "id": "...",
      "items": [
        {
          "productId": "...",
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

### POST /api/cart/items

```json
{
  "productId": "{{productId}}",
  "quantity": 2
}
```

If the product is already in the cart, increments its quantity. Returns the updated cart (201).

### PATCH /api/cart/items/:productId

```json
{
  "quantity": 3
}
```

Replaces the quantity. Returns the updated cart (200).

### DELETE /api/cart/items/:productId

Removes the product from the cart. Returns the updated cart (200).

### DELETE /api/cart

Clears all items from the cart. Returns the empty cart (200). Idempotent.

## API contract — Order creation

### Endpoint

`POST /api/orders`

### Auth

```
Authorization: Bearer {{customerToken}}
```

Only `customer` (cart-driven) and `waiter` (items-in-body) can place orders.

### Role-based request shapes — STRICT business rule

| Role | Request shape | Source of items |
|---|---|---|
| **Customer** | `{ orderType, diningSessionId?, notes? }` — NO `items` field allowed | Server-side Cart |
| **Waiter** | `{ orderType, diningSessionId?, items: [...], notes? }` — `items` REQUIRED | Request body |

### Request body — Cart-driven checkout (customer)

The customer does NOT send `items` — the backend reads the authenticated customer's cart.

```json
{
  "orderType": "TAKEAWAY"
}
```

For DINE_IN:

```json
{
  "orderType": "DINE_IN",
  "diningSessionId": "65f2c4a8b3e1c8a12b7d0f01",
  "notes": "No onions"
}
```

> A customer sending `items` in the body is ALWAYS rejected with `400 VALIDATION_ERROR`. Customers must use `/api/cart/*` to manage their cart.

### Request body — Items-in-body (waiter only)

Waiters create orders on behalf of customers and do NOT use the cart. They send `items` directly:

```json
{
  "orderType": "TAKEAWAY",
  "items": [
    { "productId": "65f2c4a8b3e1c8a12b7d0f10", "quantity": 2 }
  ]
}
```

> A waiter sending a request without `items` is rejected with `400 VALIDATION_ERROR`. The cart is NEVER touched for waiter-placed orders.

### What the client MUST NOT send

The following fields are **never** accepted — the backend is the source of truth:

- `unitPrice` (on each item)
- `subtotal` (on each item)
- `subtotal` (on the order)
- `tax`
- `total`
- `status`
- `orderNumber`
- `customerId`
- `items` (for customer role — must use cart instead)

The Zod schema uses `.strict()`, so sending any of these will return `400 VALIDATION_ERROR`.

### Response (201 Created)

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
        {
          "productId": "65f2c4a8b3e1c8a12b7d0f10",
          "productName": "Classic Beef Burger",
          "quantity": 2,
          "unitPrice": 220,
          "subtotal": 440
        }
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
      {
        "productId": "65f2c4a8b3e1c8a12b7d0f10",
        "productName": "Classic Beef Burger",
        "quantity": 2,
        "unitPrice": 220,
        "subtotal": 440
      }
    ],
    "subtotal": 440,
    "tax": 61.6,
    "total": 501.6,
    "status": "pending",
    "createdAt": "2026-09-17T10:30:00.000Z"
  }
}
```

The top-level convenience fields (`orderId`, `orderType`, `items`, `subtotal`, `tax`, `total`, `status`, `createdAt`) mirror the same values inside `order` — they exist so Flutter doesn't have to drill into `order.*` for the common case.

### Errors

| Status | `error`                    | When                                                  |
|--------|----------------------------|-------------------------------------------------------|
| 400    | `VALIDATION_ERROR`         | Bad shape / invalid quantity / extra fields           |
| 400    | `EMPTY_CART`                | Customer omits `items` but their cart is empty        |
| 400    | `PRODUCT_UNAVAILABLE`      | One of the products has `isAvailable = false`        |
| 400    | `SESSION_CLOSED`           | DINE_IN against a closed dining session              |
| 401    | `UNAUTHORIZED`             | Missing / invalid / expired JWT                       |
| 403    | `FORBIDDEN`                | Authenticated but role not allowed                   |
| 404    | `PRODUCT_NOT_FOUND`        | A productId doesn't exist in the catalog             |
| 404    | `DINING_SESSION_NOT_FOUND` | A diningSessionId doesn't exist                     |
| 500    | `INTERNAL_ERROR`           | Unexpected server failure                             |

In every error case, **no order is persisted and the cart is NOT cleared** — the client can safely retry.

## Flutter implementation reference

### Recommended Flutter structure

```
lib/
├── features/
│   ├── cart/
│   │   ├── datasources/cart_remote_data_source.dart
│   │   ├── cubit/cart_cubit.dart
│   │   ├── cubit/cart_state.dart
│   │   ├── models/cart_item.dart
│   │   └── views/cart_screen.dart
│   └── orders/
│       ├── datasources/order_remote_data_source.dart
│       ├── repositories/order_repository.dart
│       ├── models/order.dart
│       └── views/order_details_screen.dart
```

### Dio — CartRemoteDataSource

```dart
// lib/features/cart/datasources/cart_remote_data_source.dart
import 'package:dio/dio.dart';
import '../../api/api_client.dart';

class CartRemoteDataSource {
  final Dio _dio = ApiClient().dio;

  Future<Map<String, dynamic>> getCart() async {
    final res = await _dio.get('/cart');
    return res.data['data']['cart'];
  }

  Future<Map<String, dynamic>> addItem({
    required String productId,
    required int quantity,
  }) async {
    final res = await _dio.post('/cart/items', data: {
      'productId': productId,
      'quantity': quantity,
    });
    return res.data['data']['cart'];
  }

  Future<Map<String, dynamic>> updateItem({
    required String productId,
    required int quantity,
  }) async {
    final res = await _dio.patch('/cart/items/$productId', data: {
      'quantity': quantity,
    });
    return res.data['data']['cart'];
  }

  Future<Map<String, dynamic>> removeItem(String productId) async {
    final res = await _dio.delete('/cart/items/$productId');
    return res.data['data']['cart'];
  }

  Future<Map<String, dynamic>> clearCart() async {
    final res = await _dio.delete('/cart');
    return res.data['data']['cart'];
  }
}
```

### Dio — OrderRemoteDataSource (cart-driven checkout)

```dart
// lib/features/orders/datasources/order_remote_data_source.dart
import 'package:dio/dio.dart';
import '../../api/api_client.dart';

class OrderRemoteDataSource {
  final Dio _dio = ApiClient().dio;

  /// Places an order from the customer's cart.
  /// The backend reads the cart, snapshots prices, creates the order,
  /// and clears the cart on success.
  Future<Map<String, dynamic>> createOrderFromCart({
    required String orderType,            // 'DINE_IN' or 'TAKEAWAY'
    String? diningSessionId,
    String? notes,
  }) async {
    final res = await _dio.post('/orders', data: {
      'orderType': orderType,
      if (diningSessionId != null) 'diningSessionId': diningSessionId,
      if (notes != null && notes.isNotEmpty) 'notes': notes,
      // NOTE: items are NOT sent — backend reads from cart.
    });
    return res.data['data'];
  }
}
```

### Cart Cubit → Place Order

```dart
// lib/features/cart/cubit/cart_cubit.dart
Future<void> placeOrder({
  required String orderType,
  String? diningSessionId,
  String? notes,
}) async {
  emit(CartSubmitting());

  try {
    final data = await orderRemoteDataSource.createOrderFromCart(
      orderType: orderType,
      diningSessionId: diningSessionId,
      notes: notes,
    );

    // ✅ Backend returned 201. Cart is ALREADY cleared on the backend.
    // Refresh local cart state by re-fetching (will be empty).
    await refreshCart();

    emit(CartOrderPlaced(
      orderId: data['orderId'] as String,
      total: (data['total'] as num).toDouble(),
    ));
  } on DioException catch (e) {
    // ❌ Order creation failed. Cart is INTACT on the backend.
    final message = e.response?.data?['message'] ?? 'Order failed. Please try again.';
    emit(CartError(message));
  } catch (e) {
    emit(CartError('Unexpected error. Please try again.'));
  }
}
```

### Cart UI — "Place Order" button

```dart
ElevatedButton(
  onPressed: state is CartSubmitting
      ? null
      : () async {
          await context.read<CartCubit>().placeOrder(
                orderType: 'TAKEAWAY', // or 'DINE_IN' if a session is active
                // diningSessionId: ..., // only for DINE_IN
                notes: notesController.text,
              );
        },
  child: state is CartSubmitting
      ? const CircularProgressIndicator()
      : const Text('Place Order'),
),
```

### Listening for success → navigate

```dart
BlocListener<CartCubit, CartState>(
  listenWhen: (prev, curr) => curr is CartOrderPlaced,
  listener: (context, state) {
    final placed = state as CartOrderPlaced;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Order placed! Total: ${placed.total}')),
    );
    context.go('/orders/${placed.orderId}'); // navigate to Order Details
  },
),
```

## Test cases covered

The backend test suite explicitly covers:

### Cart endpoints (`tests/cart.test.ts`)

1. ✅ GET /api/cart — empty cart for new customer
2. ✅ GET /api/cart — populated cart after items added
3. ✅ GET /api/cart — unauthenticated (401)
4. ✅ GET /api/cart — non-customer role (403)
5. ✅ POST /api/cart/items — add new product (201)
6. ✅ POST /api/cart/items — add same product twice (increments, no duplicate)
7. ✅ POST /api/cart/items — invalid productId format (400 VALIDATION_ERROR)
8. ✅ POST /api/cart/items — non-existent productId (404 PRODUCT_NOT_FOUND)
9. ✅ POST /api/cart/items — unavailable product (400 PRODUCT_UNAVAILABLE)
10. ✅ POST /api/cart/items — invalid quantity (0, -1, 1.5, 'abc')
11. ✅ POST /api/cart/items — unauthenticated (401)
12. ✅ POST /api/cart/items — waiter role (403)
13. ✅ POST /api/cart/items — kitchen role (403)
14. ✅ PATCH /api/cart/items/:productId — update existing item
15. ✅ PATCH /api/cart/items/:productId — invalid quantity
16. ✅ PATCH /api/cart/items/:productId — item not in cart (404 CART_ITEM_NOT_FOUND)
17. ✅ PATCH /api/cart/items/:productId — unauthenticated (401)
18. ✅ DELETE /api/cart/items/:productId — remove existing item
19. ✅ DELETE /api/cart/items/:productId — item not in cart (404)
20. ✅ DELETE /api/cart/items/:productId — unauthenticated (401)
21. ✅ DELETE /api/cart — clear cart
22. ✅ DELETE /api/cart — clear already-empty cart (idempotent)
23. ✅ DELETE /api/cart — unauthenticated (401)
24. ✅ Cart isolation — customer A cannot see customer B's cart
25. ✅ Cart isolation — customer A cannot update customer B's cart item

### Cart → Order integration (`tests/cart.test.ts` + `tests/orders.test.ts`)

26. ✅ Order created from cart (no items in body) + cart cleared after
27. ✅ Empty cart rejected (400 EMPTY_CART)
28. ✅ Cart NOT cleared when order creation fails (unavailable product)
29. ✅ **Customer sending `items` in body → rejected (400 VALIDATION_ERROR)**
30. ✅ Waiter can place order with items in body (no cart required)
31. ✅ Waiter cannot place order without items in body (400 VALIDATION_ERROR)
32. ✅ Cart cleared after successful customer checkout
33. ✅ Cart NOT cleared if order creation fails

### Existing order lifecycle tests (`tests/orders.test.ts`)

All existing order lifecycle tests (status transitions, customer cancellation, role-based authorization) still pass — they now use the cart-driven flow for customer-created orders and items-in-body for waiter-created orders.
