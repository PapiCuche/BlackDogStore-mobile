/**
 * The INTERNAL audience's view of a sale.
 *
 * DELIBERATELY NOT `@/domain/orders`. The customer contract is narrow by
 * design: it omits the buyer's phone, document and delivery address, because
 * the buyer typed those and echoing them back only widens what a leaked
 * response is worth.
 *
 * Staff need exactly those fields — someone has to phone the customer and
 * someone has to ship the box. Widening the shared type to carry them would
 * mean a customer screen could one day render a field it was never meant to
 * have, and nothing in the type system would object.
 *
 * So: two audiences, two types. The duplication is the safety property.
 */

import type { FulfillmentStatus, PaymentStatus } from '@/domain/orders/types';

export type { FulfillmentStatus, PaymentStatus };

/** A row in the internal list. Enough to triage, not a data export. */
export type InternalSalesOrder = {
  id: number;
  customerName: string;
  paymentStatus: PaymentStatus;
  paymentStatusLabel: string;
  fulfillmentStatus: FulfillmentStatus | null;
  fulfillmentStatusLabel: string;
  total: string;
  createdAt: string;
  paidAt: string | null;
  itemCount: number;
};

export type InternalSalesOrderItem = {
  id: number;
  productName: string;
  productSlug: string;
  quantity: number;
  price: string;
};

/** One sale, as the people who have to fulfil it need to see it. */
export type InternalSalesOrderDetail = InternalSalesOrder & {
  discountAmount: string;
  couponCode: string;
  customerEmail: string;
  customerPhone: string;
  documentTypeLabel: string;
  documentNumber: string;
  receiptTypeLabel: string;
  deliveryMethod: string;
  deliveryMethodLabel: string;
  addressLine: string;
  city: string;
  district: string;
  reference: string;
  notes: string;
  fulfillmentBranchName: string;
  items: readonly InternalSalesOrderItem[];
  /**
   * The states this actor may set, AS THE SERVER REPORTED THEM.
   *
   * Not computed here, and there is deliberately no transition table in this
   * codebase. A client that derives its own drifts the first time the rule
   * changes, and the drift shows up as a button that fails — which reads as a
   * broken app rather than as a policy.
   */
  availableFulfillmentTransitions: readonly FulfillmentStatus[];
};

export type InternalSalesOrderPage = {
  count: number;
  page: number;
  pageSize: number;
  results: readonly InternalSalesOrder[];
};

/**
 * Who the signed-in person is INSIDE one company, freshly resolved.
 *
 * Fetched when the internal area opens rather than read from the session: the
 * access context minted at login is a snapshot, and a permission revoked an
 * hour ago must not keep a module on screen because the token is still valid.
 */
export type InternalContext = {
  company: { slug: string; name: string };
  member: boolean;
  capabilities: readonly string[];
  isPlatformMaster: boolean;
};

export const CAP_SALES_ORDERS_VIEW = 'sales.orders.view';
export const CAP_SALES_ORDERS_MANAGE = 'sales.orders.manage';

/**
 * Whether to DRAW a module. Never whether to allow an operation.
 *
 * Named `ux` for the same reason as `hasUxCapability` on the session: the
 * server re-resolves capabilities on every request, and a name like `can()`
 * would invite a reader to skip that.
 */
export function hasUxCapability(
  context: InternalContext | null,
  capability: string,
): boolean {
  return context?.capabilities.includes(capability) === true;
}
