import { apiBaseUrl, companySlug } from '@/config/env';
import type { RefreshCoordinator } from '@/auth/refresh-coordinator';
import type { AccessTokenStore } from '@/auth/tokens/access-token-store';
import type { RepairEvidence, RepairEvidenceStage } from '@/domain/repairs/evidence';
import { EVIDENCE_STAGES } from '@/domain/repairs/evidence';

import { resolveImageAuthorization } from '../authenticated-image';
import { authenticatedRequest } from '../authenticated-request';
import { ApiError } from '../errors';

/**
 * Photos the shop shared with their owner — M12D.
 *
 * Verified on `PapiCuche/BlackDogStore-web` @ `origin/master`
 * `aec829c697674efb61f9776a4f796bfc05663ddc`, reading `store/evidence_views.py`
 * and `store/evidence_services.py`:
 *
 *   GET customer/<slug>/repairs/<id>/evidence/                    the list
 *   GET customer/<slug>/repairs/<id>/evidence/<id>/content/       the bytes
 *
 * READ ONLY, by the server's decision: M12D is technical capture, and a
 * customer who could upload would bring a moderation phase this one does not
 * solve. There is no write function here to forget to guard.
 *
 * THE LIST IS BORN SCOPED. `customer_evidence_for_order` cannot produce an
 * internal photo or a voided one — it filters on `visibility='customer'` and
 * `voided_at__isnull=True` in the queryset itself — so this client does no
 * filtering. A client that hid rows it had already received would be the wrong
 * place for that rule to live.
 *
 * THE BYTES ARE A SEPARATE AUTHORISED REQUEST. The server never hands out a
 * storage key or a signed URL; it hands out a content route that re-checks
 * company, ownership, visibility and voiding. So this module builds that URL
 * and the Bearer header to go with it, and the image loader sends both.
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

function requireTenant(): string {
  if (!companySlug) throw new MissingTenantError();
  return companySlug;
}

function evidencePath(slug: string, repairId: number): string {
  return `/api/v1/customer/${encodeURIComponent(slug)}/repairs/${encodeURIComponent(
    String(repairId),
  )}/evidence`;
}

function toStage(raw: unknown): RepairEvidenceStage {
  const value = String(raw ?? '');
  // `other` rather than a guess: a stage this build does not know about is
  // still a real photo, and dropping it would hide evidence from its owner.
  return (EVIDENCE_STAGES as readonly string[]).includes(value)
    ? (value as RepairEvidenceStage)
    : 'other';
}

function toPositiveInt(raw: unknown): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

export function toRepairEvidence(raw: unknown): RepairEvidence {
  const row = (raw ?? {}) as Record<string, unknown>;
  return {
    id: Number(row.id),
    stage: toStage(row.stage),
    caption: String(row.caption ?? ''),
    width: toPositiveInt(row.width),
    height: toPositiveInt(row.height),
    createdAt: String(row.created_at ?? ''),
  };
}

/**
 * The photos shared on one repair.
 *
 * A 404 becomes an empty list: on the customer surface "not your repair", "not
 * this company" and "no such repair" are deliberately the same answer, and all
 * three read to a person as "there are no photos here".
 */
export async function fetchCustomerRepairEvidence(
  repairId: number,
  deps: { refreshCoordinator: RefreshCoordinator },
  signal?: AbortSignal,
): Promise<RepairEvidence[]> {
  const path = `${evidencePath(requireTenant(), repairId)}/`;
  try {
    const body = await authenticatedRequest<unknown>(
      path,
      { scope: 'authenticated-v1', signal },
      deps,
    );
    const rows = (body as Record<string, unknown>)?.results;
    return Array.isArray(rows) ? rows.map(toRepairEvidence) : [];
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return [];
    throw error;
  }
}

/** Absolute URL of one photo's bytes. Not a credential: the route authorises. */
export function customerEvidenceContentUrl(repairId: number, evidenceId: number): string {
  const path = `${evidencePath(requireTenant(), repairId)}/${encodeURIComponent(
    String(evidenceId),
  )}/content/`;
  return `${apiBaseUrl}${path}`;
}

/**
 * The Authorization header the image request needs.
 *
 * Delegates to `api/authenticated-image.ts`, which the INTERNAL evidence
 * surface needs too: one place that knows how to make a token good before an
 * `<Image>` request, rather than two that can drift.
 */
export async function resolveEvidenceAuthorization(
  deps: { refreshCoordinator: RefreshCoordinator; accessTokens?: AccessTokenStore },
): Promise<string> {
  return resolveImageAuthorization(deps);
}
