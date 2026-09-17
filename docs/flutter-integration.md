# Flutter Integration Guide

This document explains how to consume the DineFlow backend from a Flutter application using **Dio** for HTTP.

## Architecture

```
Flutter
   ↓
Dio (HTTP client)
   ↓
REST API (/api/...)
   ↓
JWT Bearer token
   ↓
Express Backend
   ↓
MongoDB
```

## 1. Dependencies

`pubspec.yaml`:

```yaml
dependencies:
  flutter:
    sdk: flutter
  dio: ^5.4.0
  flutter_secure_storage: ^9.0.0   # for storing the JWT securely
  image_picker: ^1.0.7              # for profile / product image uploads
```

## 2. Dio setup with auth interceptor

```dart
// lib/api/api_client.dart
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class ApiClient {
  static const String baseUrl = 'http://10.0.2.2:3000/api'; // 10.0.2.2 = host machine in Android emulator
  // iOS simulator: 'http://localhost:3000/api'
  // Real device: replace with your machine's LAN IP, e.g. http://192.168.1.50:3000/api

  static final ApiClient _instance = ApiClient._internal();
  factory ApiClient() => _instance;
  ApiClient._internal();

  final _storage = const FlutterSecureStorage();
  late final Dio dio = _buildDio();

  Dio _buildDio() {
    final d = Dio(BaseOptions(
      baseUrl: baseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 30),
      headers: {'Content-Type': 'application/json'},
    ));

    d.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await _storage.read(key: 'jwt');
        if (token != null && token.isNotEmpty) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        handler.next(options);
      },
      onError: (e, handler) async {
        // Auto-refresh or logout on 401
        if (e.response?.statusCode == 401) {
          await _storage.delete(key: 'jwt');
          // navigate to login screen...
        }
        handler.next(e);
      },
    ));

    return d;
  }

  Future<void> saveToken(String token) => _storage.write(key: 'jwt', value: token);
  Future<void> clearToken() => _storage.delete(key: 'jwt');
}
```

## 3. Login flow

```dart
// lib/api/auth_service.dart
import 'package:dio/dio.dart';
import 'api_client.dart';

class AuthService {
  final dio = ApiClient().dio;

  Future<Map<String, dynamic>> login(String email, String password) async {
    final res = await dio.post('/auth/login', data: {
      'email': email,
      'password': password,
    });
    final data = res.data['data'];
    await ApiClient().saveToken(data['token']);
    return data; // { user, token }
  }

  Future<Map<String, dynamic>> register({
    required String name,
    required String email,
    required String password,
    String? phone,
  }) async {
    final res = await dio.post('/auth/register', data: {
      'name': name,
      'email': email,
      'password': password,
      if (phone != null) 'phone': phone,
    });
    final data = res.data['data'];
    await ApiClient().saveToken(data['token']);
    return data;
  }

  Future<void> logout() async {
    await ApiClient().clearToken();
  }
}
```

## 4. Adding the Bearer token

The Dio interceptor in §2 automatically adds `Authorization: Bearer <token>` to every request once `saveToken` has been called. You don't need to set the header manually on each call.

## 5. Fetching products

```dart
// lib/api/product_service.dart
class ProductService {
  final dio = ApiClient().dio;

  Future<List<dynamic>> list({String? categoryId, String? search}) async {
    final res = await dio.get('/products', queryParameters: {
      if (categoryId != null) 'categoryId': categoryId,
      if (search != null) 'search': search,
    });
    // res.data shape: { success, message, data: { items: [...], total, page, ... } }
    return res.data['data']['items'] as List;
  }

  Future<Map<String, dynamic>> getById(String id) async {
    final res = await dio.get('/products/$id');
    return res.data['data']['product'];
  }
}
```

## 6. Creating an order

```dart
// lib/api/order_service.dart
class OrderService {
  final dio = ApiClient().dio;

  /// Places a DINE_IN order.
  Future<Map<String, dynamic>> placeDineInOrder({
    required String diningSessionId,
    required List<Map<String, dynamic>> items, // [{ productId, quantity }]
    String? notes,
  }) async {
    final res = await dio.post('/orders', data: {
      'type': 'DINE_IN',
      'diningSessionId': diningSessionId,
      'items': items,
      if (notes != null) 'notes': notes,
    });
    return res.data['data']['order'];
  }

  /// Places a TAKEAWAY order.
  Future<Map<String, dynamic>> placeTakeawayOrder({
    required List<Map<String, dynamic>> items,
    String? notes,
  }) async {
    final res = await dio.post('/orders', data: {
      'type': 'TAKEAWAY',
      'items': items,
      if (notes != null) 'notes': notes,
    });
    return res.data['data']['order'];
  }

  Future<void> cancelOrder(String orderId) async {
    await dio.patch('/orders/$orderId/cancel');
  }
}
```

