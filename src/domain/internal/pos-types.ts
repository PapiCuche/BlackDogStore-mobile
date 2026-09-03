/**
 * The counter till, as the INTERNAL audience sees it. IP1A.
 *
 * Verified against `PapiCuche/BlackDogStore-web` @ `origin/master` `d484e3e`
 * (PR #21) with a live smoke over all five endpoints — not from a PR
 * description. Every field below came back from a real response.
 *
 * WHY A SEPARATE FILE. Selling and holding stock are two jobs gated by two
 * different permissions: the `Ventas` preset has `sales.pos.use` and NOT
 * `inventory.view`, and the `Inventario` preset is the exact mirror. Measured
 * against the resolver, not assumed. Keeping the types apart keeps that
 * asymmetry visible instead of implying one internal blob.
 *
 * MONEY IS A STRING, FROM THE WIRE TO THE PIXEL. Every amount here is a decimal
 * the server computed. This app never adds, subtracts or parses one: a total
 * worked out on a phone could disagree with the till, and the one that
 * disagrees is the one a customer is being asked to pay.
 */

/** A branch this member may SELL from, as the server resolved it. */
export type PosBranch = {
  id: number;
  name: string;
};

/** A payment method a counter may pick. `online` never appears — see below. */
export type PosPaymentMethod = {
  value: string;
  label: string;
};

/**
 * A colleague a sale may be credited to.
 *
 * The server sends an EMPTY list to anybody without `sales.pos.assign_seller`.
 * A list of colleagues is staffing information, and somebody who cannot
 * reassign a sale has no reason to hold one.
 */
export type PosSeller = {
  id: number;
  name: string;
};

/**
 * What this till may do, asked once when it opens.
 *
 * The three `can*` flags are the server's answer, not a guess. A control that
 * appears and then 403s is worse than one that was never offered — and the app
 * must not infer them from a role name, because the same preset means different
 * things in different tenants.
 *
 * `defaultBranch` may be NULL, and that is a decision rather than an omission:
 * with several branches and no authorised default the server refuses to pick
 * one, because selling from the wrong shop moves real units off a real shelf.
 * The screen asks.
 */
export type PosContext = {
  company: { id: number; name: string };
  branches: readonly PosBranch[];
  defaultBranch: number | null;
  /**
   * `online` is absent by construction: the gateway method belongs to the
   * storefront, and a counter cannot pick it. The server filters it out, and
   * this app renders whatever came back rather than holding its own list.
   */
  paymentMethods: readonly PosPaymentMethod[];
  canManageCustomers: boolean;
  canAssignSeller: boolean;
  canApplyDiscount: boolean;
  canViewCommissions: boolean;
  seller: { id: number; username: string; name: string };
  sellers: readonly PosSeller[];
};

/**
 * One article, priced and counted for ONE branch.
 *
 * `available` is per branch on purpose. A national figure would tell a cashier
 * they can sell something that is three cities away.
 */
export type PosProduct = {
  id: number;
  name: string;
  /** A decimal STRING. Displayed, never used in arithmetic. */
  price: string;
  available: number;
  barcode: string;
};

/** A promotion the SERVER applied, named so a till can explain the reduction. */
export type PosPromotion = {
  id: number;
  name: string;
  applications: number;
  regularAmount: string;
  discountAmount: string;
};

/**
 * What a basket costs, before anybody is charged.
 *
 * The server runs the same resolution and the same arithmetic the sale will, so
 * the number an operator reads aloud is the number that will be taken. The app
 * computes none of it.
 */
export type PosPreview = {
  subtotal: string;
  discount: string;
  discountSource: string;
  couponCode: string;
  promotions: readonly PosPromotion[];
  total: string;
  seller: { id: number | null; name: string };
  customer: { id: number; name: string } | null;
  /** Null for anybody without `sales.commissions.view`. */
  commission: { ratePercent: string; baseAmount: string; amount: string } | null;
  lines: readonly {
    product: number; name: string; quantity: number; price: string;
  }[];
};

/** A completed counter sale. */
export type PosSale = {
  orderId: number;
  /** False when this key had already been spent on this exact basket. */
  created: boolean;
  subtotal: string;
  discount: string;
  discountSource: string;
  discountReason: string;
  total: string;
  paidAt: string | null;
  paymentMethod: string;
  amountReceived: string | null;
  changeAmount: string | null;
  paymentReference: string;
  branch: { id: number; name: string };
  seller: string;
  customer: string;
  commission: string | null;
  items: readonly {
    product: number; name: string; quantity: number; price: string;
  }[];
};

/**
 * A line in the basket the operator is building. LOCAL INTENTION ONLY.
 *
 * This is not a cart in the storefront sense and shares nothing with one: no
 * store, no persistence, no reservation. It is what somebody has scanned so
 * far, and the server re-resolves every product, price, promotion and total
 * when it is sent.
 */
export type PosCartLine = {
  product: PosProduct;
  quantity: number;
};

/**
 * Completing a sale: WHAT is being sold and HOW it is being paid.
 *
 * No price, no subtotal, no discount amount, no total. A till is TOLD what to
 * charge; it is never asked. `termsConfirmed` must be true and is asserted by
 * the operator — handing the article over proves nothing was explained.
 *
 * `idempotencyKey` is 8–64 printable characters with no spaces, which the
 * server validates and REFUSES rather than repairs: truncating would fold two
 * distinct keys into one and answer the second sale with the first one's order.
 */
export type PosSaleInput = {
  branch: number;
  items: readonly { product: number; quantity: number }[];
  paymentMethod: string;
  amountReceived?: string;
  customer?: number;
  seller?: number;
  couponCode?: string;
  manualDiscountType?: string;
  manualDiscountValue?: string;
  discountReason?: string;
  paymentReference?: string;
  saleNotes?: string;
  idempotencyKey: string;
  termsConfirmed: boolean;
};

export const CAP_SALES_POS_USE = 'sales.pos.use';
export const CAP_SALES_POS_ASSIGN_SELLER = 'sales.pos.assign_seller';
export const CAP_SALES_DISCOUNTS_APPLY = 'sales.discounts.apply';
export const CAP_SALES_COMMISSIONS_VIEW = 'sales.commissions.view';
