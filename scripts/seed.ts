/**
 * Database seed script.
 *
 * Usage:
 *   npm run seed
 *   or: tsx scripts/seed.ts
 *
 * This script is idempotent - it clears existing dev data before seeding.
 * NEVER run against a production database.
 *
 * Creates:
 *  - 4 categories (Starters, Mains, Desserts, Beverages)
 *  - 20 realistic restaurant products
 *  - 10 tables
 *  - 1 customer, 1 waiter, 1 kitchen user (with documented dev passwords)
 *
 * Product images:
 *   For each entry in `productImageMap` below, the named file is read from
 *   `seed-assets/products/` (at the project root) and uploaded to Cloudinary
 *   via the existing `uploadBuffer` service.
 *
 *   - The returned `secure_url` is stored in `Product.image`.
 *   - The returned `public_id` is stored in `Product.imagePublicId`.
 *   - Image binary data is NEVER stored in MongoDB.
 *
 *   Cloudinary uploads use a **deterministic public_id** derived from the
 *   product slug (e.g. `dineflow/products/caesar-salad`). Combined with
 *   `overwrite: true` and `unique_filename: false`, this means re-running
 *   `npm run seed` overwrites the same Cloudinary asset instead of creating
 *   duplicates. (Behavior is implemented in `src/services/cloudinary.service.ts`.)
 *
 *   If Cloudinary credentials are not configured in `.env`, image upload is
 *   skipped entirely (with a clear warning) and products are created with an
 *   empty `image` field. If a product is not in `productImageMap`, or the
 *   mapped file is missing on disk, the product is still created without an
 *   image and the issue is clearly reported in the console. Seeding never
 *   fails because of images.
 */

import fs from 'fs/promises';
import path from 'path';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../src/config/database';
import { UserModel } from '../src/models/user.model';
import { CategoryModel } from '../src/models/category.model';
import { ProductModel } from '../src/models/product.model';
import { TableModel } from '../src/models/table.model';
import { hashPassword } from '../src/utils/password';
import { ROLES } from '../src/types';
import { uploadBuffer } from '../src/services/cloudinary.service';
import { cloudinaryConfigured } from '../src/config/cloudinary';

const DEV_PASSWORD = 'Password123!';

/**
 * Absolute path to the seed-assets/products directory.
 * Resolved relative to this script file so it works regardless of CWD.
 */
const SEED_ASSETS_PRODUCTS_DIR = path.resolve(__dirname, '..', 'seed-assets', 'products');

/** Allowed image extensions (case-insensitive, checked via path.extname). */
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

/**
 * Build a URL-safe slug from a product name.
 * Examples:
 *   "Cream of Mushroom Soup" → "cream-of-mushroom-soup"
 *   "Double Cheese Burger"    → "double-cheese-burger"
 *   "New York Cheesecake"     → "new-york-cheesecake"
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * List image files in the seed-assets/products directory.
 * Returns an empty array if the directory does not exist (so seeding still works).
 */
async function listImageFiles(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir);
    return entries.filter((f) => {
      const ext = path.extname(f).toLowerCase();
      return IMAGE_EXTENSIONS.includes(ext);
    });
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

/**
 * Resolve a target filename against the files actually present on disk,
 * using a CASE-INSENSITIVE comparison. Filenames in `productImageMap` may be
 * written with any casing (e.g. `Coffee.jpg` matches `coffee.JPG`).
 *
 * Returns the on-disk filename (preserving its actual casing) if found,
 * or null otherwise.
 */
function resolveFileCaseInsensitive(onDiskFiles: string[], target: string): string | null {
  const targetLower = target.toLowerCase();
  for (const f of onDiskFiles) {
    if (f.toLowerCase() === targetLower) {
      return f;
    }
  }
  return null;
}

/**
 * Explicit product-name → image-filename mapping.
 *
 * Each key MUST exactly match a `name` in `seedProducts` below. Each value is
 * the image file expected to exist in `seed-assets/products/`. Filenames are
 * matched case-insensitively against the directory contents, so `Coffee.jpg`
 * will still be found if the actual file is `coffee.JPG`.
 *
 * Products not present in this map are created WITHOUT an image (image: '')
 * and a clear warning is logged. This is intentional: we never silently
 * substitute a generic/placeholder image because that would be misleading
 * to customers browsing the menu.
 */
