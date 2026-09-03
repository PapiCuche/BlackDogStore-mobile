/**
 * The INTERNAL audience's view of stock.
 *
 * Verified against `PapiCuche/BlackDogStore-web` @ `origin/master` `fd6ea01`
 * (PR #6) with a live smoke over the four endpoints — not from a PR
 * description.
 *
 * WHY A SEPARATE FILE FROM `types.ts`. Sales and inventory are two modules of
 * one audience, gated by two different capabilities. Someone may hold
 * `inventory.view` and no sales permission at all. Keeping the types apart
 * keeps that asymmetry visible instead of implying one internal blob.
 */

/**
 * A branch the signed-in member may operate — as the SERVER resolved it.
 *
 * Never derived on the client. `Membership.branch_access_mode` and
 * `MembershipBranchAccess` live on the backend, and a list cached from an
 * earlier session would offer shops whose access was withdrawn since.
 */
export type InternalBranch = {
  id: number;
  name: string;
};

/**
 * Headline counters for the visible branches.
 *
 * `inventoryValueBasis` is carried, not dropped: the backend values stock at
 * SALE price because there is no cost model in the system. A screen that
 * printed this as "capital invertido" would be putting a false name on a real
 * number, so the basis travels with the figure.
 */
export type InternalInventorySummary = {
  totalProducts: number;
  activeProducts: number;
  outOfStockCount: number;
  lowStockCount: number;
  stockedCount: number;
  totalUnits: number;
  inventoryValue: string;
  inventoryValueBasis: string;
  lowStockThreshold: number;
  /** The branch the figures were computed for, or null for "all I may see". */
  branch: InternalBranch | null;
  availableBranches: readonly InternalBranch[];
};

/** One product's stock IN ONE BRANCH. Never a company-wide total. */
export type InternalStockItem = {
  id: number;
  productName: string;
  productSlug: string;
  branchId: number;
  branchName: string;
  quantity: number;
  minimumStock: number;
  isLowStock: boolean;
  isOutOfStock: boolean;
  updatedAt: string;
};

/**
 * One Kardex line.
 *
 * `stockBefore` / `stockAfter` are the stock OF THAT BRANCH, not of the
 * company — the meaning changed in the backend's Phase 2D and this type is
 * named after the current one.
 */
export type InternalStockMovement = {
  id: number;
  productName: string;
  productSlug: string;
  branchId: number;
  branchName: string;
  movementType: string;
  movementTypeLabel: string;
  quantity: number;
  stockBefore: number;
  stockAfter: number;
  reason: string;
  referenceType: string;
  /** A display name. The backend deliberately never sends the actor's email. */
  actorName: string;
  createdAt: string;
};

export type InternalStockPage = {
  count: number;
  page: number;
  pageSize: number;
  results: readonly InternalStockItem[];
};

export type InternalMovementPage = {
  count: number;
  page: number;
  pageSize: number;
  results: readonly InternalStockMovement[];
};

/**
 * What the app asks the server to DO — an intention, never a result.
 *
 * There is no `quantityAfter` here and there is no field for one in the
 * contract. The sign comes from `movementType` and the arithmetic happens on
 * the server under a row lock, because a final quantity computed on a phone is
 * a claim about a number someone else may be changing at the same moment.
 */
export type StockAdjustmentInput = {
  productSlug: string;
  branchId: number;
  movementType: ManualMovementType;
  quantity: number;
  reason: string;
};

export const CAP_INVENTORY_VIEW = 'inventory.view';
export const CAP_INVENTORY_ADJUST = 'inventory.adjust';

/**
 * The movement types a person may record by hand.
 *
 * Mirrors `StockMovement.MANUAL_TYPES` on the backend, which is the authority:
 * the server rejects anything outside it regardless of what this app offers.
 * `sale_exit` is absent because the payment pipeline produces it, and the two
 * transfer types because a transfer written by hand on one side only is stock
 * that vanished.
 */
