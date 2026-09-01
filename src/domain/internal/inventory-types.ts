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
