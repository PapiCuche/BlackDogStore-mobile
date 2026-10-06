import { apiBaseUrl, companySlug } from '@/config/env';
import type { RefreshCoordinator } from '@/auth/refresh-coordinator';
import type { AccessTokenStore } from '@/auth/tokens/access-token-store';
import type {
  EvidenceStageOption,
  InternalEvidence,
  InternalEvidenceGallery,
} from '@/domain/internal/evidence-types';
import { EMPTY_EVIDENCE_GALLERY } from '@/domain/internal/evidence-types';
import type { RepairEvidenceStage } from '@/domain/repairs/evidence';
import { EVIDENCE_STAGES } from '@/domain/repairs/evidence';

import { resolveImageAuthorization } from '../authenticated-image';
import { authenticatedRequest } from '../authenticated-request';
import { ApiError } from '../errors';
import {
  InternalAccessDeniedError,
  InternalCapabilityMissingError,
} from './internal-v1';

/**
 * Repair photos as STAFF handle them — `/api/v1/internal/<slug>/service/orders/
 * <id>/evidence/…`, M12D.
 *
 * Verified on `PapiCuche/BlackDogStore-web` @ `origin/master`
 * `aec829c697674efb61f9776a4f796bfc05663ddc` (`store/evidence_views.py`,
 * `store/evidence_services.py`):
 *
 *   GET  evidence/                              list, `service.orders.view`
 *   POST evidence/                              upload one, multipart
 *   GET  evidence/<id>/content/                 the bytes
 *   POST evidence/<id>/publish-to-customer/     share it
 *   POST evidence/<id>/hide-from-customer/      stop sharing it
 *   POST evidence/<id>/void/                    retire it, with a reason
 *
 * TWO AXES ON EVERY WRITE. Reading the list takes `service.orders.view`; acting
 * on one photo takes the capability ITS STAGE demands plus access to the
 * order's branch (`may_act_on_stage`). A quality photo is not a diagnosis
 * photo, and the server asks separately.
 *
 * UPLOAD IS A MULTIPART POST, and the only call in the app that is not JSON.
 * `image` carries the file, `stage` says which moment it documents, `caption`
 * is optional, and `Idempotency-Key` makes a retry safe: the server fingerprints
 * the key together with the bytes, so the same key with the same photo returns
 * the row it already created, and the same key with a DIFFERENT photo is a 409.
 *
 * The server owns the image entirely. It decodes the file to find out what it
 * really is — the extension is never consulted — re-encodes everything to WebP,
 * strips metadata, reorients it and compresses it. Nothing of that is attempted
 * here, which is also why the phone uploads the original rather than a resized
 * copy: a second compression would only throw away detail the server wants.
 */

export class MissingTenantError extends Error {
  constructor() {
    super(
      'Esta build no tiene empresa configurada (EXPO_PUBLIC_COMPANY_SLUG). ' +
        'No se pueden pedir fotos sin saber de qué empresa.',
    );
    this.name = 'MissingTenantError';
  }
}

type Row = Record<string, unknown>;
type Deps = { refreshCoordinator: RefreshCoordinator; accessTokens?: AccessTokenStore };

function requireTenant(): string {
  if (!companySlug) throw new MissingTenantError();
  return companySlug;
}

function evidencePath(slug: string, orderId: number): string {
  return `/api/v1/internal/${encodeURIComponent(slug)}/service/orders/${encodeURIComponent(
    String(orderId),
  )}/evidence`;
}

function str(raw: unknown): string {
  return raw === null || raw === undefined ? '' : String(raw);
}

function toPositiveInt(raw: unknown): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

function toStage(raw: unknown): RepairEvidenceStage {
  const value = str(raw);
  return (EVIDENCE_STAGES as readonly string[]).includes(value)
    ? (value as RepairEvidenceStage)
    : 'other';
}

export function toInternalEvidence(raw: unknown): InternalEvidence {
  const row = (raw ?? {}) as Row;
  return {
    id: Number(row.id),
    stage: toStage(row.stage),
    caption: str(row.caption),
    // Anything but the server's own word for "shared" reads as internal: the
    // safe default is NOT showing a photo as visible to the customer.
    visibility: row.visibility === 'customer' ? 'customer' : 'internal',
    mimeType: str(row.mime_type),
    byteSize: toPositiveInt(row.byte_size),
    width: toPositiveInt(row.width),
    height: toPositiveInt(row.height),
    createdAt: str(row.created_at),
    uploadedBy: str(row.uploaded_by),
    voidedAt: row.voided_at === null || row.voided_at === undefined ? null : str(row.voided_at),
    voidReason:
      row.void_reason === null || row.void_reason === undefined ? null : str(row.void_reason),
  };
}

