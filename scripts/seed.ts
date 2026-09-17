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
 *  - 3 categories (Starters, Mains, Desserts, Beverages)
 *  - 20 realistic restaurant products
 *  - 10 tables
 *  - 1 customer, 1 waiter, 1 kitchen user (with documented dev passwords)
 */

import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../src/config/database';
import { UserModel } from '../src/models/user.model';
import { CategoryModel } from '../src/models/category.model';
import { ProductModel } from '../src/models/product.model';
import { TableModel } from '../src/models/table.model';
import { hashPassword } from '../src/utils/password';
import { ROLES } from '../src/types';

const DEV_PASSWORD = 'Password123!';

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
  const productDocs = await Promise.all(
    seedProducts.map((p) =>
      ProductModel.create({
        name: p.name,
        description: p.description,
        price: p.price,
        categoryId: categoryByName.get(p.categoryName)!._id,
        isAvailable: p.isAvailable,
        image: '',
        imagePublicId: '',
      }),
    ),
  );

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
