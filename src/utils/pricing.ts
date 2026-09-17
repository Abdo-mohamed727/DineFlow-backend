import { env } from '../config/env';

/**
 * Order tax & totals calculation. Centralized so Flutter never controls totals.
 */
export interface TotalsInput {
  items: Array<{ unitPrice: number; quantity: number }>;
  notes?: string;
}

export interface TotalsResult {
  subtotal: number;
  taxRate: number;
  tax: number;
  total: number;
}

/** Round to 2 decimals - money in fiat is always 2dp. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function calculateTotals(input: TotalsInput): TotalsResult {
  const subtotal = input.items.reduce(
    (sum, it) => sum + it.unitPrice * it.quantity,
    0,
  );
  const tax = subtotal * env.TAX_RATE;
  const total = subtotal + tax;
  return {
    subtotal: round2(subtotal),
    taxRate: env.TAX_RATE,
    tax: round2(tax),
    total: round2(total),
  };
}
