import { companySlug } from '@/config/env';
import type { DeliveryMethod, FulfillmentStatus, Order, OrderItem, PaymentStatus } from '@/domain/orders/types';

import type { RefreshCoordinator } from '@/auth/refresh-coordinator';

import { authenticatedRequest } from '../authenticated-request';
import { ApiError } from '../errors';

/**
 * The CUSTOMER surface — `/api/v1/customer/<company_slug>/orders/`.
 *
 * Verified on `PapiCuche/BlackDogStore-web` @ `origin/master` `b253156`
 * (PR #3, "feat(api): add scoped v1 customer orders").
 *
 * THREE AUDIENCES, THREE SURFACES (DEC-API-001):
 *
 *   storefront/  PUBLIC    anonymous, no credentials — `catalog-v1.ts`
 *   customer/    CUSTOMER  this file. The caller's OWN records
 *   internal/    INTERNAL  staff under a capability — does not exist yet
 *
 * WHAT THE SERVER GUARANTEES, so this client does not have to:
 *
 *   Ownership is `Order.user` OR `Order.customer.user`, never email. A member of
 *   staff who is not also a client gets 404 here, whatever their role. Unknown
 *   company, inactive company and "not a client here" answer identically.
 *
 * This client therefore does NO filtering of its own. A client that trims
 * someone else's rows out of a response has already received them.
 */

/**
 * Raised when a build with no resolved tenant asks for private records.
 *
 * Distinct from `ApiError`: nothing was wrong with the network and nothing was
 * sent. Guessing a storefront here would be asking one company's server for
 * another company's orders.
 */
export class MissingTenantError extends Error {
  constructor() {
    super(
      'Esta build no tiene empresa configurada (EXPO_PUBLIC_COMPANY_SLUG). ' +
        'No se pueden pedir pedidos sin saber de qué empresa.',
    );
    this.name = 'MissingTenantError';
  }
}

function customerPath(slug: string): string {
  // Encoded even though the slug comes from validated configuration: the day
  // someone widens `resolveTenant` to accept a runtime value, this line is
  // already correct rather than one review away from a path traversal.
  return `/api/v1/customer/${encodeURIComponent(slug)}`;
}

function requireTenant(): string {
  if (!companySlug) throw new MissingTenantError();
  return companySlug;
}

const PAYMENT_STATUSES: readonly string[] = [
  'pending_payment', 'paid', 'failed', 'cancelled', 'expired', 'refunded',
];
const FULFILLMENT_STATUSES: readonly string[] = [
  'pending', 'confirmed', 'preparing', 'ready_for_pickup', 'shipped', 'delivered', 'cancelled',
];
const DELIVERY_METHODS: readonly string[] = [
  'pickup_store', 'delivery_arequipa', 'national_shipping',
];

function toPaymentStatus(raw: unknown): PaymentStatus {
  const value = String(raw ?? '');
  // An unrecognised state is NOT guessed into `paid`. `pending_payment` is the
  // reading that cannot mislead someone about whether their money moved.
  return (PAYMENT_STATUSES.includes(value) ? value : 'pending_payment') as PaymentStatus;
}

function toFulfillmentStatus(raw: unknown): FulfillmentStatus | null {
  const value = String(raw ?? '');
  // Null rather than a default: "we do not know where your order is" is honest,
  // and "pending" would be a claim about the warehouse.
  return FULFILLMENT_STATUSES.includes(value) ? (value as FulfillmentStatus) : null;
}

function toDeliveryMethod(raw: unknown): DeliveryMethod {
  const value = String(raw ?? '');
  return (DELIVERY_METHODS.includes(value) ? value : '') as DeliveryMethod;
}

function toOrderItem(raw: unknown): OrderItem {
  const row = raw as Record<string, unknown>;
  return {
    id: Number(row.id),
    productName: String(row.product_name ?? ''),
    productSlug: String(row.product_slug ?? ''),
    imageUrl: String(row.image_url ?? ''),
    quantity: Number(row.quantity ?? 0),
    price: String(row.price ?? '0'),
  };
}

function toOrder(raw: unknown): Order {
  const row = raw as Record<string, unknown>;
  const items = Array.isArray(row.items) ? row.items.map(toOrderItem) : [];
  return {
    id: Number(row.id),
    total: String(row.total ?? '0'),
    discountAmount: String(row.discount_amount ?? '0'),
    couponCode: String(row.coupon_code ?? ''),
    paymentStatus: toPaymentStatus(row.status),
    paymentStatusLabel: String(row.status_label ?? ''),
    fulfillmentStatus: toFulfillmentStatus(row.fulfillment_status),
    fulfillmentStatusLabel: String(row.fulfillment_status_label ?? ''),
    deliveryMethod: toDeliveryMethod(row.delivery_method),
    deliveryMethodLabel: String(row.delivery_method_label ?? ''),
    paidAt: row.paid_at === null || row.paid_at === undefined ? null : String(row.paid_at),
    createdAt: String(row.created_at ?? ''),
    items,
  };
}

/**
 * The caller's own orders in this build's company.
 *
 * `authenticatedRequest`, not `request`: this needs the Bearer token and the
 * 401 → refresh → retry-once pipeline M1 built. `api-scope.ts` allows a Bearer
 * only under `/api/v1/`, which is where this lives.
 */
export async function fetchCustomerOrders(
  deps: { refreshCoordinator: RefreshCoordinator },
  signal?: AbortSignal,
): Promise<Order[]> {
  try {
    const rows = await authenticatedRequest<unknown[]>(
      `${customerPath(requireTenant())}/orders/`,
      { scope: 'authenticated-v1', signal },
      deps,
    );
    return Array.isArray(rows) ? rows.map(toOrder) : [];
  } catch (error) {
    // A 404 on the LIST means "unknown company, inactive company, or you are
    // not a client here" — the server makes those three indistinguishable on
    // purpose, so that a valid login cannot map the platform's tenants.
    //
    // An empty list is therefore the faithful reading. Inventing a distinction
    // the contract refuses to make would be the client second-guessing a
    // deliberate security decision, and the user-facing answer is the same
    // either way: there is nothing of yours here.
    if (error instanceof ApiError && error.status === 404) return [];
    throw error;
  }
}

/**
 * One order.
 *
 * A 404 becomes null. On this surface a 404 means "not yours, not here, or not
 * at all" — the server refuses to say which, deliberately — and all three read
 * to a customer as "this order is not available", which is an empty state the
 * screen already renders.
 */
export async function fetchCustomerOrderById(
  id: number,
  deps: { refreshCoordinator: RefreshCoordinator },
  signal?: AbortSignal,
): Promise<Order | null> {
  const path = `${customerPath(requireTenant())}/orders/${encodeURIComponent(String(id))}/`;
  try {
    return toOrder(
      await authenticatedRequest<unknown>(path, { scope: 'authenticated-v1', signal }, deps),
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}