const productImageMap: Record<string, string> = {
  'Classic Beef Burger':  'Classic Burger.jpg',
  'Double Cheese Burger': 'Double Cheeseburger.png',
  'Grilled Salmon':       'grid salmon.jpg',
  'Ribeye Steak':         'Beef Steak.jpg',
  'Caesar Salad':         'Caesar Salad.jpg',
  'Margherita Pizza':     'Margherita Pizza.jpg',
  'Pepperoni Pizza':      'Pepperoni Pizza.jpg',
  'Spaghetti Carbonara':  'Pasta Carbonara.jpg',
  'Tiramisu':             'Tiramisu.jpg',
  'New York Cheesecake':  'cheesecake.png',
  'Chocolate Lava Cake':  'Chocolate Cake.jpg',
  'Fresh Lemonade':       'Fresh Orange Juice.jpg',
  'Iced Coffee':          'Coffee.jpg',
};

interface SeedProduct {
  name: string;
  description: string;
  price: number;
  categoryName: string;
  isAvailable: boolean;
}

const seedProducts: SeedProduct[] = [
  // Starters
  { name: 'Cream of Mushroom Soup', description: 'Wild mushrooms, cream, fresh thyme, toasted croutons', price: 75, categoryName: 'Starters', isAvailable: true },
  { name: 'Bruschetta', description: 'Toasted ciabatta, tomato, basil, garlic, olive oil', price: 90, categoryName: 'Starters', isAvailable: true },
  { name: 'Caesar Salad', description: 'Romaine lettuce, parmesan, anchovy dressing, croutons', price: 110, categoryName: 'Starters', isAvailable: true },
  { name: 'Mozzarella Sticks', description: 'Golden fried mozzarella, marinara dip (6 pcs)', price: 95, categoryName: 'Starters', isAvailable: true },
  { name: 'Chicken Wings', description: 'Spicy buffalo wings, blue cheese dip (8 pcs)', price: 140, categoryName: 'Starters', isAvailable: true },

  // Mains
  { name: 'Classic Beef Burger', description: '180g beef patty, cheddar, lettuce, tomato, brioche bun, fries', price: 220, categoryName: 'Mains', isAvailable: true },
  { name: 'Double Cheese Burger', description: 'Two beef patties, double cheddar, pickles, fries', price: 280, categoryName: 'Mains', isAvailable: true },
  { name: 'Grilled Chicken Sandwich', description: 'Marinated chicken breast, avocado, bacon, ciabatta', price: 195, categoryName: 'Mains', isAvailable: true },
  { name: 'Margherita Pizza', description: 'Tomato, mozzarella, fresh basil, extra virgin olive oil', price: 180, categoryName: 'Mains', isAvailable: true },
  { name: 'Pepperoni Pizza', description: 'Tomato, mozzarella, double pepperoni', price: 210, categoryName: 'Mains', isAvailable: true },
  { name: 'Spaghetti Carbonara', description: 'Pancetta, egg yolk, parmesan, black pepper', price: 165, categoryName: 'Mains', isAvailable: true },
  { name: 'Grilled Salmon', description: 'Atlantic salmon fillet, lemon butter, asparagus, rice', price: 320, categoryName: 'Mains', isAvailable: true },
  { name: 'Ribeye Steak', description: '300g ribeye, herb butter, fries, side salad', price: 480, categoryName: 'Mains', isAvailable: true },
  { name: 'Chicken Alfredo', description: 'Fettuccine, grilled chicken, creamy parmesan sauce', price: 175, categoryName: 'Mains', isAvailable: true },
  { name: 'Vegetable Lasagna', description: 'Layers of pasta, ricotta, spinach, marinara', price: 150, categoryName: 'Mains', isAvailable: false },

  // Desserts
  { name: 'Tiramisu', description: 'Coffee-soaked ladyfingers, mascarpone cream, cocoa', price: 85, categoryName: 'Desserts', isAvailable: true },
  { name: 'New York Cheesecake', description: 'Classic baked cheesecake, berry coulis', price: 95, categoryName: 'Desserts', isAvailable: true },
  { name: 'Chocolate Lava Cake', description: 'Warm chocolate cake, molten center, vanilla ice cream', price: 110, categoryName: 'Desserts', isAvailable: true },

  // Beverages
  { name: 'Fresh Lemonade', description: 'Mint, lemon, sugar, sparkling water', price: 45, categoryName: 'Beverages', isAvailable: true },
  { name: 'Iced Coffee', description: 'Cold brew, milk, simple syrup', price: 55, categoryName: 'Beverages', isAvailable: true },
];

