/**
 * WHICH DEVICE LEFT WITH THIS ORDER — SERIAL-PICK-01.
 *
 * A serialised product is not sold as a count: somebody has to say which
 * physical device went out, by reading its serial or its IMEI. The order
 * cannot be marked delivered while a device is missing, and the app that is
 * refused «entregado» must be able to say which one it is waiting for.
 *
 * THE SERVER COUNTS WHAT IS MISSING. `pending_units` subtracts what is
 * identified AND accounted for from what the order owes, taking into account
 * devices that went back to the shelf and lines still on order from a
 * supplier. No arithmetic of that kind happens here.
 */

/** `OrderUnit.Method`. `legacy` and the online pick are the server's own words. */
export type UnitMethod = 'scanner' | 'manual' | 'legacy' | string;

/** How a code was read. Only these two can be SENT. */
export const UNIT_METHODS = ['scanner', 'manual'] as const;
export type UnitMethodInput = (typeof UNIT_METHODS)[number];

export function describeUnitMethod(method: UnitMethod, label: string): string {
  // The server sends its own label; this is only for a payload that did not.
  if (label) return label;
  if (method === 'scanner') return 'Lector';
  if (method === 'manual') return 'Ingreso manual';
  return 'Asignado por el sistema';
}

/** One device already named on the order. Whole serial and IMEI: staff hold it. */
export type OrderUnitRecord = {
  id: number;
  productId: number;
  serialNumber: string;
  imei: string;
  imei2: string;
  method: UnitMethod;
  methodLabel: string;
  identifiedAt: string;
  identifiedBy: string;
  /** Whether this record can still be taken back. The server decides. */
  canRemove: boolean;
};

/** A device a code names, before anybody commits it to the order. */
export type UnitCandidate = {
  unitId: number;
  productId: number;
  productName: string;
  serialNumber: string;
  imei: string;
  imei2: string;
  condition: string;
  conditionLabel: string;
  /** Whether this product needs an IMEI, which is why a typed code may be refused. */
  requiresImei: boolean;
};

/**
 * WHAT THE SERVER REFUSED, AND WHY — `UnitIdentificationError.code`.
 *
 * The status says the shape of the problem: 400 for a code that is not one,
 * 404 for a device that does not exist, 409 for a device that exists and
 * cannot be used for this order. The `code` is kept so a screen can say
 * something specific without parsing Spanish.
 */
export const UNIT_ERROR_CODES = {
  invalidCode: 'invalid_code',
  invalidMethod: 'invalid_method',
  manualNeedsImei: 'manual_needs_imei',
  notFound: 'not_found',
} as const;

/**
 * WHAT WAS NOTICED ABOUT AN ORDER — CLIENT-SEC-01, `order_risk.describe`.
 *
 * ADVICE, NOT A STATE. Approving or rejecting changes nothing about the
 * order's payment or its dispatch; in a company that asked for it, it only
 * releases an order that was waiting for somebody to look.
 *
 * `canReview` is the SERVER's answer about this reader, and it is only ever
 * true while the review is waiting. No screen keeps a copy of that rule.
 */
export type OrderRiskSignal = { code: string; label: string };

export type OrderRisk = {
  level: string;
  levelLabel: string;
  score: number;
  signals: readonly OrderRiskSignal[];
  reviewStatus: string;
  reviewStatusLabel: string;
  /** A name, never a login. Null while nobody has decided. */
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string;
  assessedAt: string | null;
  canReview: boolean;
};

export type RiskDecision = 'approve' | 'reject';

/** `V1InternalRiskReviewSerializer.note`. */
export const RISK_NOTE_MAX_LENGTH = 300;

/** The capability both surfaces ask for. Reading the order asks for `view`. */
export const CAP_ORDERS_MANAGE = 'sales.orders.manage';
export const CAP_ORDERS_VIEW = 'sales.orders.view';
