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

/**
 * The note is the ONLY thing about a photo that can be edited.
 *
 * `InternalEvidenceDetailView.patch` accepts `caption` and nothing else — not
 * the stage, not the visibility, not the file. Editing a stage would relabel
 * evidence after the fact; editing visibility is its own audited act.
 */
export const EVIDENCE_CAPTION_MAX_LENGTH = 300;

/**
 * One row of the stage catalogue the GALLERY RESPONSE carries.
 *
 * `InternalEvidenceListView` answers `stages`, built from
 * `evidence_services.stage_catalogue()`: the value, the label and the
 * capability, in the order of the repair cycle. The upload form is drawn from
 * it rather than from the map above, so a stage the server adds or renames
 * appears without a release, and a stage it removes stops being offered.
 */
export type EvidenceStageOption = {
  value: RepairEvidenceStage;
  label: string;
  capability: string;
};

/**
 * The gallery as the server hands it over: the photos, plus what it says about
 * them.
 *
 * `stageCounts` counts only the photos IN FORCE — a voided photo is history,
 * not evidence — and the server is the one that decides that, so the count is
 * never recomputed from `items`.
 */
export type InternalEvidenceGallery = {
  items: InternalEvidence[];
  stages: EvidenceStageOption[];
  /** Per stage, how many photos are in force. Absent keys mean none. */
  stageCounts: Partial<Record<RepairEvidenceStage, number>>;
  inForce: number;
};

export const EMPTY_EVIDENCE_GALLERY: InternalEvidenceGallery = {
  items: [],
  stages: [],
  stageCounts: {},
  inForce: 0,
};

/**
 * WHAT THE PHONE CHECKS BEFORE UPLOADING, and why so little.
 *
 * `evidence_images.process` is the authority: it decodes the bytes, refuses a
 * format it cannot read, re-encodes everything to WebP, strips metadata and
 * compresses. None of that is repeated here.
 *
 * These two numbers exist only to avoid a pointless upload. A phone photo over
 * the limit would travel for a while and come back a 413; asking the picker's
 * own `fileSize` first costs nothing. The server still decides: a file that
 * passes these checks can still be refused, and that refusal is what the user
 * is shown.
 */
export const EVIDENCE_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/**
 * What `ACCEPTED_INPUT_FORMATS` can decode, as MIME types.
 *
 * HEIC is on the list because it is what an iPhone on "High Efficiency" — the
 * factory setting — hands over. The server needs `pillow-heif` for it and says
 * so plainly when it is missing, so a HEIC is sent and that answer is shown
 * rather than guessed at here.
 */
export const EVIDENCE_ACCEPTED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const;

/** The picker reports a MIME type; an unknown one is still sent. */
export function isAcceptedEvidenceMimeType(mimeType: string | undefined): boolean {
  if (!mimeType) return true;
  return (EVIDENCE_ACCEPTED_MIME_TYPES as readonly string[]).includes(mimeType.toLowerCase());
}
