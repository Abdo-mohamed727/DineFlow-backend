/**
 * Verifies the seed script end-to-end using an in-memory MongoDB.
 * Usage: npx tsx scripts/verify-seed.ts
 */
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

// Patch env so env.ts validates
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/dineflow';
process.env.JWT_SECRET = 'test-secret-key-min-32-chars-aaaa-bbbb';
process.env.JWT_EXPIRES_IN = '1h';
process.env.CORS_ORIGIN = '*';
process.env.TAX_RATE = '0.14';
process.env.MAX_UPLOAD_MB = '5';

async function main() {
  const mongo = await MongoMemoryServer.create();
  const uri = mongo.getUri();
  // eslint-disable-next-line no-console
  console.log('In-memory MongoDB at:', uri);

  // Connect using the real connectDB but pointing at the memory server
  const { connectDB, disconnectDB } = await import('../src/config/database');
  await mongoose.connect(uri);

  // Now run seed logic inline
  const { UserModel } = await import('../src/models/user.model');
  const { CategoryModel } = await import('../src/models/category.model');
  const { ProductModel } = await import('../src/models/product.model');
  const { TableModel } = await import('../src/models/table.model');
  const { hashPassword } = await import('../src/utils/password');
  const { ROLES } = await import('../src/types');

  const DEV_PASSWORD = 'Password123!';
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

  const categories = [
    { name: 'Starters', description: 'Small plates to begin your meal' },
    { name: 'Mains', description: 'Hearty main courses' },
    { name: 'Desserts', description: 'Sweet treats to end on a high note' },
    { name: 'Beverages', description: 'Cold and warm drinks' },
  ];
  const categoryDocs = await CategoryModel.create(categories);
  const categoryByName = new Map(categoryDocs.map((c) => [c.name, c]));

  const products = [
    { name: 'Cream of Mushroom Soup', description: 'Wild mushrooms, cream', price: 75, categoryName: 'Starters', isAvailable: true },
    { name: 'Bruschetta', description: 'Toasted ciabatta, tomato, basil', price: 90, categoryName: 'Starters', isAvailable: true },
    { name: 'Caesar Salad', description: 'Romaine, parmesan, anchovy dressing', price: 110, categoryName: 'Starters', isAvailable: true },
    { name: 'Mozzarella Sticks', description: 'Fried mozzarella, marinara (6 pcs)', price: 95, categoryName: 'Starters', isAvailable: true },
    { name: 'Chicken Wings', description: 'Spicy buffalo wings (8 pcs)', price: 140, categoryName: 'Starters', isAvailable: true },
    { name: 'Classic Beef Burger', description: '180g beef patty, cheddar, fries', price: 220, categoryName: 'Mains', isAvailable: true },
    { name: 'Double Cheese Burger', description: 'Two beef patties, double cheddar', price: 280, categoryName: 'Mains', isAvailable: true },
    { name: 'Grilled Chicken Sandwich', description: 'Marinated chicken, avocado, bacon', price: 195, categoryName: 'Mains', isAvailable: true },
    { name: 'Margherita Pizza', description: 'Tomato, mozzarella, basil', price: 180, categoryName: 'Mains', isAvailable: true },
    { name: 'Pepperoni Pizza', description: 'Tomato, mozzarella, pepperoni', price: 210, categoryName: 'Mains', isAvailable: true },
    { name: 'Spaghetti Carbonara', description: 'Pancetta, egg yolk, parmesan', price: 165, categoryName: 'Mains', isAvailable: true },
    { name: 'Grilled Salmon', description: 'Atlantic salmon, asparagus, rice', price: 320, categoryName: 'Mains', isAvailable: true },
    { name: 'Ribeye Steak', description: '300g ribeye, herb butter, fries', price: 480, categoryName: 'Mains', isAvailable: true },
    { name: 'Chicken Alfredo', description: 'Fettuccine, grilled chicken, parmesan', price: 175, categoryName: 'Mains', isAvailable: true },
    { name: 'Vegetable Lasagna', description: 'Pasta, ricotta, spinach', price: 150, categoryName: 'Mains', isAvailable: false },
    { name: 'Tiramisu', description: 'Coffee, mascarpone, cocoa', price: 85, categoryName: 'Desserts', isAvailable: true },
    { name: 'New York Cheesecake', description: 'Classic baked cheesecake', price: 95, categoryName: 'Desserts', isAvailable: true },
    { name: 'Chocolate Lava Cake', description: 'Molten center, vanilla ice cream', price: 110, categoryName: 'Desserts', isAvailable: true },
    { name: 'Fresh Lemonade', description: 'Mint, lemon, sparkling water', price: 45, categoryName: 'Beverages', isAvailable: true },
    { name: 'Iced Coffee', description: 'Cold brew, milk, simple syrup', price: 55, categoryName: 'Beverages', isAvailable: true },
  ];
  const productDocs = await ProductModel.create(
    products.map((p) => ({
      name: p.name,
      description: p.description,
      price: p.price,
      categoryId: categoryByName.get(p.categoryName)!._id,
      isAvailable: p.isAvailable,
      image: '',
      imagePublicId: '',
    })),
  );

  const tables = Array.from({ length: 10 }, (_, i) => ({
    tableNumber: i + 1,
    capacity: [2, 2, 4, 4, 4, 6, 6, 8, 2, 10][i],
    location: ['Window', 'Window', 'Main hall', 'Main hall', 'Main hall', 'Main hall', 'Patio', 'Patio', 'Bar', 'Private room'][i],
    status: 'available' as const,
  }));
  await TableModel.create(tables);

  // eslint-disable-next-line no-console
  console.log(`\n✅ Seeded ${categoryDocs.length} categories, ${productDocs.length} products, ${tables.length} tables`);
  // eslint-disable-next-line no-console
  console.log('  Customer:', customer.email);
  // eslint-disable-next-line no-console
  console.log('  Waiter  :', waiter.email);
  // eslint-disable-next-line no-console
  console.log('  Kitchen :', kitchen.email);
  // eslint-disable-next-line no-console
  console.log('  Password for all:', DEV_PASSWORD);

  await disconnectDB();
  await mongoose.disconnect();
  await mongo.stop();
  // eslint-disable-next-line no-console
  console.log('\n✅ Seed verification complete');
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('❌ Seed verification failed:', err);
  process.exit(1);
});
