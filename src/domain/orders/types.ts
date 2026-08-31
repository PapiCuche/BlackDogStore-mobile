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

/**
 * One line of an order.
 *
 * NARROWED IN M4. This used to hold a whole `Product`, modelled from the legacy
 * serializer that nests one. The customer contract returns three flattened
 * fields instead, and synthesising a `Product` from them would mean inventing
 * an id, a price and a stock figure that nothing verified.
 *
 * The product NAME is also a snapshot in spirit: a customer reading last year's
 * receipt should see what they bought, and the live catalogue may have renamed
 * or removed it since.
 */
export type OrderItem = {
  id: number;
  productName: string;
  /** Empty when the product is gone from the catalogue. Do not deep-link blindly. */
  productSlug: string;
  imageUrl: string;
  quantity: number;
  /** Unit price AT PURCHASE TIME. Not today's price, which moves. */
  price: string;
};

/** `Order.DeliveryMethod` in Django. Empty for orders predating the field. */
export type DeliveryMethod = 'pickup_store' | 'delivery_arequipa' | 'national_shipping' | '';

export type Order = {
  id: number;
  total: string;
  discountAmount: string;
  couponCode: string;
  paymentStatus: PaymentStatus;
  /**
   * BR-003, EXPOSED SINCE M4. The column existed since the backend's Phase 2C;
   * the serializer never returned it, so a customer could see that a payment
   * succeeded and nothing about whether the goods had moved.
   *
   * Still nullable: an order the server cannot classify is rendered as unknown
   * rather than guessed at.
   */
  fulfillmentStatus: FulfillmentStatus | null;
  /**
   * Server-rendered labels.
   *
   * The backend owns this copy because it owns the state machine. A second
   * translation table in the app would drift the day the business renames a
   * status, and the customer would read one word in an email and another in the
   * app for the same order.
   */
  paymentStatusLabel: string;
  fulfillmentStatusLabel: string;
  deliveryMethod: DeliveryMethod;
  deliveryMethodLabel: string;
  paidAt: string | null;
  createdAt: string;
  items: readonly OrderItem[];
};

/*
 * DELIBERATELY ABSENT: `customerName`, `customerEmail`, `paid`.
 *
 * The first two were modelled from the legacy serializer and never rendered.
 * The customer contract omits them on purpose — the buyer typed them, so
 * echoing them back widens what a leaked response is worth and tells the reader
 * nothing new.
 *
 * `paid` was a boolean beside `paymentStatus`, which is the same fact twice and
 * therefore one fact that can disagree with itself. `paymentStatus === 'paid'`
 * is the single answer.
 */

/** Human-facing order number. Django has no separate code field; the PK is it. */
export function orderNumber(order: Pick<Order, 'id'>): string {
  return `#${order.id}`;
}

export function orderItemCount(order: Pick<Order, 'items'>): number {
  return order.items.reduce((total, item) => total + item.quantity, 0);
}
