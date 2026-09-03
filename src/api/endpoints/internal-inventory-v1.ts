import { companySlug } from '@/config/env';
import type { RefreshCoordinator } from '@/auth/refresh-coordinator';
import type {
  InternalBranch,
  InternalInventorySummary,
  InternalMovementPage,
  InternalStockItem,
  InternalStockMovement,
  InternalStockPage,
  StockAdjustmentInput,
  StockTransfer,
  TransferCreateInput,
  TransferItem,
} from '@/domain/internal/inventory-types';

import { authenticatedRequest } from '../authenticated-request';
import { ApiError, userFacingMessage } from '../errors';
import {
  InternalAccessDeniedError,
  InternalCapabilityMissingError,
  MissingTenantError,
} from './internal-v1';

/**
 * INTERNAL inventory — `/api/v1/internal/<company_slug>/inventory/…`.
 *
 * Verified on `PapiCuche/BlackDogStore-web` @ `origin/master` `fd6ea01` (PR #6)
 * with a live smoke: every field name below came back from a real response.
 *
 * ⚠️  NEVER `/api/admin/inventory/`. That surface authenticates by cookie and
 * CSRF; sending it a Bearer token would hand a credential to a contract that
 * never agreed to receive it. `api-scope.ts` refuses, and this module has no
 * reason to try.
 *
 * THREE GATES, all the server's:
 *
 *   No active membership       → 404, indistinguishable from an unknown company
 *   Membership, no capability  → 403, re-resolved on EVERY request
 *   A branch outside the grant → 404, NOT 403
 *
 * The third one is why `BranchOutOfScopeError` exists as its own outcome. A 403
 * there would confirm the branch is real, and an employee could sweep ids until
 * they had their company's branch map. The app must not paper over that with a
 * "no tienes permiso" message that implies the branch exists.
 */

/** The selected branch is not one this member may operate — or is not a branch. */
export class BranchOutOfScopeError extends Error {
  constructor() {
    super('Esa sucursal no está disponible para tu cuenta.');
    this.name = 'BranchOutOfScopeError';
  }
}

/** The server refused the movement itself: not enough stock, or an invalid type. */
export class StockAdjustmentRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StockAdjustmentRejectedError';
  }
}

function inventoryPath(slug: string): string {
  return `/api/v1/internal/${encodeURIComponent(slug)}/inventory`;
}

function requireTenant(): string {
  if (!companySlug) throw new MissingTenantError();
  return companySlug;
}

function toBranch(raw: unknown): InternalBranch {
  const row = raw as Record<string, unknown>;
  return { id: Number(row.id), name: String(row.name ?? '') };
}

export function toSummary(raw: unknown): InternalInventorySummary {
  const row = raw as Record<string, unknown>;
  return {
    totalProducts: Number(row.total_products ?? 0),
    activeProducts: Number(row.active_products ?? 0),
    outOfStockCount: Number(row.out_of_stock_count ?? 0),
    lowStockCount: Number(row.low_stock_count ?? 0),
    stockedCount: Number(row.stocked_count ?? 0),
    totalUnits: Number(row.total_units ?? 0),
    inventoryValue: String(row.inventory_value ?? '0'),
    // Carried verbatim rather than assumed: the day the backend gains a cost
    // model, a screen that hardcoded "precio de venta" would start lying.
    inventoryValueBasis: String(row.inventory_value_basis ?? ''),
    lowStockThreshold: Number(row.low_stock_threshold ?? 0),
    branch: row.branch ? toBranch(row.branch) : null,
    availableBranches: Array.isArray(row.available_branches)
      ? row.available_branches.map(toBranch)
      : [],
  };
}

export function toStockItem(raw: unknown): InternalStockItem {
  const row = raw as Record<string, unknown>;
  return {
    id: Number(row.id),
    productName: String(row.product_name ?? ''),
    productSlug: String(row.product_slug ?? ''),
    branchId: Number(row.branch_id ?? 0),
    branchName: String(row.branch_name ?? ''),
    quantity: Number(row.quantity ?? 0),
    minimumStock: Number(row.minimum_stock ?? 0),
    // Strictly `=== true`. The server decides what "low" means — it owns the
    // threshold and the per-product minimum — and an absent flag is not a yes.
    isLowStock: row.is_low_stock === true,
    isOutOfStock: row.is_out_of_stock === true,
    updatedAt: String(row.updated_at ?? ''),
  };
}

