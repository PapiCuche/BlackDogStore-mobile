import type { RefreshCoordinator } from '@/auth/refresh-coordinator';
import { companySlug } from '@/config/env';
import type {
  PosContext,
  PosPreview,
  PosProduct,
  PosSale,
  PosSaleInput,
} from '@/domain/internal/pos-types';

import { authenticatedRequest } from '../authenticated-request';
import { ApiError, userFacingMessage } from '../errors';
import {
  InternalAccessDeniedError,
  InternalCapabilityMissingError,
  MissingTenantError,
} from './internal-v1';

/**
 * INTERNAL point of sale — `/api/v1/internal/<company_slug>/sales/pos/…`.
 *
 * Verified on `PapiCuche/BlackDogStore-web` @ `origin/master` `d484e3e`
 * (PR #21) with a live smoke over all five endpoints: context, search, lookup,
 * preview and sale, plus the refusals. Every field name below came back from a
 * real response.
 *
 * ⚠️  NEVER `/api/admin/pos/`. That surface authenticates by cookie and CSRF,
 * and it has no tenant slug in its path — it derives the company from whichever
 * membership the caller happens to have. `api-scope.ts` refuses to send a
 * Bearer token there, and this module has no reason to try.
 *
 * THIS MODULE DECIDES NOTHING ABOUT MONEY. It does not price a basket, apply a
 * promotion, compute a total or check whether the cash is enough. It sends what
 * was scanned and renders what came back. The server runs `create_pos_sale` —
 * the same function the Web till runs — and a parity test on the backend
 * asserts the two surfaces return byte-identical payloads.
 */

function posPath(slug: string): string {
  return `/api/v1/internal/${encodeURIComponent(slug)}/sales/pos`;
}

function requireTenant(): string {
  if (!companySlug) throw new MissingTenantError();
  return companySlug;
}

const str = (v: unknown): string => String(v ?? '');
const num = (v: unknown): number => Number(v ?? 0);

/**
 * The idempotency conflict: this key was already spent on a DIFFERENT basket.
 *
 * Its own class because it is not a failed sale and not bad input. It almost
 * always means the operator edited the basket after a request went out, and the
 * right move is to look at the sale that already exists rather than to try
 * again. The server names that order's id in the body; see the note on
 * `PosInsufficientStockError` for why this app does not carry it yet.
 */
export class PosIdempotencyConflictError extends Error {
  /**
   * The order that already spent this key, or null if the server did not say.
   *
   * Carried since IP2A. It is the difference between "something went wrong" and
   * "that basket is already sold, as order 41" — and the operator standing at
   * the counter is about to decide whether to charge somebody twice.
   */
  readonly existingOrder: number | null;

  constructor(message: string, existingOrder: number | null = null) {
    super(message);
    this.name = 'PosIdempotencyConflictError';
    this.existingOrder = existingOrder;
  }
}

/** One shop that still holds an article this branch ran out of. */
export type PosStockElsewhere = {
  branch: number;
  branchName: string;
  product: number;
  productName: string;
  available: number;
};

/**
 * The shelf does not hold enough.
 *
 * Nobody's mistake: the shop simply does not have it. The whole sale rolled
 * back — nothing was charged and nothing moved — and the next move is to sell
 * what there is or fetch more, not to correct a bad request.
 *
 * THE SERVER ALSO SAYS WHERE THERE IS SOME, and since IP2A this carries it.
 * IP1A left it behind because the only way to reach the response body was to
 * widen `ApiError` — a type every endpoint in the app shares — and that is a
 * much bigger door than this one hint needs. The door is now per-request
 * (`onErrorBody`), so this module reads its own endpoint's body and narrows it
 * here, exactly as the Web console does in `internal-api.ts`.
 */
export class PosInsufficientStockError extends Error {
  /** Other shops with the article. Empty when the server sent none. */
  readonly availableElsewhere: readonly PosStockElsewhere[];

  constructor(message: string, elsewhere: readonly PosStockElsewhere[] = []) {
    super(message);
    this.name = 'PosInsufficientStockError';
    this.availableElsewhere = elsewhere;
  }
}

/** The branch is not one this member may sell from, or does not exist here. */
export class PosBranchRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PosBranchRefusedError';
  }
}

/** The server refused the sale itself — no consent, bad key, short cash. */
export class PosRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PosRejectedError';
  }
}