export const MANUAL_MOVEMENT_TYPES = [
  { value: 'manual_entry', label: 'Entrada manual', direction: 'in' },
  { value: 'purchase_entry', label: 'Entrada por compra', direction: 'in' },
  { value: 'return_entry', label: 'Entrada por devolución', direction: 'in' },
  { value: 'correction_positive', label: 'Corrección positiva', direction: 'in' },
  { value: 'manual_exit', label: 'Salida manual', direction: 'out' },
  { value: 'correction_negative', label: 'Corrección negativa', direction: 'out' },
  { value: 'damaged_exit', label: 'Salida por daño / merma', direction: 'out' },
] as const;

export type ManualMovementType = (typeof MANUAL_MOVEMENT_TYPES)[number]['value'];

export function isManualMovementType(value: string): value is ManualMovementType {
  return MANUAL_MOVEMENT_TYPES.some((type) => type.value === value);
}

/** Whether a movement adds or removes, for presentation only. */
export function movementDirection(movementType: string): 'in' | 'out' | 'unknown' {
  const known = MANUAL_MOVEMENT_TYPES.find((type) => type.value === movementType);
  if (known) return known.direction;
  // Types this app cannot create but must still render in the Kardex.
  if (['initial_stock', 'transfer_in'].includes(movementType)) return 'in';
  if (['sale_exit', 'service_exit', 'transfer_out'].includes(movementType)) return 'out';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// IP1B — inter-branch transfers
// ---------------------------------------------------------------------------
//
// Verified against `PapiCuche/BlackDogStore-web` @ `origin/master` `b38ec26`
// (PR #22) with a live smoke over all six routes plus every refusal.
//
// THE STATE MACHINE IS NOT HERE, and it must never be. It lives in
// `inventory_services`, four states with stock moving at exactly two of the
// transitions. This app reads a status and asks the server to make a move; if
// the move is illegal the server says so. A transition table on a phone would
// be a second lifecycle nobody owns.

/** The four states, as STRINGS the server sent — never a local enum to compare. */
export type TransferStatus =
  | 'draft' | 'in_transit' | 'received' | 'cancelled' | (string & {});

export type TransferItem = {
  id: number;
  product: number;
  productName: string;
  productSlug: string;
  quantity: number;
};

/**
 * One transfer document.
 *
 * `statusLabel` is the SERVER's word. A local translation table would quietly
 * overrule a decision the business made, the same rule the repair lifecycle has
 * followed since M8.
 */
export type StockTransfer = {
  id: number;
  sourceBranch: number;
  sourceBranchName: string;
  destinationBranch: number;
  destinationBranchName: string;
  status: TransferStatus;
  statusLabel: string;
  reason: string;
  reference: string;
  items: readonly TransferItem[];
  totalUnits: number;
  createdByUsername: string | null;
  createdAt: string;
  dispatchedAt: string | null;
  receivedAt: string | null;
  cancelledAt: string | null;
};

/**
 * Setting the quantity of ONE article on a draft.
 *
 * The article is named by SLUG, which is the only name this app can honestly
 * obtain: `/inventory/stock/` returns `product_slug` and no id, exactly as
 * `/inventory/adjustments/` takes a slug. The route accepts a numeric pk too —
 * the Web console speaks it — but a client that reads a shelf never sees one,
 * and reaching for it would mean going to `/api/admin/`.
 *
 * Zero removes the line: "how many of these go" and "these do not go" are the
 * same question asked twice.
 */
export type TransferItemInput = {
  transferId: number;
  productSlug: string;
  quantity: number;
};

/** Opening a draft: WHERE FROM and WHERE TO. Nothing else is the client's. */
export type TransferCreateInput = {
  sourceBranch: number;
  destinationBranch: number;
  reason?: string;
  reference?: string;
};

// The capabilities are the module's existing pair, deliberately NOT aliased:
// reading a transfer takes `inventory.view` and every write takes
// `inventory.adjust`, the SAME split this file already declares for stock and
// the same one the Web surface enforces. A second name for `inventory.adjust`
// would suggest transfers had a permission of their own. They do not.