export function toMovement(raw: unknown): InternalStockMovement {
  const row = raw as Record<string, unknown>;
  return {
    id: Number(row.id),
    productName: String(row.product_name ?? ''),
    productSlug: String(row.product_slug ?? ''),
    branchId: Number(row.branch_id ?? 0),
    branchName: String(row.branch_name ?? ''),
    movementType: String(row.movement_type ?? ''),
    movementTypeLabel: String(row.movement_type_label ?? ''),
    quantity: Number(row.quantity ?? 0),
    stockBefore: Number(row.stock_before ?? 0),
    stockAfter: Number(row.stock_after ?? 0),
    reason: String(row.reason ?? ''),
    referenceType: String(row.reference_type ?? ''),
    actorName: String(row.actor_name ?? ''),
    createdAt: String(row.created_at ?? ''),
  };
}

/**
 * Turn the meaningful HTTP answers into typed outcomes.
 *
 * `hadBranch` is what separates the two 404s. Without a branch selected, a 404
 * means the company is closed to this person. With one, it means that branch is
 * not theirs — and the app must say THAT, because telling someone their whole
 * membership vanished when they merely tapped a shop they cannot reach would be
 * the wrong alarm.
 */
function translate(error: unknown, hadBranch: boolean): never {
  if (error instanceof ApiError && error.status === 404) {
    throw hadBranch ? new BranchOutOfScopeError() : new InternalAccessDeniedError();
  }
  if (error instanceof ApiError && error.status === 403) {
    throw new InternalCapabilityMissingError();
  }
  throw error;
}

type Deps = { refreshCoordinator: RefreshCoordinator };

export async function fetchInventorySummary(
  params: { branchId?: number } = {},
  deps: Deps,
  signal?: AbortSignal,
): Promise<InternalInventorySummary> {
  const query = params.branchId === undefined ? {} : { branch_id: params.branchId };
  try {
    return toSummary(
      await authenticatedRequest<unknown>(
        `${inventoryPath(requireTenant())}/summary/`,
        { scope: 'authenticated-v1', query, signal },
        deps,
      ),
    );
  } catch (error) {
    return translate(error, params.branchId !== undefined);
  }
}

export type InventoryStockQuery = {
  branchId?: number;
  search?: string;
  lowStock?: boolean;
  outOfStock?: boolean;
  page?: number;
  pageSize?: number;
};

/** Only the filters the SERVER understands. An unknown key would be ignored silently. */
function stockQuery(query: InventoryStockQuery): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  if (query.branchId !== undefined) params.branch_id = query.branchId;
  if (query.search) params.search = query.search;
  if (query.lowStock) params.low_stock = 'true';
  if (query.outOfStock) params.out_of_stock = 'true';
  if (query.page !== undefined) params.page = query.page;
  if (query.pageSize !== undefined) params.page_size = query.pageSize;
  return params;
}

export async function fetchInventoryStock(
  query: InventoryStockQuery,
  deps: Deps,
  signal?: AbortSignal,
): Promise<InternalStockPage> {
  try {
    const raw = await authenticatedRequest<Record<string, unknown>>(
      `${inventoryPath(requireTenant())}/stock/`,
      { scope: 'authenticated-v1', query: stockQuery(query), signal },
      deps,
    );
    return {
      count: Number(raw.count ?? 0),
      page: Number(raw.page ?? 1),
      pageSize: Number(raw.page_size ?? 0),
      results: Array.isArray(raw.results) ? raw.results.map(toStockItem) : [],
    };
  } catch (error) {
    return translate(error, query.branchId !== undefined);
  }
}

export type InventoryMovementQuery = {
  branchId?: number;
  productSlug?: string;
  movementType?: string;
  page?: number;
  pageSize?: number;
};

export async function fetchInventoryMovements(
  query: InventoryMovementQuery,
  deps: Deps,
  signal?: AbortSignal,
): Promise<InternalMovementPage> {
  const params: Record<string, string | number> = {};
  if (query.branchId !== undefined) params.branch_id = query.branchId;
  if (query.productSlug) params.product_slug = query.productSlug;
  if (query.movementType) params.movement_type = query.movementType;
  if (query.page !== undefined) params.page = query.page;
  if (query.pageSize !== undefined) params.page_size = query.pageSize;

  try {
    const raw = await authenticatedRequest<Record<string, unknown>>(
      `${inventoryPath(requireTenant())}/movements/`,
      { scope: 'authenticated-v1', query: params, signal },
      deps,
    );
    return {
      count: Number(raw.count ?? 0),
      page: Number(raw.page ?? 1),
      pageSize: Number(raw.page_size ?? 0),
      results: Array.isArray(raw.results) ? raw.results.map(toMovement) : [],
    };
  } catch (error) {
    return translate(error, query.branchId !== undefined);
  }
}

