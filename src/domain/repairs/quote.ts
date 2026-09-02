/**
 * The quote on a customer's own repair.
 *
 * Verified against `PapiCuche/BlackDogStore-web` @ `origin/master` `36b8a8c`
 * (PR #8) with a live smoke: every field below came back from a real response.
 *
 * ITS OWN MODULE, not a field on `Repair`. The customer repair serializer
 * gained nothing in M9 — the quote arrives from its own endpoint, and folding
 * it into `Repair` would make every list row carry a payload only the detail
 * screen asks for.
 *
 * WHAT A CUSTOMER NEVER RECEIVES, and therefore has no type for here: the
 * shop's internal notes, the diagnosis behind the quote, who composed it, the
 * editor's draft state, the catalogue id of a line — and not even the reason
 * they themselves typed when rejecting. They wrote it; they do not need it read
 * back, and leaving it out means no future change to this contract can start
 * showing one person's words to another.
 */

/**
 * The states a customer can ever see.
 *
 * `draft` is absent on purpose: it is the shop thinking out loud and the server
 * never sends it. `cancelled` is absent too — a withdrawn quote is not shown.
 */
export const CUSTOMER_QUOTE_STATUSES = ['sent', 'approved', 'rejected'] as const;

export type RepairQuoteStatus = (typeof CUSTOMER_QUOTE_STATUSES)[number];

export function toQuoteStatus(raw: unknown): RepairQuoteStatus {
  const value = String(raw ?? '');
  return (CUSTOMER_QUOTE_STATUSES.includes(value as RepairQuoteStatus)
    ? value
    : 'sent') as RepairQuoteStatus;
}

/** What the customer decided. `approve` authorises work; it does not pay for it. */
export type QuoteDecision = 'approve' | 'reject';

export type RepairQuoteItem = {
  id: number;
  itemType: string;
  /** The tenant's word for the type. Presentation, never a key. */
  itemTypeLabel: string;
  description: string;
  /** Decimal STRINGS, straight from the wire. Parsed only at the point of display. */
  quantity: string;
  unitPrice: string;
  lineTotal: string;
};

/** Their own answer, echoed back so a settled quote renders correctly. */
export type RepairQuoteDecisionRecord = {
  decision: QuoteDecision;
  decidedAt: string;
};

export type RepairQuote = {
  id: number;
  revision: number;
  status: RepairQuoteStatus;
  /** The tenant's word for `status`. */
  statusLabel: string;
  currency: string;
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  total: string;
  /** ISO-8601, or null when the quote does not lapse. */
  validUntil: string | null;
  /**
   * SERVER-COMPUTED, both of them, and never recalculated on the device.
   *
   * A phone's clock is not the authority on whether an offer is still open, and
   * the server re-checks the whole thing when a decision arrives anyway. The
   * app renders what it was told.
   */
  isExpired: boolean;
  canBeDecided: boolean;
  /** Written for the customer — the only free text they see. */
  customerNotes: string;
  items: readonly RepairQuoteItem[];
  decision: RepairQuoteDecisionRecord | null;
  sentAt: string;
};

/** Whether the quote is still waiting for this person to answer. */
export function isAwaitingDecision(quote: RepairQuote): boolean {
  return quote.decision === null && quote.canBeDecided;
}

/**
 * Why a quote cannot be answered, or null when it can.
 *
 * One function so every surface says the same thing, and so a new reason
 * arrives in one place rather than in each screen's conditional.
 */
export function undecidableReason(quote: RepairQuote): string | null {
  if (quote.decision !== null) return 'Ya respondiste esta cotización.';
  if (quote.isExpired) return 'Esta cotización venció.';
  if (!quote.canBeDecided) return 'Esta cotización ya no admite respuesta.';
  return null;
}
