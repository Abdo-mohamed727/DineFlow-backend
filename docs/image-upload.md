# Image Upload Guide

DineFlow supports image uploads for:

- **Profile images** (`PATCH /api/users/me/profile-image`)
- **Category images** (`POST/PATCH /api/categories` with `image` field)
- **Product images** (`POST/PATCH /api/products` with `image` field)

## Architecture

```
Flutter ImagePicker
      ↓
File
      ↓
Dio MultipartFile (multipart/form-data)
      ↓
Express + Multer (in-memory)
      ↓
Cloudinary upload_stream
      ↓
Cloudinary returns { secure_url, public_id }
      ↓
Backend stores URL + public_id in MongoDB
```

## Cloudinary Configuration

In `.env`:

```env
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

Get these from your Cloudinary dashboard: <https://cloudinary.com/console>

### Dev mode (no Cloudinary configured)

If the env vars are missing, the backend automatically falls back to a **placeholder data URL** so you can still exercise the upload flow end-to-end without a Cloudinary account. This is dev-only behavior — in production, configure Cloudinary.

## Validation rules

| Rule             | Value                                       |
|------------------|---------------------------------------------|
| Allowed MIME     | `image/jpeg`, `image/png`, `image/webp`     |
| Allowed extension| `.jpg`, `.jpeg`, `.png`, `.webp`           |
| Max file size    | `MAX_UPLOAD_MB` (default 5 MB)              |

Both MIME type and extension are checked — trusting either alone is unsafe. Files failing these checks return `400 INVALID_FILE`.

## Endpoints

### 1. Profile image

`PATCH /api/users/me/profile-image`

**Auth**: required (any role)
**Content-Type**: `multipart/form-data`

Form fields:

| Field | Type |
|-------|------|
| image | file |

Response (200):

```json
{
  "success": true,
  "message": "Profile image updated successfully",
  "data": {
    "user": {
      "id": "...",
      "profileImage": "https://res.cloudinary.com/.../profiles/12345-photo.jpg",
      "profileImagePublicId": "dineflow/profiles/12345-photo"
    }
  }
}
```

When a new image is uploaded, the old Cloudinary asset (if any) is automatically deleted to avoid orphaned files.

### 2. Product image

`POST /api/products` and `PATCH /api/products/:id`

**Auth**: required (`waiter` or `kitchen`)
**Content-Type**: `multipart/form-data`

Form fields:

| Field        | Type    | Required |
|--------------|---------|----------|
| name         | string  | yes (POST) |
| description  | string  | no       |
| price        | number  | yes (POST) |
| categoryId   | string  | yes (POST) |
| isAvailable  | boolean | no       |
| image        | file    | no       |

Response (201):

```json
{
  "success": true,
  "message": "Product created successfully",
  "data": {
    "product": {
      "id": "...",
      "name": "Burger",
      "price": 220,
      "categoryId": "...",
      "isAvailable": true,
      "image": "https://res.cloudinary.com/.../products/...jpg",
      "imagePublicId": "dineflow/products/...jpg"
    }
  }
}
```

### 3. Category image

`POST /api/categories` and `PATCH /api/categories/:id`

**Auth**: required (`waiter` or `kitchen`)
**Content-Type**: `multipart/form-data`

Form fields:

| Field        | Type    | Required |
|--------------|---------|----------|
| name         | string  | yes (POST) |
| description  | string  | no       |
| isActive    | boolean | no       |
| image        | file    | no       |

## Why we store both `image` and `imagePublicId`

- `image` (URL) — used by Flutter to display the image via `Image.network(...)`.
- `imagePublicId` — used by the backend to delete or replace the asset on Cloudinary without parsing the URL.

When a new image is uploaded (or a resource is deleted), the backend calls `cloudinary.uploader.destroy(publicId)` to remove the old asset. This prevents orphaned files accumulating in your Cloudinary account (Cloudinary counts stored assets against your quota).

## Postman testing

### Example: POST /api/products with image

1. Create a new request: `POST http://localhost:3000/api/products`
2. Headers → add `Authorization: Bearer {{kitchenToken}}`
3. Body → select **form-data**
4. Add fields:

| Key         | Type   | Value                            |
|-------------|--------|----------------------------------|
| name        | Text   | Classic Beef Burger              |
| description | Text   | 180g beef patty, cheddar, fries  |
| price       | Text   | 220                              |
| categoryId  | Text   | (paste an existing categoryId)    |
| isAvailable | Text   | true                             |
| image       | File   | (select a JPG / PNG / WEBP file) |

5. Click **Send**. Response should be `201 Created` with the new product including the Cloudinary URL.

> Important: when using `form-data` in Postman, **do not** manually set `Content-Type: multipart/form-data` in the Headers tab — Postman adds it automatically with the correct boundary. Setting it manually breaks the upload.

## Flutter integration

```dart
import 'package:dio/dio.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path/path.dart' as p;
import 'api_client.dart';

class ImageUploadService {
  final dio = ApiClient().dio;

  /// Uploads a profile image picked from the gallery.
  Future<String> uploadProfileImage() async {
    final picker = ImagePicker();
    final xfile = await picker.pickImage(source: ImageSource.gallery, imageQuality: 80);
    if (xfile == null) throw Exception('No image selected');

    final fileName = p.basename(xfile.path);
    final formData = FormData.fromMap({
      'image': await MultipartFile.fromFile(xfile.path, filename: fileName),
    });

    final res = await dio.patch('/users/me/profile-image', data: formData);
    return res.data['data']['user']['profileImage']; // Cloudinary URL
  }

  /// Creates a product with an image.
  Future<Map<String, dynamic>> createProductWithImage({
    required String name,
    required String description,
    required double price,
    required String categoryId,
    bool isAvailable = true,
    XFile? image,
  }) async {
    final Map<String, dynamic> fields = {
      'name': name,
      'description': description,
      'price': price.toString(),
      'categoryId': categoryId,
      'isAvailable': isAvailable ? 'true' : 'false',
    };
    if (image != null) {
      final fileName = p.basename(image.path);
      fields['image'] = await MultipartFile.fromFile(image.path, filename: fileName);
    }
    final formData = FormData.fromMap(fields);
    final res = await dio.post('/products', data: formData);
    return res.data['data']['product'];
  }
}
```

### Important notes for Flutter

1. `image_picker` returns an `XFile`. Use `MultipartFile.fromFile(xfile.path, filename: ...)` to attach it.
2. When sending `multipart/form-data` via Dio, **all fields must be strings** (or MultipartFile). Numbers like `price` and booleans like `isAvailable` must be sent as strings — the backend's Zod schema coerces them back via `z.coerce.number()` and a flexible boolean transform.
3. Always send the file with the original filename — Cloudinary uses it to derive the public_id.
4. Compress images before upload (`imageQuality: 80` in `pickImage`) to keep requests small.
5. Handle the case where the backend returns `400 INVALID_FILE` (wrong type or too large).

## Deleting images

Image deletion happens automatically on the backend when:
- A new image is uploaded to replace the existing one (PATCH with new image file).
- The parent resource (product / category) is deleted via `DELETE`.

You do not need to call any endpoint specifically to delete a Cloudinary asset.