/**
 * Record a manual entry or exit.
 *
 * The body is the INTENT and nothing else. `quantity` is always positive; the
 * server reads the sign off `movement_type`, takes the row lock, writes the
 * Kardex line and returns the movement it created — which is why the resulting
 * stock arrives as `stockAfter` on the response rather than being computed here.
 *
 * A 400 is a real business answer ("no hay stock suficiente"), not a bug, so it
 * becomes its own error type instead of a generic failure.
 */
/**
 * The server's own words, when it has any.
 *
 * A domain refusal arrives as `{"detail": "No hay stock suficiente…"}` and is
 * the most useful thing to show. A serializer refusal arrives as
 * `{"field": ["…"]}`, where the client's generic message ("HTTP 400") is worse
 * than the field's. Neither is invented here.
 */
function rejectionMessage(error: ApiError): string {
  const fromFields = error.fieldErrors
    ? Object.values(error.fieldErrors).flat().filter(Boolean)
    : [];
  if (error.message && !error.message.startsWith('HTTP ')) return error.message;
  if (fromFields.length > 0) return fromFields.join(' ');
  return 'El servidor rechazó el movimiento.';
}

export async function postStockAdjustment(
  input: StockAdjustmentInput,
  deps: Deps,
  signal?: AbortSignal,
): Promise<InternalStockMovement> {
  try {
    return toMovement(
      await authenticatedRequest<unknown>(
        `${inventoryPath(requireTenant())}/adjustments/`,
        {
          method: 'POST',
          body: {
            product_slug: input.productSlug,
            branch_id: input.branchId,
            movement_type: input.movementType,
            quantity: input.quantity,
            reason: input.reason,
          },
          scope: 'authenticated-v1',
          signal,
        },
        deps,
      ),
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 400) {
      throw new StockAdjustmentRejectedError(rejectionMessage(error));
    }
    // A branch is ALWAYS sent here, so a 404 is always "not your branch" —
    // or a product slug that does not exist in this company, which the server
    // reports the same way and for the same reason.
    return translate(error, true);
  }
}

/**
 * The message to put in front of the person who pressed the button.
 *
 * `userFacingMessage` deliberately swallows `error.message` for API failures —
 * a Django traceback in a toast is both confusing and a small disclosure. But
 * the three outcomes below are written BY the domain FOR the operator ("no hay
 * stock suficiente", "esa sucursal no es tuya"), and replacing them with
 * "ocurrió un error inesperado" would hide the only useful thing the server
 * said.
 */
export function inventoryErrorMessage(error: unknown): string {
  if (
    error instanceof StockAdjustmentRejectedError ||
    error instanceof BranchOutOfScopeError ||
    error instanceof InternalCapabilityMissingError ||
    error instanceof InternalAccessDeniedError
  ) {
    return error.message;
  }
  return userFacingMessage(error);
}

export { InternalAccessDeniedError, InternalCapabilityMissingError, MissingTenantError };

// ---------------------------------------------------------------------------
// IP1B — inter-branch transfers
// ---------------------------------------------------------------------------
//
// Verified on `origin/master` `b38ec26` (PR #22) with a live smoke over all six
// routes: the whole document, the stock at each transition, and every refusal.
//
// ONE FUNCTION PER TRANSITION, mirroring the server. There is no
// `setTransferStatus` here because there is no such endpoint: dispatching takes
// units off a shelf, receiving puts them on another, cancelling closes a
// document that moved nothing. A single "set the status" call would let this
// app assert `received` for stock that never left.

function toTransferItem(raw: unknown): TransferItem {
  const row = (raw ?? {}) as Record<string, unknown>;
  return {
    id: Number(row.id ?? 0),
    product: Number(row.product ?? 0),
    productName: String(row.product_name ?? ''),
    productSlug: String(row.product_slug ?? ''),
    quantity: Number(row.quantity ?? 0),
  };
}

function toTransfer(raw: unknown): StockTransfer {
  const row = (raw ?? {}) as Record<string, unknown>;
  return {
    id: Number(row.id ?? 0),
    sourceBranch: Number(row.source_branch ?? 0),
    sourceBranchName: String(row.source_branch_name ?? ''),
    destinationBranch: Number(row.destination_branch ?? 0),
    destinationBranchName: String(row.destination_branch_name ?? ''),
    // Carried through as it arrived. This app compares it to draw a button and
    // never to decide what is legal — the server owns the machine.
    status: String(row.status ?? ''),
    statusLabel: String(row.status_label ?? row.status ?? ''),
    reason: String(row.reason ?? ''),
    reference: String(row.reference ?? ''),
    items: Array.isArray(row.items) ? row.items.map(toTransferItem) : [],
    totalUnits: Number(row.total_units ?? 0),
    createdByUsername:
      row.created_by_username == null ? null : String(row.created_by_username),
    createdAt: String(row.created_at ?? ''),
    dispatchedAt: row.dispatched_at == null ? null : String(row.dispatched_at),
    receivedAt: row.received_at == null ? null : String(row.received_at),
    cancelledAt: row.cancelled_at == null ? null : String(row.cancelled_at),
  };
}

