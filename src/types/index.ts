/**
 * Shared application types and enums.
 *
 * These mirror the Mongoose model enums so services/controllers can use a
 * single source of truth without importing Mongoose models (avoids circular
 * imports in some scenarios).
 */

export type Role = 'customer' | 'waiter' | 'kitchen';

export const ROLES = {
  CUSTOMER: 'customer',
  WAITER: 'waiter',
  KITCHEN: 'kitchen',
} as const;

export type OrderType = 'DINE_IN' | 'TAKEAWAY';

/** Value namespace for OrderType - use these in code instead of `OrderType.X`. */
export const ORDER_TYPES = {
  DINE_IN: 'DINE_IN',
  TAKEAWAY: 'TAKEAWAY',
} as const;

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'served'
  | 'completed'
  | 'cancelled';

/** Value namespace for OrderStatus - use these in code instead of `OrderStatus.X`. */
export const ORDER_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  PREPARING: 'preparing',
  READY: 'ready',
  SERVED: 'served',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const;

export type TableStatus = 'available' | 'occupied' | 'reserved';

export const TABLE_STATUSES = {
  AVAILABLE: 'available',
  OCCUPIED: 'occupied',
  RESERVED: 'reserved',
} as const;

export type DiningSessionStatus = 'active' | 'closed';

export const DINING_SESSION_STATUSES = {
  ACTIVE: 'active',
  CLOSED: 'closed',
} as const;

export type WaiterRequestType = 'CALL_WAITER' | 'REQUEST_BILL' | 'REQUEST_HELP';

export const WAITER_REQUEST_TYPES = {
  CALL_WAITER: 'CALL_WAITER',
  REQUEST_BILL: 'REQUEST_BILL',
  REQUEST_HELP: 'REQUEST_HELP',
} as const;

export type WaiterRequestStatus = 'pending' | 'accepted' | 'completed' | 'cancelled';

export type NotificationType =
  | 'ORDER_UPDATE'
  | 'WAITER_REQUEST'
  | 'PAYMENT'
  | 'SYSTEM';

/** JWT payload structure - kept minimal. */
export interface JwtPayload {
  userId: string;
  role: Role;
}

/** Authenticated request shape used by middlewares and controllers. */
export interface AuthenticatedRequest {
  user: {
    id: string;
    role: Role;
  };
}

/** Generic pagination query. */
export interface PaginationQuery {
  page?: number;
  limit?: number;
}

/** Order item snapshot - price preserved at order time. */
export interface OrderItemSnapshot {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}
