import { companySlug } from '@/config/env';
import type { RefreshCoordinator } from '@/auth/refresh-coordinator';
import type {
  AnnouncementAudienceRule,
  AnnouncementDetail,
  AnnouncementStats,
  AnnouncementStatus,
  AnnouncementSummary,
} from '@/domain/internal/announcement-types';
import { ANNOUNCEMENT_STATUSES } from '@/domain/internal/announcement-types';
import type { NotificationPriority } from '@/domain/notifications/types';

import { authenticatedRequest } from '../authenticated-request';
import { ApiError } from '../errors';
import {
  InternalAccessDeniedError,
  InternalCapabilityMissingError,
} from './internal-v1';

/**
 * Communiqués — M12C, over `/api/v1/internal/<slug>/…`.
 *
 * Verified on `PapiCuche/BlackDogStore-web` @ `origin/master`
 * `aec829c697674efb61f9776a4f796bfc05663ddc` (`store/announcement_views.py`,
 * `store/announcement_services.py`).
 *
 * TWO DIFFERENT QUESTIONS, TWO DIFFERENT GATES:
 *
 *   GET communications/              `communications.manage` — what WE sent
 *   GET communications/<id>/         same, with the audience rules
 *   GET communications/<id>/stats/   same, aggregates only
 *   GET announcements/<id>/          NO capability — a message sent to ME
 *
 * The last one is the important one. Reading a communiqué addressed to you is
 * not an authority, so the server asks for no permission; what it requires is
 * that a notification row addressed to you exists, which is also what freezes
 * the audience. Somebody who acquired a role last week cannot read last
 * month's message, because nothing was ever written to them.
 *
 * AUTHORING IS NOT HERE. Creating a draft, editing it, composing the audience
 * rules, previewing, publishing and cancelling all exist on the server and all
 * belong to a composer with a real audience editor — branches, roles,
 * capabilities and named people. Reading and monitoring are what a phone is
 * for, and leaving the rest out keeps the gap visible rather than half-built.
 */

export class MissingTenantError extends Error {
  constructor() {
    super(
      'Esta build no tiene empresa configurada (EXPO_PUBLIC_COMPANY_SLUG). ' +
        'No se pueden pedir comunicados sin saber de qué empresa.',
    );
    this.name = 'MissingTenantError';
  }
}

type Row = Record<string, unknown>;
type Deps = { refreshCoordinator: RefreshCoordinator };

function requireTenant(): string {
  if (!companySlug) throw new MissingTenantError();
  return companySlug;
}

function internalPath(slug: string): string {
  return `/api/v1/internal/${encodeURIComponent(slug)}`;
}

function str(raw: unknown): string {
  return raw === null || raw === undefined ? '' : String(raw);
}

function nullableStr(raw: unknown): string | null {
  return raw === null || raw === undefined || raw === '' ? null : String(raw);
}

function toCount(raw: unknown): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

const PRIORITIES: readonly string[] = ['info', 'action', 'warning', 'critical'];

function toPriority(raw: unknown): NotificationPriority {
  const value = str(raw);
  return (PRIORITIES.includes(value) ? value : 'info') as NotificationPriority;
}

function toStatus(raw: unknown): AnnouncementStatus {
  const value = str(raw);
  // An unknown state reads as `draft`: claiming something was published when
  // the server said a word this build does not know would be a claim about
  // who has already been told.
  return (ANNOUNCEMENT_STATUSES as readonly string[]).includes(value)
    ? (value as AnnouncementStatus)
    : 'draft';
}

export function toAnnouncementSummary(raw: unknown): AnnouncementSummary {
  const row = (raw ?? {}) as Row;
  return {
    id: Number(row.id),
    title: str(row.title),
    priority: toPriority(row.priority),
    status: toStatus(row.status),
    author: str(row.author),
    createdAt: str(row.created_at),
    publishedAt: nullableStr(row.published_at),
    recipientCount: toCount(row.recipient_count),
  };
}

function toAudienceRule(raw: unknown): AnnouncementAudienceRule {
  const row = (raw ?? {}) as Row;
  return {
    kind: str(row.kind),
    company: str(row.company),
    branch: nullableStr(row.branch),
    role: nullableStr(row.role),
    capabilityCode: nullableStr(row.capability_code),
    user: nullableStr(row.user),
  };
}

