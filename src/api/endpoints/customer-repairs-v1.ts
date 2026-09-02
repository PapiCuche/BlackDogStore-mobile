import type { RefreshCoordinator } from '@/auth/refresh-coordinator';
import { companySlug } from '@/config/env';
import {
  toQuoteStatus,
  type QuoteDecision,
  type RepairQuote,
  type RepairQuoteItem,
} from '@/domain/repairs/quote';
import {
  toRepairStatus,
  type Repair,
  type RepairTimelineEntry,
} from '@/domain/repairs/types';

import { authenticatedRequest } from '../authenticated-request';
import { ApiError, userFacingMessage } from '../errors';

/**
 * A customer's own repairs — `/api/v1/customer/<company_slug>/repairs/`.
 *
 * Verified on `PapiCuche/BlackDogStore-web` @ `origin/master` `43fffb0` (PR #7)
 * with a live smoke: every field name below came back from a real response.
 *
 * ⚠️  NEVER `/api/v1/internal/`. The company's repairs and MY repairs are two
 * different questions with two different answers, and this module only ever
 * asks the second one. The internal surface has its own repository.
 *
 * WHAT THE SERVER GUARANTEES, so this client does not have to:
 *
 *   Not a client of this company → 404, indistinguishable from unknown company.
 *   Somebody else's repair       → 404. Not 403: "it exists but is not yours"
 *                                  is an existence oracle, and an order number
 *                                  is short enough to guess.
 *
 * The TIMELINE is already filtered. Events the shop chose to keep internal
 * never leave the server, so there is nothing here to accidentally render —
 * a stronger guarantee than asking the app not to.
 */

export class MissingTenantError extends Error {
  constructor() {
    super('Esta build no tiene empresa configurada (EXPO_PUBLIC_COMPANY_SLUG).');
    this.name = 'MissingTenantError';
  }
}

/** Not a client of this company — or the repair is not this person's. */
export class RepairNotAvailableError extends Error {
  constructor() {
    super('No encontramos esa reparación en tu cuenta.');
    this.name = 'RepairNotAvailableError';
  }
}

/**
 * Somebody already answered this quote, and differently.
 *
 * Its own outcome because the app must NOT show "error inesperado" for it: the
 * quote is settled, the right move is to refetch and render what it actually
 * says. Usually this is the same person on a second device.
 */
export class QuoteAlreadyDecidedError extends Error {
  constructor(message = 'Esta cotización ya tiene una respuesta registrada.') {
    super(message);
    this.name = 'QuoteAlreadyDecidedError';
  }
}

/** The server refused the decision itself — expired, withdrawn, not sent. */
export class QuoteDecisionRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuoteDecisionRejectedError';
  }
}

function customerPath(slug: string): string {
  return `/api/v1/customer/${encodeURIComponent(slug)}/repairs`;
}

function requireTenant(): string {
  if (!companySlug) throw new MissingTenantError();
  return companySlug;
}

function toTimelineEntry(raw: unknown): RepairTimelineEntry {
  const row = raw as Record<string, unknown>;
  return {
    id: Number(row.id),
    status: toRepairStatus(row.status),
    // The tenant's own word. Falling back to the code rather than to a local
    // translation: a wrong label invented here would contradict a decision the
    // business made, and the code at least cannot be mistaken for one.
    statusLabel: String(row.status_label ?? row.status ?? ''),
    occurredAt: String(row.occurred_at ?? ''),
  };
}

export function toRepair(raw: unknown): Repair {
  const row = raw as Record<string, unknown>;
  return {
    id: Number(row.id),
    number: String(row.number ?? ''),
    deviceSummary: String(row.device_summary ?? ''),
    status: toRepairStatus(row.status),
    statusLabel: String(row.status_label ?? ''),
    reportedIssue: String(row.reported_issue ?? ''),
    receivedAt: String(row.received_at ?? ''),
    closedAt: row.closed_at === null || row.closed_at === undefined
      ? null
      : String(row.closed_at),
    updatedAt: String(row.updated_at ?? ''),
    // Absent on the LIST endpoint, which sends no timeline at all. An empty
    // array is the honest reading of "not asked for", and the detail screen is
    // what fetches the full record.
    timeline: Array.isArray(row.timeline) ? row.timeline.map(toTimelineEntry) : [],
  };
}

/** The two meaningful answers, turned into the one outcome a screen can act on. */
function translate(error: unknown): never {
  if (error instanceof ApiError && (error.status === 404 || error.status === 403)) {
    throw new RepairNotAvailableError();
  }
  throw error;
}

export async function fetchCustomerRepairs(
  deps: { refreshCoordinator: RefreshCoordinator },
  signal?: AbortSignal,
): Promise<Repair[]> {
  try {
    // A ViewSet list, so the body is a RAW ARRAY — no `{count, results}`
    // envelope. That differs from the internal surface on purpose and is a
    // house convention, not an oversight: APIViews hand-roll an envelope,
    // ViewSets do not.
    const raw = await authenticatedRequest<unknown>(
      `${customerPath(requireTenant())}/`,
      { scope: 'authenticated-v1', signal },
      deps,
    );
    return Array.isArray(raw) ? raw.map(toRepair) : [];
  } catch (error) {
    return translate(error);
  }
}

