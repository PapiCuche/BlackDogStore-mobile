import { companySlug } from '@/config/env';
import type { RefreshCoordinator } from '@/auth/refresh-coordinator';
import type {
  FulfillmentStatus,
  InternalContext,
  InternalSalesOrder,
  InternalSalesOrderDetail,
  InternalSalesOrderItem,
  InternalSalesOrderPage,
  PaymentStatus,
} from '@/domain/internal/types';

import { authenticatedRequest } from '../authenticated-request';
import { ApiError } from '../errors';

/**
 * The INTERNAL surface — `/api/v1/internal/<company_slug>/…`.
 *
 * Verified on `PapiCuche/BlackDogStore-web` @ `origin/master` `72042b2` (PR #5).
 *
 * ⚠️  NEVER `/api/admin/`. That surface authenticates by cookie and CSRF, and
 * sending a Bearer token to it would be handing a credential to a contract that
 * never agreed to receive it. `api-scope.ts` refuses to, and this module has no
 * reason to try.
 *
 * WHAT THE SERVER GUARANTEES, so this client does not have to:
 *
 *   No active membership → 404, indistinguishable from an unknown company.
 *   Membership but no capability → 403, on EVERY request, re-resolved.
 *
 * A customer relation opens none of this.
 */

export class MissingTenantError extends Error {
  constructor() {
    super('Esta build no tiene empresa configurada (EXPO_PUBLIC_COMPANY_SLUG).');
    this.name = 'MissingTenantError';
  }
}

/** No membership here — or the company does not exist. The server will not say which. */
export class InternalAccessDeniedError extends Error {
  constructor() {
    super('No tienes acceso al área interna de esta empresa.');
    this.name = 'InternalAccessDeniedError';
  }
}

/** Signed in and a member, but this action needs a capability they lack. */
export class InternalCapabilityMissingError extends Error {
  constructor(message = 'No tienes permiso para esta acción.') {
    super(message);
    this.name = 'InternalCapabilityMissingError';
  }
}