/**
 * The refusals this surface produces, mapped to the internal vocabulary the
 * service module already uses so one screen can show them all the same way.
 */
function translate(error: unknown): never {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      throw new InternalCapabilityMissingError(error.message);
    }
    if (error.status === 404) {
      // The order is not in this shop, or the company is closed to this person.
      // The server refuses to say which, and so does this.
      throw new InternalAccessDeniedError();
    }
  }
  throw error;
}

/**
 * The stage catalogue, as the server ordered it.
 *
 * A row whose `value` this build does not know is DROPPED rather than folded
 * into `other`: offering a stage under the wrong name would upload evidence
 * labelled as something it is not. A row that is missing is simply a stage this
 * build cannot photograph yet.
 */
function toStageOptions(raw: unknown): EvidenceStageOption[] {
  if (!Array.isArray(raw)) return [];
  const options: EvidenceStageOption[] = [];
  for (const entry of raw) {
    const row = (entry ?? {}) as Row;
    const value = str(row.value);
    if (!(EVIDENCE_STAGES as readonly string[]).includes(value)) continue;
    options.push({
      value: value as RepairEvidenceStage,
      label: str(row.label) || value,
      capability: str(row.capability),
    });
  }
  return options;
}

function toStageCounts(raw: unknown): InternalEvidenceGallery['stageCounts'] {
  if (typeof raw !== 'object' || raw === null) return {};
  const counts: InternalEvidenceGallery['stageCounts'] = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!(EVIDENCE_STAGES as readonly string[]).includes(key)) continue;
    counts[key as RepairEvidenceStage] = toPositiveInt(value);
  }
  return counts;
}

/**
 * Every photo on the order — shared or not, voided included — and what the
 * server says about the gallery.
 *
 * `stage_counts` and `in_force` come back as the server computed them. Counting
 * `items` here would produce a second number that disagrees the moment voiding
 * or visibility rules change.
 */
export async function fetchInternalEvidence(
  orderId: number,
  deps: Deps,
  signal?: AbortSignal,
): Promise<InternalEvidenceGallery> {
  try {
    const body = await authenticatedRequest<unknown>(
      `${evidencePath(requireTenant(), orderId)}/`,
      { scope: 'authenticated-v1', signal },
      deps,
    );
    const row = (body ?? {}) as Row;
    const rows = row.results;
    return {
      items: Array.isArray(rows) ? rows.map(toInternalEvidence) : [],
      stages: toStageOptions(row.stages),
      stageCounts: toStageCounts(row.stage_counts),
      inForce: toPositiveInt(row.in_force),
    };
  } catch (error) {
    return translate(error);
  }
}

/** An empty gallery, for a screen that has nothing to show yet. */
export { EMPTY_EVIDENCE_GALLERY };

/** Absolute URL of one photo's bytes. Not a credential: the route authorises. */
export function internalEvidenceContentUrl(orderId: number, evidenceId: number): string {
  return `${apiBaseUrl}${evidencePath(requireTenant(), orderId)}/${encodeURIComponent(
    String(evidenceId),
  )}/content/`;
}

export async function resolveInternalEvidenceAuthorization(deps: Deps): Promise<string> {
  return resolveImageAuthorization(deps);
}

/**
 * Correct the note on a photo — the ONLY editable field.
 *
 * The server accepts `caption` and nothing else, demands a real string (400
 * otherwise) and gates the write on the capability the photo's STAGE demands
 * plus branch access. An empty string clears the note, which is a legitimate
 * correction, so it is sent as given rather than omitted.
 */
export async function updateInternalEvidenceCaption(
  orderId: number,
  evidenceId: number,
  caption: string,
  deps: Deps,
  signal?: AbortSignal,
): Promise<InternalEvidence> {
  try {
    return toInternalEvidence(
      await authenticatedRequest<unknown>(
        `${evidencePath(requireTenant(), orderId)}/${encodeURIComponent(
          String(evidenceId),
        )}/`,
        { method: 'PATCH', body: { caption }, scope: 'authenticated-v1', signal },
        deps,
      ),
    );
  } catch (error) {
    return translate(error);
  }
}

async function act(
  orderId: number,
  evidenceId: number,
  action: 'publish-to-customer' | 'hide-from-customer' | 'void',
  body: Record<string, unknown>,
  deps: Deps,
  signal?: AbortSignal,
): Promise<InternalEvidence> {
  try {
    return toInternalEvidence(
      await authenticatedRequest<unknown>(
        `${evidencePath(requireTenant(), orderId)}/${encodeURIComponent(
          String(evidenceId),
        )}/${action}/`,
        { method: 'POST', body, scope: 'authenticated-v1', signal },
        deps,
      ),
    );
  } catch (error) {
    return translate(error);
  }
}

