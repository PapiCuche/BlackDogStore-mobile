import type { Product } from '@/domain/products/types';

/**
 * Orders.
 *
 * VERIFIED against `Order` / `OrderSerializer` in the Web repository.
 *
 * THE DISTINCTION THAT MATTERS: Django models payment and fulfilment as two
 * INDEPENDENT fields (`status` and `fulfillment_status`). A paid order can
 * still be `pending`; a delivered order can be `refunded`. Collapsing them into
 * one "order status" is the single most common way to show a customer the wrong
 * thing, so this module keeps them apart and the UI renders two badges.
 *
 * An `Order` is also NOT a repair. Repairs are a different lifecycle entirely
 * and live in `@/domain/repairs`.
 */

/** `Order.Status` in Django — the PAYMENT lifecycle. */
export type PaymentStatus =
  | 'pending_payment'
  | 'paid'
  | 'failed'
  | 'cancelled'
  | 'expired'
  | 'refunded';

/** `Order.FulfillmentStatus` in Django — the OPERATIONAL lifecycle. */
export type FulfillmentStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready_for_pickup'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

export type OrderItem = {
  id: number;
  product: Product;
  quantity: number;
  /** Unit price AT PURCHASE TIME. Not `product.price`, which moves. */
  price: string;
};

export type Order = {
  id: number;
  customerName: string;
  customerEmail: string;
  total: string;
  discountAmount: string;
  couponCode: string;
  paymentStatus: PaymentStatus;
  /**
   * NOT currently exposed by `OrderSerializer` — see BR-003. Null means "the
   * backend did not tell us", which the UI renders as unknown rather than
   * guessing `pending`.
   */
  fulfillmentStatus: FulfillmentStatus | null;
  paid: boolean;
  paidAt: string | null;
  createdAt: string;
  items: readonly OrderItem[];
};

/** Human-facing order number. Django has no separate code field; the PK is it. */
export function orderNumber(order: Pick<Order, 'id'>): string {
  return `#${order.id}`;
}

export function orderItemCount(order: Pick<Order, 'items'>): number {
  return order.items.reduce((total, item) => total + item.quantity, 0);
}