> **IMPORTANT**: Do NOT include `unitPrice`, `subtotal`, or `total` in the items you send. The backend computes them. If you include them, Zod `strict()` will reject the request.

## 7. Error handling

All errors follow the standard envelope:

```json
{
  "success": false,
  "message": "Product not found",
  "error": "PRODUCT_NOT_FOUND",
  "details": { ... }   // optional
}
```

Recommended pattern:

```dart
try {
  final order = await orderService.placeDineInOrder(...);
  // success
} on DioException catch (e) {
  if (e.response?.statusCode == 401) {
    // token expired / invalid - send user to login
  } else if (e.response?.statusCode == 403) {
    // role not allowed
    final code = e.response?.data['error']; // e.g. 'FORBIDDEN'
    final message = e.response?.data['message'];
    showSnackBar(message ?? 'Forbidden');
  } else if (e.response?.statusCode == 400) {
    // validation error
    final code = e.response?.data['error'];
    if (code == 'PRODUCT_UNAVAILABLE') {
      showSnackBar('One of the items is no longer available.');
    } else if (code == 'VALIDATION_ERROR') {
      final details = e.response?.data['details'];
      // details.fieldErrors contains per-field errors
    }
  } else if (e.response?.statusCode == 404) {
    // not found
  } else if (e.response?.statusCode == 409) {
    // conflict - e.g. duplicate email
  } else if (e.type == DioExceptionType.connectionTimeout) {
    showSnackBar('Network timeout. Please retry.');
  } else {
    showSnackBar('Something went wrong.');
  }
}
```

## 8. Pulling notifications

```dart
class NotificationService {
  final dio = ApiClient().dio;

  Future<Map<String, dynamic>> list({int page = 1, int limit = 50}) async {
    final res = await dio.get('/notifications', queryParameters: {
      'page': page, 'limit': limit,
    });
    return res.data['data']; // { items, total, unreadCount, ... }
  }

  Future<void> markRead(String id) async {
    await dio.patch('/notifications/$id/read');
  }

  Future<void> markAllRead() async {
    await dio.patch('/notifications/read-all');
  }
}
```

For real-time push, you would typically integrate Firebase Cloud Messaging in addition to polling these notifications. This version of DineFlow does NOT require FCM — the in-app `/notifications` endpoint is enough for ordering flow.

## 9. Waiter requests

```dart
class WaiterRequestService {
  final dio = ApiClient().dio;

  Future<Map<String, dynamic>> callWaiter({
    required String diningSessionId,
    String? message,
  }) async {
    final res = await dio.post('/waiter-requests', data: {
      'type': 'CALL_WAITER',
      'diningSessionId': diningSessionId,
      if (message != null) 'message': message,
    });
    return res.data['data']['request'];
  }

  Future<void> requestBill({required String diningSessionId}) async {
    await dio.post('/waiter-requests', data: {
      'type': 'REQUEST_BILL',
      'diningSessionId': diningSessionId,
    });
  }
}
```

## 10. Bills

```dart
class BillService {
  final dio = ApiClient().dio;

  Future<Map<String, dynamic>> getForSession(String diningSessionId) async {
    final res = await dio.get('/bills/dining-sessions/$diningSessionId');
    return res.data['data']['bill'];
  }

  Future<void> markPaid(String billId) async {
    await dio.patch('/bills/$billId/pay');
  }
}
```

## 11. Where to store the JWT

Use `flutter_secure_storage` (iOS Keychain / Android EncryptedSharedPreferences). Do NOT store JWTs in `SharedPreferences` — those are plain XML files on Android.

## 12. Network configuration

| Platform        | Base URL                              |
|-----------------|---------------------------------------|
| Android emulator | `http://10.0.2.2:3000/api`           |
| iOS simulator    | `http://localhost:3000/api`           |
| Physical device  | `http://<your-machine-LAN-IP>:3000/api` |

For Android, also add `<application android:usesCleartextTraffic="true">` in `AndroidManifest.xml` if you're hitting HTTP in development.

## 13. Recommended DTOs

Define Dart classes (or use `freezed`) that mirror the API response shapes:

```dart
class Product {
  final String id;
  final String name;
  final String description;
  final double price;
  final String image;
  final bool isAvailable;
  final Category? category;
  // ...
}

class Order {
  final String id;
  final String orderNumber;
  final String type;
  final List<OrderItem> items;
  final String status;
  final double subtotal;
  final double tax;
  final double total;
  // ...
}
```

## 14. Image uploads

For uploading profile / product / category images from Flutter, see [`docs/image-upload.md`](./image-upload.md).
