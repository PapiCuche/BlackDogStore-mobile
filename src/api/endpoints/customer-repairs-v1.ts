import type { RefreshCoordinator } from '@/auth/refresh-coordinator';
import { companySlug } from '@/config/env';
import {
  toRepairStatus,
  type Repair,
  type RepairTimelineEntry,
} from '@/domain/repairs/types';

import { authenticatedRequest } from '../authenticated-request';
import { ApiError } from '../errors';

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
