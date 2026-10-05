import { apiBaseUrl, companySlug } from '@/config/env';
import type { RefreshCoordinator } from '@/auth/refresh-coordinator';
import type { AccessTokenStore } from '@/auth/tokens/access-token-store';
import type { InternalEvidence } from '@/domain/internal/evidence-types';
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
 * UPLOAD IS NOT HERE. `POST evidence/` accepts multipart and is the technician's
 * camera path; this app has no image picker and adding one is a native
 * dependency decision of its own. Reading, sharing and retiring are what the
 * counter needs today, and leaving upload out keeps the gap visible instead of
 * half-built.
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

/** Every photo on the order, shared or not, voided included. */
export async function fetchInternalEvidence(
  orderId: number,
  deps: Deps,
  signal?: AbortSignal,
): Promise<InternalEvidence[]> {
  try {
    const body = await authenticatedRequest<unknown>(
      `${evidencePath(requireTenant(), orderId)}/`,
      { scope: 'authenticated-v1', signal },
      deps,
    );
    const rows = (body as Row)?.results;
    return Array.isArray(rows) ? rows.map(toInternalEvidence) : [];
  } catch (error) {
    return translate(error);
  }
}

/** Absolute URL of one photo's bytes. Not a credential: the route authorises. */
export function internalEvidenceContentUrl(orderId: number, evidenceId: number): string {
  return `${apiBaseUrl}${evidencePath(requireTenant(), orderId)}/${encodeURIComponent(
    String(evidenceId),
  )}/content/`;
}

export async function resolveInternalEvidenceAuthorization(deps: Deps): Promise<string> {
  return resolveImageAuthorization(deps);
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
