import { OrderStatus } from '../types';
import { AppError } from '../errors/AppError';
import { ErrorCodes } from '../errors/errorCodes';

/**
 * Order status state machine.
 *
 *  pending → confirmed → preparing → ready → served → completed
 *
 *  pending / confirmed → cancelled (customer can cancel before preparation)
 *  accepted (preparing and after) cannot be cancelled by customer.
 *
 *  Kitchen can drive: confirmed → preparing → ready
 *  Waiter can drive: ready → served, served → completed
 *
 *  Anyone with the right role can mark cancelled in allowed pre-states.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready'],
  ready: ['served'],
  served: ['completed'],
  completed: [],
  cancelled: [],
};

/**
 * States where a customer is still allowed to cancel the order.
 */
export const CUSTOMER_CANCELLABLE_STATES: OrderStatus[] = ['pending', 'confirmed'];

/**
 * Validates a requested transition from `current` to `target`.
 * Throws AppError on invalid transition.
 */
export function assertTransition(current: OrderStatus, target: OrderStatus): void {
  if (current === target) {
    throw new AppError(
      `Order is already in status "${current}"`,
      400,
      ErrorCodes.INVALID_STATUS_TRANSITION,
    );
  }
  const allowed = ORDER_TRANSITIONS[current];
  if (!allowed || !allowed.includes(target)) {
    throw new AppError(
      `Cannot transition order from "${current}" to "${target}"`,
      400,
      ErrorCodes.INVALID_STATUS_TRANSITION,
    );
  }
}

/** Which roles are permitted to drive a given target status. */
export const STATUS_ROLE_MATRIX: Partial<Record<OrderStatus, 'customer' | 'waiter' | 'kitchen'>> = {
  // customer cancellable states handled via /cancel endpoint
  confirmed: 'kitchen',
  preparing: 'kitchen',
  ready: 'kitchen',
  served: 'waiter',
  completed: 'waiter',
  cancelled: 'customer', // for cancellation endpoint
};

export function isCustomerCancellable(status: OrderStatus): boolean {
  return CUSTOMER_CANCELLABLE_STATES.includes(status);
}