function rejectionMessage(error: ApiError): string {
  if (error.message && !error.message.startsWith('HTTP ')) return error.message;
  const fromFields = error.fieldErrors
    ? Object.values(error.fieldErrors).flat().filter(Boolean)
    : [];
  if (fromFields.length > 0) return fromFields.join(' ');
  return 'El servidor rechazó la venta.';
}

/**
 * Turn the meaningful HTTP answers into typed outcomes.
 *
 * 404 is the company being closed to this person — never "the sale failed".
 * 403 is a missing capability, which the app answers by redrawing from a fresh
 * context rather than by retrying.
 *
 * 409 has TWO meanings on this surface and the server marks which with a
 * machine-readable `code`. Branching on the code and not on the Spanish is
 * deliberate: the stock message is composed from branch and product names and
 * is not API surface.
 */
/**
 * The structured detail the server attached to a refusal.
 *
 * NARROWED HERE, at the boundary, and nowhere else. The body arrives as
 * `unknown` and leaves as a shape this module declared; a field the server
 * stops sending becomes an empty list rather than an `undefined` that surfaces
 * three components deep.
 */
function elsewhereFrom(body: unknown): PosStockElsewhere[] {
  const rows = (body as { available_elsewhere?: unknown } | null)?.available_elsewhere;
  if (!Array.isArray(rows)) return [];
  return rows.map((raw) => {
    const row = (raw ?? {}) as Record<string, unknown>;
    return {
      branch: num(row.branch),
      branchName: str(row.branch_name),
      product: num(row.product),
      productName: str(row.product_name),
      available: num(row.available),
    };
  });
}

function existingOrderFrom(body: unknown): number | null {
  const id = (body as { existing_order?: unknown } | null)?.existing_order;
  return typeof id === 'number' ? id : null;
}

function translate(error: unknown, body: unknown = null): never {
  if (error instanceof ApiError && error.status === 404) {
    throw new InternalAccessDeniedError();
  }
  if (error instanceof ApiError && error.status === 403) {
    throw new InternalCapabilityMissingError();
  }
  if (error instanceof ApiError && error.status === 409) {
    if (error.code === 'insufficient_stock') {
      throw new PosInsufficientStockError(
        rejectionMessage(error), elsewhereFrom(body),
      );
    }
    if (error.code === 'idempotency_conflict') {
      throw new PosIdempotencyConflictError(
        rejectionMessage(error), existingOrderFrom(body),
      );
    }
    throw new PosRejectedError(rejectionMessage(error));
  }
  if (error instanceof ApiError && error.status === 400) {
    throw new PosRejectedError(rejectionMessage(error));
  }
  throw error;
}

type Deps = { refreshCoordinator: RefreshCoordinator };

function toContext(raw: unknown): PosContext {
  const row = (raw ?? {}) as Record<string, unknown>;
  const company = (row.company ?? {}) as Record<string, unknown>;
  const seller = (row.seller ?? {}) as Record<string, unknown>;
  return {
    company: { id: num(company.id), name: str(company.name) },
    branches: Array.isArray(row.branches)
      ? row.branches.map((b) => {
          const branch = (b ?? {}) as Record<string, unknown>;
          return { id: num(branch.id), name: str(branch.name) };
        })
      : [],
    // NULL IS PRESERVED. It means the server refused to pick a shop, and the
    // screen has to ask — "the first one" is not a decision anybody made.
    defaultBranch: row.default_branch == null ? null : num(row.default_branch),
    paymentMethods: Array.isArray(row.payment_methods)
      ? row.payment_methods.map((m) => {
          const method = (m ?? {}) as Record<string, unknown>;
          return { value: str(method.value), label: str(method.label) };
        })
      : [],
    canManageCustomers: row.can_manage_customers === true,
    canAssignSeller: row.can_assign_seller === true,
    canApplyDiscount: row.can_apply_discount === true,
    canViewCommissions: row.can_view_commissions === true,
    seller: {
      id: num(seller.id),
      username: str(seller.username),
      name: str(seller.name),
    },
    sellers: Array.isArray(row.sellers)
      ? row.sellers.map((s) => {
          const person = (s ?? {}) as Record<string, unknown>;
          return { id: num(person.id), name: str(person.name) };
        })
      : [],
  };
}

function toProduct(raw: unknown): PosProduct {
  const row = (raw ?? {}) as Record<string, unknown>;
  return {
    id: num(row.id),
    name: str(row.name),
    // A decimal STRING. Never parsed: see the module docstring.
    price: str(row.price),
    available: num(row.available),
    barcode: str(row.barcode),
  };
}