const categories = [
  { name: 'Starters', description: 'Small plates to begin your meal' },
  { name: 'Mains', description: 'Hearty main courses' },
  { name: 'Desserts', description: 'Sweet treats to end on a high note' },
  { name: 'Beverages', description: 'Cold and warm drinks' },
];

async function seed() {
  // eslint-disable-next-line no-console
  console.log('🌱 Connecting to database...');
  await connectDB();

  // Clean collections (dev only)
  // eslint-disable-next-line no-console
  console.log('🧹 Clearing existing data...');
  await Promise.all([
    UserModel.deleteMany({}),
    CategoryModel.deleteMany({}),
    ProductModel.deleteMany({}),
    TableModel.deleteMany({}),
  ]);

  // --- Users ---
  // eslint-disable-next-line no-console
  console.log('👤 Creating users...');
  const passwordHash = await hashPassword(DEV_PASSWORD);
  const customer = await UserModel.create({
    name: 'John Customer',
    email: 'customer@dev.com',
    passwordHash,
    phone: '+201000000001',
    role: ROLES.CUSTOMER,
  });
  const waiter = await UserModel.create({
    name: 'Sara Waiter',
    email: 'waiter@dev.com',
    passwordHash,
    phone: '+201000000002',
    role: ROLES.WAITER,
  });
  const kitchen = await UserModel.create({
    name: 'Karim Kitchen',
    email: 'kitchen@dev.com',
    passwordHash,
    phone: '+201000000003',
    role: ROLES.KITCHEN,
  });

  // --- Categories ---
  // eslint-disable-next-line no-console
  console.log('📂 Creating categories...');
  const categoryDocs = await Promise.all(
    categories.map((c) => CategoryModel.create(c)),
  );
  const categoryByName = new Map(categoryDocs.map((c) => [c.name, c]));

  // --- Products ---
  // eslint-disable-next-line no-console
  console.log('🍔 Creating products...');

  // Discover available product image files ONCE (case-insensitive lookups below).
  const onDiskFiles = await listImageFiles(SEED_ASSETS_PRODUCTS_DIR);

  if (onDiskFiles.length === 0) {
    // eslint-disable-next-line no-console
    console.warn(`   ⚠️  No image files found in ${SEED_ASSETS_PRODUCTS_DIR}`);
    // eslint-disable-next-line no-console
    console.warn('      Products will be created WITHOUT images.');
  } else {
    // eslint-disable-next-line no-console
    console.log(`   📁 Found ${onDiskFiles.length} image file(s) in seed-assets/products/`);
  }

  if (onDiskFiles.length > 0 && !cloudinaryConfigured) {
    // eslint-disable-next-line no-console
    console.warn('   ⚠️  Cloudinary credentials are not configured in .env.');
    // eslint-disable-next-line no-console
    console.warn('      Image upload will be SKIPPED. Set CLOUDINARY_CLOUD_NAME /');
    // eslint-disable-next-line no-console
    console.warn('      CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET to enable image hosting.');
  }

  // Sequential loop (not Promise.all) so the console logs are readable.
  // Each Cloudinary upload is independent; doing them in parallel would
  // interleave logs and make debugging harder.
  const productDocs = [];
  let withImageCount = 0;
  let withoutImageCount = 0;

  for (const p of seedProducts) {
    let image = '';
    let imagePublicId = '';

    const expectedFile = productImageMap[p.name];

    if (!expectedFile) {
      // Product is intentionally not in the image map.
      // eslint-disable-next-line no-console
      console.warn(`   ⏭️  No image mapping for product "${p.name}" - creating without image`);
      withoutImageCount++;
    } else if (onDiskFiles.length === 0) {
      // seed-assets/products/ directory is empty/missing.
      // eslint-disable-next-line no-console
      console.warn(`   ⏭️  Skipping image for "${p.name}" - seed-assets/products/ is empty`);
      withoutImageCount++;
    } else if (!cloudinaryConfigured) {
      // Cloudinary creds missing - we already warned above; just skip the upload.
      withoutImageCount++;
    } else {
      const onDiskName = resolveFileCaseInsensitive(onDiskFiles, expectedFile);
      if (!onDiskName) {
        // eslint-disable-next-line no-console
        console.warn(`   ⚠️  Image file "${expectedFile}" for product "${p.name}" not found in seed-assets/products/`);
        // eslint-disable-next-line no-console
        console.warn(`      Available files: ${onDiskFiles.join(', ')}`);
        withoutImageCount++;
      } else {
        try {
          const absPath = path.join(SEED_ASSETS_PRODUCTS_DIR, onDiskName);
          const deterministicPublicId = slugify(p.name);
          // eslint-disable-next-line no-console
          console.log(`   ⬆️  Uploading image for "${p.name}" from ${onDiskName}...`);
          const buffer = await fs.readFile(absPath);
          const up = await uploadBuffer(buffer, 'products', onDiskName, 'image', {
            publicId: deterministicPublicId,
          });
          image = up.url;
          imagePublicId = up.publicId;
          withImageCount++;
          // eslint-disable-next-line no-console
          console.log(`   ✅ Uploaded: ${image}`);
        } catch (err) {
          // Don't fail the whole seed for one image upload error.
          // eslint-disable-next-line no-console
          console.warn(`   ⚠️  Failed to upload image for "${p.name}" (${onDiskName}): ${(err as Error).message}`);
          withoutImageCount++;
        }
      }
    }

    const created = await ProductModel.create({
      name: p.name,
      description: p.description,
      price: p.price,
      categoryId: categoryByName.get(p.categoryName)!._id,
      isAvailable: p.isAvailable,
      image,
      imagePublicId,
    });
    // eslint-disable-next-line no-console
    console.log(`   🍽️  Product created: ${created.name}  (image: ${created.image ? 'yes' : 'no'})`);
    productDocs.push(created);
  }

  // eslint-disable-next-line no-console
  console.log(`\n   Summary: ${withImageCount} product(s) with image, ${withoutImageCount} without.`);

  // --- Tables ---
  // eslint-disable-next-line no-console
  console.log('🪑 Creating tables...');
  const tableConfigs = [
    { tableNumber: 1, capacity: 2, location: 'Window' },
    { tableNumber: 2, capacity: 2, location: 'Window' },
    { tableNumber: 3, capacity: 4, location: 'Main hall' },
    { tableNumber: 4, capacity: 4, location: 'Main hall' },
    { tableNumber: 5, capacity: 4, location: 'Main hall' },
    { tableNumber: 6, capacity: 6, location: 'Main hall' },
    { tableNumber: 7, capacity: 6, location: 'Patio' },
    { tableNumber: 8, capacity: 8, location: 'Patio' },
    { tableNumber: 9, capacity: 2, location: 'Bar' },
    { tableNumber: 10, capacity: 10, location: 'Private room' },
  ];
  await Promise.all(tableConfigs.map((t) => TableModel.create(t)));

  // eslint-disable-next-line no-console
  console.log('\n✅ Seed complete!');
  // eslint-disable-next-line no-console
  console.log('────────────────────────────────────────');
  // eslint-disable-next-line no-console
  console.log('Test credentials (password for all): ' + DEV_PASSWORD);
  // eslint-disable-next-line no-console
  console.log('────────────────────────────────────────');
  // eslint-disable-next-line no-console
  console.log('Customer : ' + customer.email);
  // eslint-disable-next-line no-console
  console.log('Waiter   : ' + waiter.email);
  // eslint-disable-next-line no-console
  console.log('Kitchen  : ' + kitchen.email);
  // eslint-disable-next-line no-console
  console.log('────────────────────────────────────────');
  // eslint-disable-next-line no-console
  console.log(`Seeded ${categoryDocs.length} categories, ${productDocs.length} products, ${tableConfigs.length} tables`);

  await disconnectDB();
}

seed().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