function internalPath(slug: string): string {
  return `/api/v1/internal/${encodeURIComponent(slug)}`;
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

function toPaymentStatus(raw: unknown): PaymentStatus {
  const value = String(raw ?? '');
  // Never guessed into `paid`: that would tell staff money arrived when the
  // server said something this build does not recognise.
  return (PAYMENT_STATUSES.includes(value) ? value : 'pending_payment') as PaymentStatus;
}

function toFulfillmentStatus(raw: unknown): FulfillmentStatus | null {
  const value = String(raw ?? '');
  return FULFILLMENT_STATUSES.includes(value) ? (value as FulfillmentStatus) : null;
}

function toOrder(raw: unknown): InternalSalesOrder {
  const row = raw as Record<string, unknown>;
  return {
    id: Number(row.id),
    customerName: String(row.customer_name ?? ''),
    paymentStatus: toPaymentStatus(row.status),
    paymentStatusLabel: String(row.status_label ?? ''),
    fulfillmentStatus: toFulfillmentStatus(row.fulfillment_status),
    fulfillmentStatusLabel: String(row.fulfillment_status_label ?? ''),
    total: String(row.total ?? '0'),
    createdAt: String(row.created_at ?? ''),
    paidAt: row.paid_at === null || row.paid_at === undefined ? null : String(row.paid_at),
    itemCount: Number(row.item_count ?? 0),
  };
}

function toItem(raw: unknown): InternalSalesOrderItem {
  const row = raw as Record<string, unknown>;
  return {
    id: Number(row.id),
    productName: String(row.product_name ?? ''),
    productSlug: String(row.product_slug ?? ''),
    quantity: Number(row.quantity ?? 0),
    price: String(row.price ?? '0'),
  };
}

export function toOrderDetail(raw: unknown): InternalSalesOrderDetail {
  const row = raw as Record<string, unknown>;
  const transitions = Array.isArray(row.available_fulfillment_transitions)
    ? row.available_fulfillment_transitions
        .map(toFulfillmentStatus)
        .filter((s): s is FulfillmentStatus => s !== null)
    : [];

  return {
    ...toOrder(row),
    discountAmount: String(row.discount_amount ?? '0'),
    couponCode: String(row.coupon_code ?? ''),
    customerEmail: String(row.customer_email ?? ''),
    customerPhone: String(row.customer_phone ?? ''),
    documentTypeLabel: String(row.document_type_label ?? ''),
    documentNumber: String(row.document_number ?? ''),
    receiptTypeLabel: String(row.receipt_type_label ?? ''),
    deliveryMethod: String(row.delivery_method ?? ''),
    deliveryMethodLabel: String(row.delivery_method_label ?? ''),
    addressLine: String(row.address_line ?? ''),
    city: String(row.city ?? ''),
    district: String(row.district ?? ''),
    reference: String(row.reference ?? ''),
    notes: String(row.notes ?? ''),
    fulfillmentBranchName: String(row.fulfillment_branch_name ?? ''),
    items: Array.isArray(row.items) ? row.items.map(toItem) : [],
    availableFulfillmentTransitions: transitions,
  };
}

export function toInternalContext(raw: unknown): InternalContext {
  const row = raw as Record<string, unknown>;
  const company = (row.company ?? {}) as Record<string, unknown>;
  const platform = (row.platform ?? {}) as Record<string, unknown>;
  return {
    company: { slug: String(company.slug ?? ''), name: String(company.name ?? '') },
    // Strictly `=== true`: an absent flag is not a grant.
    member: row.member === true,
    capabilities: Array.isArray(row.capabilities)
      ? row.capabilities.filter((c): c is string => typeof c === 'string')
      : [],
    isPlatformMaster: platform.is_master === true,
  };
}

/** Turn the two meaningful HTTP answers into the two typed outcomes. */
function translate(error: unknown): never {
  if (error instanceof ApiError && error.status === 404) throw new InternalAccessDeniedError();
  if (error instanceof ApiError && error.status === 403) {
    throw new InternalCapabilityMissingError();
  }
  throw error;
}

/**
 * Who this person is inside the company, RIGHT NOW.
 *
 * The fresh answer. The session's access context decides whether to OFFER the
 * internal area; this decides whether it still opens.
 */
export async function fetchInternalContext(
  deps: { refreshCoordinator: RefreshCoordinator },
  signal?: AbortSignal,
): Promise<InternalContext> {
  try {
    return toInternalContext(
      await authenticatedRequest<unknown>(
        `${internalPath(requireTenant())}/context/`,
        { scope: 'authenticated-v1', signal },
        deps,
      ),
    );
  } catch (error) {
    return translate(error);
  }
}

export type InternalOrderQuery = {
  search?: string;
  status?: string;
  fulfillment_status?: string;
  page?: number;
  page_size?: number;
};

export async function fetchInternalOrders(
  query: InternalOrderQuery,
  deps: { refreshCoordinator: RefreshCoordinator },
  signal?: AbortSignal,
): Promise<InternalSalesOrderPage> {
  try {
    const raw = await authenticatedRequest<Record<string, unknown>>(
      `${internalPath(requireTenant())}/orders/`,
      { scope: 'authenticated-v1', query, signal },
      deps,
    );
    return {
      count: Number(raw.count ?? 0),
      page: Number(raw.page ?? 1),
      pageSize: Number(raw.page_size ?? 0),
      results: Array.isArray(raw.results) ? raw.results.map(toOrder) : [],
    };
  } catch (error) {
    return translate(error);
  }
}

export async function fetchInternalOrder(
  id: number,
  deps: { refreshCoordinator: RefreshCoordinator },
  signal?: AbortSignal,
): Promise<InternalSalesOrderDetail> {
  try {
    return toOrderDetail(
      await authenticatedRequest<unknown>(
        `${internalPath(requireTenant())}/orders/${encodeURIComponent(String(id))}/`,
        { scope: 'authenticated-v1', signal },
        deps,
      ),
    );
  } catch (error) {
    return translate(error);
  }
}

/**
 * Move an order's fulfilment state.
 *
 * The server re-checks `sales.orders.manage` regardless of what the UI drew, so
 * a 403 here is a normal outcome — the permission may have been revoked between
 * rendering the button and pressing it.
 */
export async function patchInternalOrderFulfillment(
  input: { id: number; fulfillmentStatus: FulfillmentStatus; note?: string },
  deps: { refreshCoordinator: RefreshCoordinator },
  signal?: AbortSignal,
): Promise<InternalSalesOrderDetail> {
  const body: Record<string, unknown> = { fulfillment_status: input.fulfillmentStatus };
  if (input.note) body.note = input.note;

  try {
    return toOrderDetail(
      await authenticatedRequest<unknown>(
        `${internalPath(requireTenant())}/orders/${encodeURIComponent(String(input.id))}/fulfillment/`,
        { method: 'PATCH', body, scope: 'authenticated-v1', signal },
        deps,
      ),
    );
  } catch (error) {
    return translate(error);
  }
}
