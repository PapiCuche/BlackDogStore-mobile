/**
 * Repairs — a customer's view of the technical-service lifecycle.
 *
 * REAL SINCE M8. Verified against `PapiCuche/BlackDogStore-web` @
 * `origin/master` `43fffb0` (PR #7) with a live smoke over
 * `/api/v1/customer/<slug>/repairs/`: every field below came back from an
 * actual response.
 *
 * WHAT CHANGED FROM THE PROPOSAL
 * ------------------------------
 * This module used to open with "⚠️ NO BACKEND EXISTS" and describe a lifecycle
 * Mobile had invented for BR-005 to accept, amend or reject. The backend
 * amended it, and the shape here now follows what shipped rather than what was
 * proposed:
 *
 *   · SEVEN stages became FOUR codes, and M9 made them six by building the
 *     quote and the decision that give `approved` and `rejected` meaning.
 *     `in_repair`, `quality_check`, `ready_for_pickup` and `delivered` are real
 *     states of a real workshop and none of them exists yet: each needs a
 *     module — parts, a checklist, a pickup flow — that nobody has built. A
 *     state no server code can act on is a state that lies.
 *   · `id` became a NUMBER. Django hands out integer primary keys.
 *   · `code` became `number`, which is what the shop prints on the ticket.
 *   · The LABEL comes from the server, per tenant. A company that renamed
 *     "Recibido" to "En mostrador" sees its own word here, and this app ships no
 *     translation table that could disagree with it.
 *   · `quotedTotal` is gone. There is no quote until M9, and a field that is
 *     always null is a promise the product has not made.
 */

/**
 * The lifecycle codes the platform defines, in order.
 *
 * STABLE STRINGS, mirrored from Django's `RepairStatusCode`. M9 added
 * `approved`: the customer said go ahead, which is a step the device passes
 * through on its way to being worked on.
 *
 * `cancelled` and `rejected` sit OUTSIDE the sequence. Both can end a repair
 * from more than one place, and neither is a stage the device advances into —
 * a rejected quote means the shop stops, not that the repair progressed.
 */
export const REPAIR_STAGES = [
  'received', 'diagnosing', 'waiting_approval', 'approved',
  // M10 — the bench. `waiting_parts` is deliberately NOT here: it is a pause at
  // the `in_repair` position, not a step past it, and a progress bar that
  // advanced when a shop ran out of a battery would be lying in the flattering
  // direction.
  'in_repair', 'repaired',
] as const;

export type RepairStage = (typeof REPAIR_STAGES)[number];

/** Codes the platform defines today, in no particular order. */
export const KNOWN_REPAIR_STATUSES = [
  ...REPAIR_STAGES, 'waiting_parts', 'rejected', 'cancelled',
] as const;

export type KnownRepairStatus = (typeof KNOWN_REPAIR_STATUSES)[number];

/**
 * A lifecycle code. Known ones are typed; unknown ones are still carried.
 *
 * `string & {}` keeps autocomplete for the codes this release knows while
 * accepting the ones the next backend phase adds. That is not laziness — it is
 * the fix for a real bug, described below.
 */
export type RepairStatus = KnownRepairStatus | (string & {});

const KNOWN: readonly string[] = KNOWN_REPAIR_STATUSES;

export function isKnownRepairStatus(status: RepairStatus): status is KnownRepairStatus {
  return KNOWN.includes(status);
}

/**
 * Carry a wire value through. Only a MISSING one falls back.
 *
 * THIS USED TO COERCE ANYTHING UNKNOWN TO `received`, AND IT SHIPPED A BUG.
 * When M9 added `approved` and `rejected` before this app knew them, a repair
 * the customer had just approved rendered as "Recibido" — silently, and in the
 * direction the code called safe. It was not safe: it told people their device
 * had gone backwards.
 *
 * The lesson is that there is no safe guess. A code this build does not
 * recognise is now kept exactly as it arrived and rendered with the server's
 * own label and a neutral tone — see `describeRepairStatus`. The app says what
 * the shop says and invents no stage, which means the next backend phase can
 * ship a state without this app lying about it until the next release.
 *
 * An EMPTY value still becomes `received`: nothing arrived, and every repair
 * starts somewhere.
 */
