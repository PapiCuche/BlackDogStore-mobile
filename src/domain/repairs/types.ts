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
 *   · SEVEN stages became FOUR codes. `in_repair`, `quality_check`,
 *     `ready_for_pickup` and `delivered` are real states of a real workshop and
 *     none of them exists yet: each needs a module — parts, a checklist, a
 *     pickup flow — that M8 did not build. A state no server code can act on is
 *     a state that lies.
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
 * STABLE STRINGS, mirrored from Django's `RepairStatusCode`. `cancelled` sits
 * outside the sequence because it can happen from anywhere and is not a step a
 * device passes through.
 */
export const REPAIR_STAGES = ['received', 'diagnosing', 'waiting_approval'] as const;

export type RepairStage = (typeof REPAIR_STAGES)[number];
export type RepairStatus = RepairStage | 'cancelled';

const KNOWN_STATUSES: readonly string[] = [...REPAIR_STAGES, 'cancelled'];

/**
 * Narrow a wire value, or fall back to where every repair starts.
 *
 * Never guessed into a later state: telling somebody their device is further
 * along than the server said is the one direction of error that costs a wasted
 * trip to the shop.
 */
export function toRepairStatus(raw: unknown): RepairStatus {
  const value = String(raw ?? '');
  return (KNOWN_STATUSES.includes(value) ? value : 'received') as RepairStatus;
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

/** Index in the linear sequence; -1 for `cancelled`. */
export function repairStageIndex(status: RepairStatus): number {
  if (status === 'cancelled') return -1;
  return REPAIR_STAGES.indexOf(status);
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
 * Whether the shop still has the device.
 *
 * `cancelled` is the only finished state M8 can reach. When delivery exists,
 * this is the function that learns about it — one place, not every screen.
 */
export function isRepairOpen(repair: Repair): boolean {
  return repair.status !== 'cancelled';
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
