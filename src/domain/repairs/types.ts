/**
 * Repairs — the technical-service lifecycle.
 *
 * ⚠️  NO BACKEND EXISTS. Verified by reading `store/models.py` in the Web
 * repository: there is no Repair, RepairOrder or ServiceOrder model, and no
 * repair route in `store/urls.py`. The only related thing Django has is a
 * `service.manage` capability and a `technician` role — permissions for a
 * feature that has not been built.
 *
 * Everything in this module is therefore a MOBILE PROPOSAL (BR-005). It is
 * modelled carefully so the backend team has something concrete to accept,
 * amend or reject — but it invents no business rule that Django will be held
 * to. The Backend team has final authority on the real shape.
 */

/**
 * The lifecycle the brief describes, in order.
 *
 * `cancelled` sits outside the sequence on purpose: it can happen from any
 * stage and is not a step the device passes THROUGH.
 */
export const REPAIR_STAGES = [
  'received',
  'diagnosis',
  'awaiting_approval',
  'in_repair',
  'quality_check',
  'ready_for_pickup',
  'delivered',
] as const;

export type RepairStage = (typeof REPAIR_STAGES)[number];
export type RepairStatus = RepairStage | 'cancelled';

export type RepairTimelineEntry = {
  stage: RepairStage;
  /** ISO-8601. Null when the stage has not been reached yet. */
  occurredAt: string | null;
  /** Optional technician note attached to this stage. */
  note: string | null;
};

export type Repair = {
  id: string;
  /** Customer-facing service number, e.g. "REP-1042". */
  code: string;
  /** "MacBook Pro 14\"" — as written on the intake form. */
  deviceName: string;
  /** Free-form: "Mac", "iPhone", "iPad", "Apple Watch". Not an enum: the pilot
   *  services whatever comes through the door. */
  deviceKind: string;
  status: RepairStatus;
  /** What the customer brought it in for. */
  reportedIssue: string;
  createdAt: string;
  /** ISO-8601 of the most recent status change. Drives "hace 25 min". */
  updatedAt: string;
  /** Full history, one entry per stage, in `REPAIR_STAGES` order. */
  timeline: readonly RepairTimelineEntry[];
  /** Quoted total as a decimal string, or null before diagnosis. */
  quotedTotal: string | null;
};

/** Index of `status` in the linear sequence; -1 for `cancelled`. */
export function repairStageIndex(status: RepairStatus): number {
  if (status === 'cancelled') return -1;
  return REPAIR_STAGES.indexOf(status);
}

/** Whether `stage` has already been passed, given the current `status`. */
export function isStageComplete(stage: RepairStage, status: RepairStatus): boolean {
  const current = repairStageIndex(status);
  if (current === -1) return false;
  return REPAIR_STAGES.indexOf(stage) < current;
}

export function isStageCurrent(stage: RepairStage, status: RepairStatus): boolean {
  return stage === status;
}

/**
 * The repair the Home screen should surface, or null.
 *
 * "Active" means the device is still with us: delivered and cancelled repairs
 * are finished business and must not sit on the Home screen forever. Ties are
 * broken by most-recently-updated, which is what a customer checking on their
 * device expects to see first.
 */
export function findActiveRepair(repairs: readonly Repair[]): Repair | null {
  const active = repairs.filter((r) => r.status !== 'delivered' && r.status !== 'cancelled');
  if (active.length === 0) return null;
  return active.reduce((latest, candidate) =>
    Date.parse(candidate.updatedAt) > Date.parse(latest.updatedAt) ? candidate : latest,
  );
}
