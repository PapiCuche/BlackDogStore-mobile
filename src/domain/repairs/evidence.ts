import type { StatusTone } from '@/domain/orders/status';

/**
 * A photo of somebody's device, shared with them on purpose — M12D.
 *
 * WHAT THE CUSTOMER SURFACE DELIBERATELY DOES NOT CARRY. The server writes the
 * customer payload as an allowlist, not as the internal one minus fields, so
 * there is no uploader, no void reason, no visibility flag and nothing about
 * storage. This type mirrors that allowlist exactly: a field that appears here
 * later must appear on the server first.
 *
 * THE STORAGE KEY IS NOT PART OF THE CONTRACT. The bytes come from a content
 * endpoint that re-checks company, ownership, visibility and voiding on every
 * request. A signed URL handed to the client would make the bucket the security
 * boundary, and a bucket does not know who is asking.
 */
export type RepairEvidenceStage =
  | 'intake'
  | 'diagnosis'
  | 'repair_before'
  | 'repair_during'
  | 'repair_after'
  | 'parts'
  | 'quality'
  | 'ready'
  | 'delivery'
  | 'warranty'
  | 'other';

export type RepairEvidence = {
  id: number;
  stage: RepairEvidenceStage;
  /** The note the shop wrote next to the photo. May be empty. */
  caption: string;
  /** Pixel size, for laying the image out before it loads. 0 when unknown. */
  width: number;
  height: number;
  createdAt: string;
};

/**
 * The shop's own words for a stage.
 *
 * Taken from `RepairEvidence.Stage` on the server, where each label is already
 * written for a customer to read. Inventing friendlier wording here would mean
 * the app and the workshop ticket calling the same photo two different things.
 */
const STAGE_LABELS: Record<RepairEvidenceStage, string> = {
  intake: 'Ingreso',
  diagnosis: 'Diagnóstico',
  repair_before: 'Antes de reparar',
  repair_during: 'Durante la reparación',
  repair_after: 'Después de reparar',
  parts: 'Repuestos',
  quality: 'Control de calidad',
  ready: 'Listo para entrega',
  delivery: 'Entrega',
  warranty: 'Garantía / reingreso',
  other: 'Otra',
};

export function describeEvidenceStage(
  stage: RepairEvidenceStage,
): { label: string; tone: StatusTone } {
  switch (stage) {
    case 'ready':
    case 'delivery':
      return { label: STAGE_LABELS[stage], tone: 'success' };
    case 'quality':
      return { label: STAGE_LABELS[stage], tone: 'info' };
    case 'warranty':
      return { label: STAGE_LABELS[stage], tone: 'warning' };
    default:
      return { label: STAGE_LABELS[stage], tone: 'neutral' };
  }
}

export const EVIDENCE_STAGES = Object.keys(STAGE_LABELS) as RepairEvidenceStage[];