export function toRepairStatus(raw: unknown): RepairStatus {
  const value = String(raw ?? '').trim();
  return value || 'received';
}

/**
 * One thing that happened, as the server chose to tell the customer.
 *
 * NOT a fixed ladder with the future pre-drawn. The old shape listed every
 * stage with `occurredAt: null` for the ones ahead, which was right for a
 * seven-stage lifecycle that ended in "delivered". It would be wrong now: the
 * machine stops at `waiting_approval`, and rendering "Entregado — pendiente"
 * would promise a step this version cannot reach.
 *
 * There is deliberately no `note`. Event comments are internal — that is where
 * a technician writes what they actually think — and the customer contract has
 * no field for one.
 */
export type RepairTimelineEntry = {
  id: number;
  status: RepairStatus;
  /** The tenant's own wording, from the server. */
  statusLabel: string;
  /** ISO-8601. Every entry has one: these are things that happened. */
  occurredAt: string;
};

export type Repair = {
  id: number;
  /** The number printed on the ticket, e.g. "SRV-000042". */
  number: string;
  /** "Genérica X100" — brand and model as the counter wrote them. */
  deviceSummary: string;
  status: RepairStatus;
  /** The tenant's word for `status`. Presentation, never a key. */
  statusLabel: string;
  /** What the customer said was wrong, in their words. */
  reportedIssue: string;
  receivedAt: string;
  /** ISO-8601, or null while the order is still open. */
  closedAt: string | null;
  updatedAt: string;
  /** Only the events the SERVER decided this customer may see. */
  timeline: readonly RepairTimelineEntry[];
};

/**
 * Index in the linear sequence; -1 for anything outside it.
 *
 * `cancelled` and `rejected` both end a repair without advancing it, so neither
 * may compare as "further along" than a stage the device really passed.
 */
export function repairStageIndex(status: RepairStatus): number {
  // `waiting_parts` sits AT `in_repair`, not after it: the device is on the
  // bench and the work is paused, so the ladder must not move.
  if (status === 'waiting_parts') return REPAIR_STAGES.indexOf('in_repair');
  const index = REPAIR_STAGES.indexOf(status as RepairStage);
  // -1 covers cancelled, rejected AND anything this build has never heard of.
  // An unknown code gets no position rather than an invented one.
  return index;
}

export function isStageComplete(stage: RepairStage, status: RepairStatus): boolean {
  const current = repairStageIndex(status);
  if (current === -1) return false;
  return REPAIR_STAGES.indexOf(stage) < current;
}

export function isStageCurrent(stage: RepairStage, status: RepairStatus): boolean {
  return stage === status;
}

/**
 * Whether the repair is still going somewhere.
 *
 * `rejected` joined `cancelled` in M9: the customer declined the work, the shop
 * stops, and a declined repair must not sit on the Home screen as the active
 * one. `approved` is deliberately NOT here — approval authorises work rather
 * than finishing it, and the backend stamps no completion of any kind.
 *
 * When delivery exists, this is the function that learns about it — one place,
 * not every screen.
 */
export function isRepairOpen(repair: Repair): boolean {
  // `repaired` is NOT closed. The technician finished; quality control and
  // handover have not shipped, so the device is still with the shop and the
  // customer still has a reason to look. `rejected` and `cancelled` remain the
  // only two endings, and an UNKNOWN code counts as open — a state this build
  // has never heard of is not evidence that anything finished.
  return repair.status !== 'cancelled' && repair.status !== 'rejected';
}

/**
 * The repair the Home screen should surface, or null.
 *
 * Ties broken by most-recently-updated, which is what somebody checking on
 * their device expects to see first.
 */
export function findActiveRepair(repairs: readonly Repair[]): Repair | null {
  const active = repairs.filter(isRepairOpen);
  if (active.length === 0) return null;
  return active.reduce((latest, candidate) =>
    Date.parse(candidate.updatedAt) > Date.parse(latest.updatedAt) ? candidate : latest,
  );
}
