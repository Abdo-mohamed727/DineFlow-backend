# Cart → Order Checkout Flow

This document describes the contract for placing an order from a Flutter cart and exactly when the cart should be cleared on the client side.

## High-level flow

```
Flutter Cart Screen
        ↓  user taps "Place Order"
Flutter sends POST /api/orders  (Bearer JWT)
        ↓
Express → Zod validates the request
        ↓
OrderService.create()
  • Fetches products from MongoDB
  • Verifies each exists + isAvailable
  • Snapshots productName + unitPrice at order time
  • Computes subtotal / tax / total (TAX_RATE)
  • For DINE_IN: validates diningSessionId is active
  • Persists the order with status = pending
  • Creates a notification for the customer
        ↓
201 Created  →  { success, message, data: { order, orderId, items, subtotal, tax, total, status, orderType, createdAt } }
        ↓
Flutter receives 201
        ↓
Flutter calls clearCart()
        ↓
Flutter navigates to Order Details / Orders screen
```

## The golden rule — clearCart() placement

> `clearCart()` must be called **only after** the backend returns a successful `201` (or `200`) response.

```dart
try {
  final response = await orderApi.createOrder(...); // Dio POST /api/orders

  // The Dio interceptor throws on non-2xx, so reaching this line means success.
  // If you've disabled the throw-on-error behaviour, check explicitly:
  //   if (response.statusCode! >= 200 && response.statusCode! < 300) { ... }

  // ✅ Safe — backend has persisted the order
  cartCubit.clearCart();

  // Navigate to order details
  navigator.pushReplacement(OrderDetailsPage(orderId: response.data['data']['orderId']));
} on DioException catch (e) {
  // ❌ DO NOT clearCart() here.
  // The order was NOT created on the backend. The cart must remain intact
  // so the user can retry without re-adding everything.
  showOrderFailedSnackBar(e);
}
```

When the cart must NOT be cleared:

- Network failure / timeout
- `400` VALIDATION_ERROR (empty items, invalid productId, invalid quantity)
- `400` PRODUCT_UNAVAILABLE
- `400` SESSION_CLOSED (dining session is not active)
- `401` UNAUTHORIZED (token expired)
- `403` FORBIDDEN (wrong role)
- `404` PRODUCT_NOT_FOUND / DINING_SESSION_NOT_FOUND
- `500` INTERNAL_ERROR
- Any other DioException

In all of the above cases, the cart must remain **exactly as the user left it** so they can retry.

## API contract

### Endpoint

`POST /api/orders`

### Auth

```
Authorization: Bearer {{customerToken}}
```

Only `customer` (and `waiter` on behalf of a customer) can place orders.

### Request body — DINE_IN

```json
{
  "orderType": "DINE_IN",
  "diningSessionId": "65f2c4a8b3e1c8a12b7d0f01",
  "items": [
    { "productId": "65f2c4a8b3e1c8a12b7d0f10", "quantity": 2 },
    { "productId": "65f2c4a8b3e1c8a12b7d0f11", "quantity": 1 }
  ],
  "notes": "No onions"
}
```

### Request body — TAKEAWAY

```json
{
  "orderType": "TAKEAWAY",
  "items": [
    { "productId": "65f2c4a8b3e1c8a12b7d0f10", "quantity": 2 }
  ]
}
```

> `diningSessionId` is **optional** for TAKEAWAY and **required** for DINE_IN.

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

The top-level convenience fields (`orderId`, `orderType`, `items`, `subtotal`, `tax`, `total`, `status`, `createdAt`) mirror the same values inside `order` — they exist so Flutter doesn't have to drill into `order.*` for the common case (e.g. showing an "Order placed!" toast with the totals).

### Errors

| Status | `error`                    | When                                                  |
|--------|----------------------------|-------------------------------------------------------|
| 400    | `VALIDATION_ERROR`         | Bad shape / empty items / invalid quantity / extra fields |
| 400    | `PRODUCT_UNAVAILABLE`      | One of the products has `isAvailable = false`        |
| 400    | `SESSION_CLOSED`           | DINE_IN against a closed dining session              |
| 401    | `UNAUTHORIZED`             | Missing / invalid / expired JWT                       |
| 403    | `FORBIDDEN`                | Authenticated but role not allowed                   |
| 404    | `PRODUCT_NOT_FOUND`        | A productId doesn't exist in the catalog             |
| 404    | `DINING_SESSION_NOT_FOUND` | A diningSessionId doesn't exist                     |
| 500    | `INTERNAL_ERROR`           | Unexpected server failure                             |