export function toAnnouncementDetail(raw: unknown): AnnouncementDetail {
  const row = (raw ?? {}) as Row;
  const audience = row.audience;
  return {
    ...toAnnouncementSummary(row),
    body: str(row.body),
    // Absent means "you are a recipient, not the sender". Null rather than an
    // empty array, so a screen cannot read "sent to nobody" out of silence.
    audience: Array.isArray(audience) ? audience.map(toAudienceRule) : null,
  };
}

export function toAnnouncementStats(raw: unknown): AnnouncementStats {
  const row = (raw ?? {}) as Row;
  const pct = Number(row.read_pct);
  return {
    recipients: toCount(row.recipients),
    read: toCount(row.read),
    unread: toCount(row.unread),
    // The server computes the percentage; this app never divides to get it.
    readPct: Number.isFinite(pct) && pct > 0 ? pct : 0,
  };
}

function translate(error: unknown): never {
  if (error instanceof ApiError) {
    if (error.status === 403) throw new InternalCapabilityMissingError(error.message);
    if (error.status === 404) throw new InternalAccessDeniedError();
  }
  throw error;
}

export type AnnouncementQuery = {
  status?: AnnouncementStatus;
  page?: number;
  pageSize?: number;
};

export type AnnouncementPage = {
  items: readonly AnnouncementSummary[];
  count: number;
  page: number;
  pageSize: number;
};

/** What this company has sent. `communications.manage`. */
export async function fetchAnnouncements(
  params: AnnouncementQuery,
  deps: Deps,
  signal?: AbortSignal,
): Promise<AnnouncementPage> {
  try {
    const body = await authenticatedRequest<unknown>(
      `${internalPath(requireTenant())}/communications/`,
      {
        scope: 'authenticated-v1',
        query: { status: params.status, page: params.page, page_size: params.pageSize },
        signal,
      },
      deps,
    );
    const row = (body ?? {}) as Row;
    const rows = Array.isArray(row.results) ? row.results : [];
    return {
      items: rows.map(toAnnouncementSummary),
      count: Number.isFinite(Number(row.count)) ? Number(row.count) : rows.length,
      page: Number.isFinite(Number(row.page)) ? Number(row.page) : (params.page ?? 1),
      pageSize: Number.isFinite(Number(row.page_size)) ? Number(row.page_size) : 20,
    };
  } catch (error) {
    return translate(error);
  }
}

/** One of this company's own messages, with its audience rules. */
export async function fetchAnnouncement(
  id: number,
  deps: Deps,
  signal?: AbortSignal,
): Promise<AnnouncementDetail> {
  try {
    return toAnnouncementDetail(
      await authenticatedRequest<unknown>(
        `${internalPath(requireTenant())}/communications/${encodeURIComponent(String(id))}/`,
        { scope: 'authenticated-v1', signal },
        deps,
      ),
    );
  } catch (error) {
    return translate(error);
  }
}

/** Aggregates for a published message. No per-person list exists to ask for. */
export async function fetchAnnouncementStats(
  id: number,
  deps: Deps,
  signal?: AbortSignal,
): Promise<AnnouncementStats> {
  try {
    return toAnnouncementStats(
      await authenticatedRequest<unknown>(
        `${internalPath(requireTenant())}/communications/${encodeURIComponent(
          String(id),
        )}/stats/`,
        { scope: 'authenticated-v1', signal },
        deps,
      ),
    );
  } catch (error) {
    return translate(error);
  }
}

/**
 * The communiqué a notification pointed at.
 *
 * NO CAPABILITY. The server answers 404 — never 403 — when the message was not
 * addressed to the caller in this company, because a communiqué you were not
 * sent does not exist for you, and saying otherwise would let somebody
 * enumerate what other companies tell their staff.
 */
export async function fetchAddressedAnnouncement(
  id: number,
  deps: Deps,
  signal?: AbortSignal,
): Promise<AnnouncementDetail> {
  try {
    return toAnnouncementDetail(
      await authenticatedRequest<unknown>(
        `${internalPath(requireTenant())}/announcements/${encodeURIComponent(String(id))}/`,
        { scope: 'authenticated-v1', signal },
        deps,
      ),
    );
  } catch (error) {
    return translate(error);
  }
}