function toLines(raw: unknown) {
  return Array.isArray(raw)
    ? raw.map((l) => {
        const line = (l ?? {}) as Record<string, unknown>;
        return {
          product: num(line.product),
          name: str(line.name),
          quantity: num(line.quantity),
          price: str(line.price),
        };
      })
    : [];
}

function toPreview(raw: unknown): PosPreview {
  const row = (raw ?? {}) as Record<string, unknown>;
  const seller = (row.seller ?? {}) as Record<string, unknown>;
  const customer = row.customer as Record<string, unknown> | null;
  const commission = row.commission as Record<string, unknown> | null;
  return {
    subtotal: str(row.subtotal),
    discount: str(row.discount),
    discountSource: str(row.discount_source),
    couponCode: str(row.coupon_code),
    promotions: Array.isArray(row.promotions)
      ? row.promotions.map((p) => {
          const promo = (p ?? {}) as Record<string, unknown>;
          return {
            id: num(promo.id),
            name: str(promo.name),
            applications: num(promo.applications),
            regularAmount: str(promo.regular_amount),
            discountAmount: str(promo.discount_amount),
          };
        })
      : [],
    total: str(row.total),
    seller: {
      id: seller.id == null ? null : num(seller.id),
      name: str(seller.name),
    },
    customer: customer
      ? { id: num(customer.id), name: str(customer.name) }
      : null,
    // Null for anybody without `sales.commissions.view`. A cashier does not
    // need to know what the sale pays a colleague.
    commission: commission
      ? {
          ratePercent: str(commission.rate_percent),
          baseAmount: str(commission.base_amount),
          amount: str(commission.amount),
        }
      : null,
    lines: toLines(row.lines),
  };
}

function toSale(raw: unknown): PosSale {
  const row = (raw ?? {}) as Record<string, unknown>;
  const branch = (row.branch ?? {}) as Record<string, unknown>;
  return {
    orderId: num(row.order_id),
    created: row.created === true,
    subtotal: str(row.subtotal),
    discount: str(row.discount),
    discountSource: str(row.discount_source),
    discountReason: str(row.discount_reason),
    total: str(row.total),
    paidAt: row.paid_at == null ? null : str(row.paid_at),
    paymentMethod: str(row.payment_method),
    amountReceived: row.amount_received == null ? null : str(row.amount_received),
    changeAmount: row.change_amount == null ? null : str(row.change_amount),
    paymentReference: str(row.payment_reference),
    branch: { id: num(branch.id), name: str(branch.name) },
    seller: str(row.seller),
    customer: str(row.customer),
    commission: row.commission == null ? null : str(row.commission),
    items: toLines(row.items),
  };
}

/** What this till may do, asked once when it opens. */
export async function fetchPosContext(
  deps: Deps,
  signal?: AbortSignal,
): Promise<PosContext> {
  try {
    return toContext(
      await authenticatedRequest<unknown>(
        `${posPath(requireTenant())}/context/`,
        { method: 'GET', scope: 'authenticated-v1', signal },
        deps,
      ),
    );
  } catch (error) {
    return translate(error);
  }
}

/**
 * Search by name or by the start of a barcode.
 *
 * The server returns nothing for fewer than two characters — that is where a
 * search stops being a scan of the whole catalogue — and this app does not
 * second-guess it.
 */
export async function searchPosProducts(
  params: { q: string; branch: number },
  deps: Deps,
  signal?: AbortSignal,
): Promise<PosProduct[]> {
  try {
    const payload = await authenticatedRequest<{ results?: unknown }>(
      `${posPath(requireTenant())}/products/search/`,
      {
        method: 'GET',
        scope: 'authenticated-v1',
        query: { q: params.q, branch: params.branch },
        signal,
      },
      deps,
    );
    return Array.isArray(payload?.results) ? payload.results.map(toProduct) : [];
  } catch (error) {
    return translate(error);
  }
}

/**
 * The scanner's endpoint. One code, one article, scoped to this company.
 *
 * A code belonging to ANOTHER company answers exactly like one that does not
 * exist anywhere — so this returns null for both, and the screen says "no
 * encontrado" without implying anything about somebody else's catalogue.
 */