/**
 * Share one photo with the device's owner.
 *
 * IDEMPOTENT SERVER-SIDE — publishing an already-shared photo changes nothing —
 * and refused outright for a voided one: a retired photo must never reach a
 * customer.
 */
export async function publishInternalEvidence(
  orderId: number,
  evidenceId: number,
  deps: Deps,
  signal?: AbortSignal,
): Promise<InternalEvidence> {
  return act(orderId, evidenceId, 'publish-to-customer', {}, deps, signal);
}

/** Stop sharing it. Also idempotent. */
export async function hideInternalEvidence(
  orderId: number,
  evidenceId: number,
  deps: Deps,
  signal?: AbortSignal,
): Promise<InternalEvidence> {
  return act(orderId, evidenceId, 'hide-from-customer', {}, deps, signal);
}

/**
 * Retire a photo, with a reason that stays on the record.
 *
 * The reason is the shop's own account of why the evidence is no longer good,
 * so an empty one is omitted rather than sent blank.
 */
export async function voidInternalEvidence(
  orderId: number,
  evidenceId: number,
  reason: string,
  deps: Deps,
  signal?: AbortSignal,
): Promise<InternalEvidence> {
  const body: Record<string, unknown> = {};
  if (reason.trim()) body.reason = reason.trim();
  return act(orderId, evidenceId, 'void', body, deps, signal);
}

/**
 * One photo, as the picker handed it over.
 *
 * `uri` is a local file the runtime can read; `name` and `mimeType` are what
 * the picker reported about it. Both are passed through, because Django's
 * multipart parser needs a filename and the server's decoder uses the bytes
 * rather than either of them.
 */
export type EvidenceUpload = {
  stage: RepairEvidenceStage;
  uri: string;
  name: string;
  mimeType: string;
  caption?: string;
  /**
   * Makes the POST safe to repeat. The server fingerprints it WITH the bytes:
   * the same key and the same photo answer with the row that already exists,
   * and the same key with another photo is refused as a conflict. One key per
   * picked photo, kept across retries of that photo.
   */
  idempotencyKey?: string;
};

/**
 * Upload a photo for one stage of the repair.
 *
 * Two authorities, as everywhere on this surface: `service.orders.view` to
 * reach the order at all, then the capability THAT STAGE demands plus access to
 * the order's branch. Someone who diagnoses does not thereby get to photograph
 * a delivery.
 *
 * The photo is born INTERNAL. There is no parameter to publish it in the same
 * breath — sharing a customer's device photo is a separate, audited act — so
 * this call never makes anything visible to anybody outside the shop.
 *
 * It does not retry. A repeated upload without the key would be a second row on
 * the record, and the record of a repair is not a place for duplicates.
 */
export async function uploadInternalEvidence(
  orderId: number,
  upload: EvidenceUpload,
  deps: Deps,
  signal?: AbortSignal,
): Promise<InternalEvidence> {
  const form = new FormData();
  // React Native's `FormData` takes a file as this shape. The cast is the
  // standard one: the DOM type describes a `Blob`, which a native file URI is
  // not, and reading the file into memory to make one would double the cost of
  // a 9 MB photo for no gain.
  form.append('image', {
    uri: upload.uri,
    name: upload.name,
    type: upload.mimeType,
  } as unknown as Blob);
  form.append('stage', upload.stage);
  // Sent only when there is something to say: the server collapses whitespace
  // and an empty note is the absence of a note, not a note.
  const caption = (upload.caption ?? '').trim();
  if (caption) form.append('caption', caption);

  try {
    const body = await authenticatedRequest<unknown>(
      `${evidencePath(requireTenant(), orderId)}/`,
      {
        scope: 'authenticated-v1',
        method: 'POST',
        multipart: form,
        headers: upload.idempotencyKey ? { 'Idempotency-Key': upload.idempotencyKey } : {},
        // A photo over a mobile connection is not a JSON round trip. The
        // default timeout would abort a perfectly healthy upload.
        timeoutMs: EVIDENCE_UPLOAD_TIMEOUT_MS,
        signal,
      },
      deps,
    );
    return toInternalEvidence(body);
  } catch (error) {
    if (error instanceof ApiError && error.status === 413) {
      // `kindFromStatus` has no name for 413, and the server's own sentence is
      // the useful one: the photo is too big.
      throw new ApiError('validation', error.message, { status: 413, cause: error });
    }
    return translate(error);
  }
}

/** Two minutes. A 25 MB photo on a slow uplink is not a stalled request. */
export const EVIDENCE_UPLOAD_TIMEOUT_MS = 120_000;