export async function fetchCustomerRepair(
  id: number,
  deps: { refreshCoordinator: RefreshCoordinator },
  signal?: AbortSignal,
): Promise<Repair> {
  try {
    return toRepair(
      await authenticatedRequest<unknown>(
        `${customerPath(requireTenant())}/${encodeURIComponent(String(id))}/`,
        { scope: 'authenticated-v1', signal },
        deps,
      ),
    );
  } catch (error) {
    return translate(error);
  }
}

// ---------------------------------------------------------------------------
// BR-005B — the quote on my repair, and my answer to it
// ---------------------------------------------------------------------------

function toQuoteItem(raw: unknown): RepairQuoteItem {
  const row = raw as Record<string, unknown>;
  return {
    id: Number(row.id),
    itemType: String(row.item_type ?? ''),
    itemTypeLabel: String(row.item_type_label ?? ''),
    description: String(row.description ?? ''),
    // Decimal STRINGS, carried verbatim. `format.ts` parses money at the point
    // of display and never earlier — arithmetic on a float that came from
    // '4899.00' is how a price ends up one cent short.
    quantity: String(row.quantity ?? '0'),
    unitPrice: String(row.unit_price ?? '0'),
    lineTotal: String(row.line_total ?? '0'),
  };
}

export function toQuote(raw: unknown): RepairQuote {
  const row = raw as Record<string, unknown>;
  const decision = row.decision as Record<string, unknown> | null | undefined;
  return {
    id: Number(row.id),
    revision: Number(row.revision ?? 1),
    status: toQuoteStatus(row.status),
    statusLabel: String(row.status_label ?? ''),
    currency: String(row.currency ?? ''),
    subtotal: String(row.subtotal ?? '0'),
    discountAmount: String(row.discount_amount ?? '0'),
    taxAmount: String(row.tax_amount ?? '0'),
    total: String(row.total ?? '0'),
    validUntil: row.valid_until ? String(row.valid_until) : null,
    // Strictly `=== true`: an absent flag is not a grant, and this one decides
    // whether an Approve button is drawn at all.
    isExpired: row.is_expired === true,
    canBeDecided: row.can_be_decided === true,
    customerNotes: String(row.customer_notes ?? ''),
    items: Array.isArray(row.items) ? row.items.map(toQuoteItem) : [],
    decision: decision
      ? {
          decision: String(decision.decision) === 'reject' ? 'reject' : 'approve',
          decidedAt: String(decision.decided_at ?? ''),
        }
      : null,
    sentAt: String(row.sent_at ?? ''),
  };
}

/**
 * The quote on my repair, or null.
 *
 * `null` is a normal answer, not an error: most of a repair's life has no quote
 * on it, and the server says so with `{quote: null}`.
 */
export async function fetchCustomerRepairQuote(
  repairId: number,
  deps: { refreshCoordinator: RefreshCoordinator },
  signal?: AbortSignal,
): Promise<RepairQuote | null> {
  try {
    const raw = await authenticatedRequest<Record<string, unknown>>(
      `${customerPath(requireTenant())}/${encodeURIComponent(String(repairId))}/quote/`,
      { scope: 'authenticated-v1', signal },
      deps,
    );
    return raw.quote ? toQuote(raw.quote) : null;
  } catch (error) {
    return translate(error);
  }
}

/**
 * Answer the quote.
 *
 * TWO FIELDS, and one is optional. Who decided, for which customer, in which
 * company, through which channel, at what total and from which address are all
 * the server's — a client that could state any of them could state a
 * better-looking version of what happened.
 *
 * A 409 means somebody already answered, and it becomes its own error so the
 * screen can refetch and show the real state instead of "error inesperado".
 */
export async function postQuoteDecision(
  input: { repairId: number; quoteId: number; decision: QuoteDecision; reason?: string },
  deps: { refreshCoordinator: RefreshCoordinator },
  signal?: AbortSignal,
): Promise<RepairQuote> {
  const body: Record<string, unknown> = { decision: input.decision };
  if (input.reason) body.reason = input.reason;

  try {
    const raw = await authenticatedRequest<Record<string, unknown>>(
      `${customerPath(requireTenant())}/${encodeURIComponent(String(input.repairId))}`
        + `/quotes/${encodeURIComponent(String(input.quoteId))}/decision/`,
      { method: 'POST', body, scope: 'authenticated-v1', signal },
      deps,
    );
    return toQuote(raw.quote);
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      throw new QuoteAlreadyDecidedError(
        error.message && !error.message.startsWith('HTTP ')
          ? error.message
          : undefined,
      );
    }
    if (error instanceof ApiError && error.status === 400) {
      // A domain refusal — expired, withdrawn, not awaiting an answer. The
      // server's own words are the most useful thing to show.
      throw new QuoteDecisionRejectedError(
        error.message && !error.message.startsWith('HTTP ')
          ? error.message
          : 'El servidor rechazó la respuesta.',
      );
    }
    return translate(error);
  }
}

/**
 * The message to put in front of the person who pressed the button.
 *
 * `userFacingMessage` deliberately swallows `error.message` for API failures,
 * but these three are written BY the domain FOR the customer.
 */
export function quoteErrorMessage(error: unknown): string {
  if (
    error instanceof QuoteAlreadyDecidedError ||
    error instanceof QuoteDecisionRejectedError ||
    error instanceof RepairNotAvailableError
  ) {
    return error.message;
  }
  return userFacingMessage(error);
}