export async function lookupPosProduct(
  params: { code: string; branch: number },
  deps: Deps,
  signal?: AbortSignal,
): Promise<PosProduct | null> {
  try {
    return toProduct(
      await authenticatedRequest<unknown>(
        `${posPath(requireTenant())}/products/lookup/`,
        {
          method: 'GET',
          scope: 'authenticated-v1',
          query: { code: params.code, branch: params.branch },
          signal,
        },
        deps,
      ),
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    return translate(error);
  }
}

/**
 * What this basket costs. THE ONLY SOURCE OF A TOTAL IN THIS APP.
 *
 * It writes nothing, moves no stock and spends no idempotency key — a preview
 * that consumed one would make the sale after it a "retry" and hand back the
 * preview's own answer forever.
 */
export async function previewPosSale(
  input: {
    branch: number;
    items: readonly { product: number; quantity: number }[];
    customer?: number;
    seller?: number;
    paymentMethod?: string;
    couponCode?: string;
    manualDiscountType?: string;
    manualDiscountValue?: string;
    discountReason?: string;
  },
  deps: Deps,
  signal?: AbortSignal,
): Promise<PosPreview> {
  const body: Record<string, unknown> = {
    branch: input.branch,
    items: input.items.map((i) => ({ product: i.product, quantity: i.quantity })),
  };
  if (input.customer !== undefined) body.customer = input.customer;
  if (input.seller !== undefined) body.seller = input.seller;
  if (input.paymentMethod) body.payment_method = input.paymentMethod;
  if (input.couponCode?.trim()) body.coupon_code = input.couponCode.trim();
  if (input.manualDiscountType) {
    body.manual_discount_type = input.manualDiscountType;
    body.manual_discount_value = input.manualDiscountValue;
    if (input.discountReason?.trim()) {
      body.discount_reason = input.discountReason.trim();
    }
  }

  try {
    return toPreview(
      await authenticatedRequest<unknown>(
        `${posPath(requireTenant())}/preview/`,
        { method: 'POST', body, scope: 'authenticated-v1', signal },
        deps,
      ),
    );
  } catch (error) {
    return translate(error);
  }
}

/**
 * Complete the sale.
 *
 * NO RETRY, and the caller must not add one. A replay is safe only because the
 * key makes it safe, and a key the transport re-minted would be no key at all —
 * which on this endpoint means charging somebody twice and taking two units off
 * a shelf.
 *
 * NO PRICE, NO TOTAL, NO DISCOUNT AMOUNT in the body. A backend test sends all
 * of them and gets the server's numbers back unchanged; this app does not even
 * try.
 */
export async function createPosSale(
  input: PosSaleInput,
  deps: Deps,
  signal?: AbortSignal,
): Promise<PosSale> {
  const body: Record<string, unknown> = {
    branch: input.branch,
    items: input.items.map((i) => ({ product: i.product, quantity: i.quantity })),
    payment_method: input.paymentMethod,
    idempotency_key: input.idempotencyKey,
    terms_confirmed: input.termsConfirmed,
  };
  if (input.amountReceived?.trim()) body.amount_received = input.amountReceived.trim();
  if (input.customer !== undefined) body.customer = input.customer;
  if (input.seller !== undefined) body.seller = input.seller;
  if (input.couponCode?.trim()) body.coupon_code = input.couponCode.trim();
  if (input.manualDiscountType) {
    body.manual_discount_type = input.manualDiscountType;
    body.manual_discount_value = input.manualDiscountValue;
    if (input.discountReason?.trim()) {
      body.discount_reason = input.discountReason.trim();
    }
  }
  if (input.paymentReference?.trim()) {
    body.payment_reference = input.paymentReference.trim();
  }
  if (input.saleNotes?.trim()) body.sale_notes = input.saleNotes.trim();

  // The ONLY call in this module that asks for the error body, because it is
  // the only one whose refusals carry structured detail an operator acts on.
  let refusal: unknown = null;

  try {
    return toSale(
      await authenticatedRequest<unknown>(
        `${posPath(requireTenant())}/sales/`,
        {
          method: 'POST',
          body,
          scope: 'authenticated-v1',
          signal,
          onErrorBody: (payload) => { refusal = payload; },
        },
        deps,
      ),
    );
  } catch (error) {
    return translate(error, refusal);
  }
}

/** The message to put in front of the person who pressed the button. */
export function posErrorMessage(error: unknown): string {
  if (
    error instanceof PosIdempotencyConflictError ||
    error instanceof PosInsufficientStockError ||
    error instanceof PosBranchRefusedError ||
    error instanceof PosRejectedError
  ) {
    return error.message;
  }
  return userFacingMessage(error);
}
