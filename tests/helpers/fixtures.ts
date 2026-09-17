import { CategoryModel } from '../../src/models/category.model';
import { ProductModel } from '../../src/models/product.model';
import { TableModel } from '../../src/models/table.model';
import { UserModel } from '../../src/models/user.model';
import { hashPassword } from '../../src/utils/password';
import { ROLES } from '../../src/types';

/**
 * Seed test fixtures into the in-memory database.
 * Returns IDs that tests need.
 */
export async function seedFixtures() {
  const passwordHash = await hashPassword('Password123!');

  const customer = await UserModel.create({
    name: 'Test Customer',
    email: 'customer@test.com',
    passwordHash,
    role: ROLES.CUSTOMER,
  });
  const waiter = await UserModel.create({
    name: 'Test Waiter',
    email: 'waiter@test.com',
    passwordHash,
    role: ROLES.WAITER,
  });
  const kitchen = await UserModel.create({
    name: 'Test Kitchen',
    email: 'kitchen@test.com',
    passwordHash,
    role: ROLES.KITCHEN,
  });

  const starters = await CategoryModel.create({
    name: 'Starters',
    description: 'Test starters',
    isActive: true,
  });
  const mains = await CategoryModel.create({
    name: 'Mains',
    description: 'Test mains',
    isActive: true,
  });

  const soup = await ProductModel.create({
    name: 'Tomato Soup',
    description: 'Creamy',
    price: 50,
    categoryId: starters._id,
    isAvailable: true,
  });
  const burger = await ProductModel.create({
    name: 'Beef Burger',
    description: 'Classic',
    price: 150,
    categoryId: mains._id,
    isAvailable: true,
  });
  const pizza = await ProductModel.create({
    name: 'Margherita Pizza',
    description: 'Italian',
    price: 180,
    categoryId: mains._id,
    isAvailable: true,
  });
  const unavailable = await ProductModel.create({
    name: 'Sold Out Pasta',
    description: 'Unavailable',
    price: 100,
    categoryId: mains._id,
    isAvailable: false,
  });

  const table = await TableModel.create({
    tableNumber: 1,
    capacity: 4,
    status: 'available',
    location: 'Main hall',
  });

  return {
    customer, waiter, kitchen,
    starters, mains,
    soup, burger, pizza, unavailable,
    table,
    password: 'Password123!',
  };
}

export interface TestFixtures {
  customer: { _id: string; email: string; role: string };
  waiter: { _id: string; email: string; role: string };
  kitchen: { _id: string; email: string; role: string };
  starters: { _id: string };
  mains: { _id: string };
  soup: { _id: string; price: number };
  burger: { _id: string; price: number };
  pizza: { _id: string; price: number };
  unavailable: { _id: string; price: number };
  table: { _id: string; tableNumber: number };
  password: string;
}