export async function fetchTransfers(
  params: { status?: string; branchId?: number } = {},
  deps: Deps,
  signal?: AbortSignal,
): Promise<{ count: number; results: StockTransfer[] }> {
  const query: Record<string, string | number> = {};
  if (params.status) query.status = params.status;
  if (params.branchId !== undefined) query.branch = params.branchId;
  try {
    const payload = await authenticatedRequest<{ count?: unknown; results?: unknown }>(
      `${inventoryPath(requireTenant())}/transfers/`,
      { scope: 'authenticated-v1', query, signal },
      deps,
    );
    return {
      count: Number(payload?.count ?? 0),
      results: Array.isArray(payload?.results)
        ? payload.results.map(toTransfer)
        : [],
    };
  } catch (error) {
    return translate(error, params.branchId !== undefined);
  }
}

export async function fetchTransfer(
  transferId: number,
  deps: Deps,
  signal?: AbortSignal,
): Promise<StockTransfer> {
  try {
    return toTransfer(
      await authenticatedRequest<unknown>(
        `${inventoryPath(requireTenant())}/transfers/${encodeURIComponent(String(transferId))}/`,
        { scope: 'authenticated-v1', signal },
        deps,
      ),
    );
  } catch (error) {
    return translate(error, false);
  }
}

/** Open a DRAFT. It moves no stock — that is what dispatching is for. */
export async function createTransfer(
  input: TransferCreateInput,
  deps: Deps,
  signal?: AbortSignal,
): Promise<StockTransfer> {
  const body: Record<string, unknown> = {
    source_branch: input.sourceBranch,
    destination_branch: input.destinationBranch,
  };
  if (input.reason?.trim()) body.reason = input.reason.trim();
  if (input.reference?.trim()) body.reference = input.reference.trim();
  try {
    return toTransfer(
      await authenticatedRequest<unknown>(
        `${inventoryPath(requireTenant())}/transfers/`,
        { method: 'POST', body, scope: 'authenticated-v1', signal },
        deps,
      ),
    );
  } catch (error) {
    return translate(error, true);
  }
}

/**
 * Set the quantity of ONE product on a draft. Zero removes the line.
 *
 * There is no separate delete, because "how many of these go" and "these do not
 * go" are the same question asked twice.
 *
 * The article is named by SLUG. That is not a preference: the stock list this
 * screen reads returns `product_slug` and no id, so a slug is the only name a
 * native client can honestly come by. Verified on `origin/master` `8a1e581`.
 */
export async function setTransferItem(
  transferId: number,
  input: { productSlug: string; quantity: number },
  deps: Deps,
  signal?: AbortSignal,
): Promise<StockTransfer> {
  try {
    return toTransfer(
      await authenticatedRequest<unknown>(
        `${inventoryPath(requireTenant())}/transfers/${encodeURIComponent(String(transferId))}/items/`,
        {
          method: 'PUT',
          // By SLUG. `/inventory/stock/` returns no product id, so a slug is
          // the only name this app can come by without going to `/api/admin/`.
          body: { product_slug: input.productSlug, quantity: input.quantity },
          scope: 'authenticated-v1',
          signal,
        },
        deps,
      ),
    );
  } catch (error) {
    return translate(error, false);
  }
}

/**
 * One request per TRANSITION.
 *
 * `dispatch` and `receive` are IDEMPOTENT on the server: a second call returns
 * the same state and moves nothing. That is why a dropped response is safe to
 * retry by hand — and why this app still does not retry on its own, because a
 * retry nobody asked for is not made safe by the server being careful.
 */
async function transferAction(
  transferId: number,
  action: 'dispatch' | 'receive' | 'cancel',
  deps: Deps,
  signal?: AbortSignal,
): Promise<StockTransfer> {
  try {
    return toTransfer(
      await authenticatedRequest<unknown>(
        `${inventoryPath(requireTenant())}/transfers/${encodeURIComponent(String(transferId))}/${action}/`,
        { method: 'POST', body: {}, scope: 'authenticated-v1', signal },
        deps,
      ),
    );
  } catch (error) {
    return translate(error, false);
  }
}

export const dispatchTransfer = (id: number, deps: Deps, signal?: AbortSignal) =>
  transferAction(id, 'dispatch', deps, signal);

export const receiveTransfer = (id: number, deps: Deps, signal?: AbortSignal) =>
  transferAction(id, 'receive', deps, signal);

export const cancelTransfer = (id: number, deps: Deps, signal?: AbortSignal) =>
  transferAction(id, 'cancel', deps, signal);