In every error case, **no order is persisted** — the database state is unchanged. The client can safely keep the cart and retry.

## Flutter implementation reference

> DineFlow has no `cart` collection on the backend by design. The cart is a **client-side** state living in Flutter (Cubit / Bloc / Riverpod / Provider — your choice). The backend never knows about the cart; it only sees the final `items` array on `POST /api/orders`.

### Recommended Flutter structure

```
lib/
├── features/
│   ├── cart/
│   │   ├── cubit/cart_cubit.dart        # holds CartState (List<CartItem>)
│   │   ├── cubit/cart_state.dart
│   │   ├── models/cart_item.dart        # { productId, name, price, image, quantity }
│   │   └── views/cart_screen.dart       # "Place Order" button
│   └── orders/
│       ├── datasources/order_remote_data_source.dart
│       ├── repositories/order_repository.dart
│       ├── models/order.dart
│       └── views/order_details_screen.dart
```

### Dio call — `OrderRemoteDataSource`

```dart
// lib/features/orders/datasources/order_remote_data_source.dart
import 'package:dio/dio.dart';
import '../../api/api_client.dart';

class OrderRemoteDataSource {
  final Dio _dio = ApiClient().dio;

  Future<Map<String, dynamic>> createOrder({
    required String orderType,            // 'DINE_IN' or 'TAKEAWAY'
    required List<Map<String, dynamic>> items, // [{ productId, quantity }]
    String? diningSessionId,
    String? notes,
  }) async {
    final res = await _dio.post('/orders', data: {
      'orderType': orderType,
      if (diningSessionId != null) 'diningSessionId': diningSessionId,
      'items': items,
      if (notes != null && notes.isNotEmpty) 'notes': notes,
    });
    // Dio throws DioException on non-2xx by default; if we reach here, success.
    return res.data['data'] as Map<String, dynamic>;
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
    // 1. Build items payload from current cart state (productId + quantity ONLY).
    final items = state.items.map((ci) => {
      'productId': ci.productId,
      'quantity': ci.quantity,
    }).toList();

    if (items.isEmpty) {
      emit(const CartError('Cart is empty'));
      return;
    }

    // 2. Call the backend.
    final data = await orderRemoteDataSource.createOrder(
      orderType: orderType,
      items: items,
      diningSessionId: diningSessionId,
      notes: notes,
    );

    // 3. ✅ Backend returned 201. Safe to clear the cart now.
    clearCart();

    // 4. Hand off to navigation layer (e.g. via emitted state).
    emit(CartOrderPlaced(
      orderId: data['orderId'] as String,
      total: (data['total'] as num).toDouble(),
    ));
  } on DioException catch (e) {
    // ❌ DO NOT clearCart() here. Cart stays intact for retry.
    final message = e.response?.data?['message'] ?? 'Order failed. Please try again.';
    emit(CartError(message));
  } catch (e) {
    // ❌ Unknown failure. Cart still intact.
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

## Why the cart lives in Flutter (not MongoDB)

- Carts are **ephemeral** — they're rarely worth persisting across devices.
- The backend's `POST /api/orders` already validates every product and price, so persisting the cart would be redundant work.
- A server-side cart adds a collection, endpoints, race conditions, and another failure mode for the checkout — none of which actually improve the UX for a single-device ordering app.

If you later need cross-device cart sync (e.g. customer starts an order on web, finishes on mobile), you can add a `carts` collection then. Until that requirement exists, keep it client-side.

## Test cases covered

The backend test suite (`tests/orders.test.ts`) explicitly covers:

1. ✅ TAKEAWAY order created successfully
2. ✅ DINE_IN order created successfully
3. ✅ Empty items array → 400
4. ✅ Invalid productId format → 400
5. ✅ Non-existent productId → 400 PRODUCT_NOT_FOUND
6. ✅ Unavailable product → 400 PRODUCT_UNAVAILABLE
7. ✅ Invalid (negative) quantity → 400
8. ✅ Unauthorized (no JWT) → 401
9. ✅ Non-existing diningSessionId → 404
9b. ✅ DINE_IN without diningSessionId → 400
9c. ✅ DINE_IN against a closed session → 400 SESSION_CLOSED
10. ✅ Client-supplied price fields are rejected (strict schema)
11. ✅ Total = subtotal + (subtotal × TAX_RATE) verified numerically
12. ✅ On failure, no order is persisted (cart can stay intact)
13. ✅ On success, exactly one order is persisted (cart safe to clear)
