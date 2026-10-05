import type { RepairEvidenceStage } from '@/domain/repairs/evidence';

/**
 * A repair photo as STAFF see it — M12D, internal side.
 *
 * Wider than the customer payload on purpose: who uploaded it, how big it is,
 * whether it is shared, and whether it was voided and why. The server writes
 * the two payloads as separate allowlists rather than one minus fields, and
 * this type mirrors the internal one.
 *
 * NO STORAGE KEY HERE EITHER. Staff get the same deal as customers: a content
 * route that re-checks company, branch, capability, visibility and voiding on
 * every request. The bucket is never the boundary.
 */
export type InternalEvidence = {
  id: number;
  stage: RepairEvidenceStage;
  caption: string;
  /** `customer` means the shop has shared it with the device's owner. */
  visibility: 'internal' | 'customer';
  mimeType: string;
  byteSize: number;
  width: number;
  height: number;
  createdAt: string;
  uploadedBy: string;
  /** Non-null once voided. A voided photo can never be shared. */
  voidedAt: string | null;
  voidReason: string | null;
};

/**
 * WHICH CAPABILITY EACH STAGE DEMANDS — `evidence_services.STAGE_CAPABILITY`.
 *
 * Mirrored here to decide what to DRAW, never to decide what is allowed:
 * `may_act_on_stage` asks for the capability AND branch access on every
 * request, so a button this map shows is still refused by the server if the
 * person's access changed. Holding `service.repair.manage` does not reach
 * another branch's order, and working in the branch does not grant the
 * capability — the server wants both.
 *
 * `other` demands the broadest authority over the order rather than the
 * cheapest, because it is the catch-all.
 */
export const EVIDENCE_STAGE_CAPABILITY: Record<RepairEvidenceStage, string> = {
  intake: 'service.orders.create',
  diagnosis: 'service.diagnostic.manage',
  repair_before: 'service.repair.manage',
  repair_during: 'service.repair.manage',
  repair_after: 'service.repair.manage',
  parts: 'service.repair.manage',
  quality: 'service.quality.manage',
  ready: 'service.delivery.manage',
  delivery: 'service.delivery.manage',
  warranty: 'service.orders.create',
  other: 'service.orders.manage',
};

/** The server collapses whitespace and refuses a longer void reason. */
export const EVIDENCE_VOID_REASON_MAX_LENGTH = 300;
