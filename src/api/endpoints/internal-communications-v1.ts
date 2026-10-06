import { companySlug } from '@/config/env';
import type { RefreshCoordinator } from '@/auth/refresh-coordinator';
import type {
  AnnouncementDraftInput,
  AnnouncementPreview,
  AnnouncementAudienceRule,
  AnnouncementDetail,
  AnnouncementStats,
  AnnouncementStatus,
  AnnouncementSummary,
} from '@/domain/internal/announcement-types';
import {
  ANNOUNCEMENT_AUDIENCE_ALL_COMPANY,
  ANNOUNCEMENT_STATUSES,
} from '@/domain/internal/announcement-types';
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
 * AUTHORING, and the one part of it a phone can do:
 *
 *   POST  communications/              create a draft
 *   PATCH communications/<id>/         title, body, priority, audience
 *   POST  communications/<id>/preview/ how many it WOULD reach
 *   POST  communications/<id>/publish/ send it
 *   POST  communications/<id>/cancel/  retire a draft
 *
 * THE AUDIENCE IS WHERE THIS STOPS. `AnnouncementAudienceRule.Kind` offers
 * `all_company`, `branch`, `role`, `capability` and `user`; the last four need
 * a `branch_id`, a `role_id`, a `capability_code` from the catalogue or a
 * `user_id`, and `/api/v1/` publishes no route that lists any of them —
 * `internal/context/` deliberately answers "what may I see?" and nothing else.
 * So this module composes `all_company` and refuses to fabricate the rest:
 * guessing an id would address a message to the wrong people. See BR-012.
 *
 * NOTHING IS WIDENED BY OMISSION, on either side. The server refuses a draft
 * with no audience rather than reading it as "everybody", and this client never
 * sends `all_company` as a default — publishing to the whole company is an act
 * the operator performs, not a fallback.
 *
 * PREVIEW IS INFORMATIVE, NEVER AUTHORITATIVE. The server says so itself:
 * publication resolves the audience again from scratch, because somebody joins
 * or leaves between the two calls. The count is shown as of the moment it was
 * asked for and is never kept as the recipient list.
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

function communicationPath(id: number, action = ''): string {
  return `${internalPath(requireTenant())}/communications/${encodeURIComponent(
    String(id),
  )}/${action}`;
}

export function toAnnouncementPreview(raw: unknown): AnnouncementPreview {
  const row = (raw ?? {}) as Row;
  const companies = row.companies;
  return {
    recipientCount: toCount(row.recipient_count),
    companyCount: toCount(row.company_count),
    companies: Array.isArray(companies)
      ? companies.map((entry) => {
          const company = (entry ?? {}) as Row;
          return {
            slug: str(company.slug),
            name: str(company.name),
            recipientCount: toCount(company.recipient_count),
          };
        })
      : [],
  };
}

/**
 * Start a communiqué.
 *
 * It is born a DRAFT with no audience, and the server keeps it that way: there
 * is no field here that would publish it, and `publish` refuses a draft nobody
 * was addressed to. Writing the text and deciding who reads it are two acts.
 */
export async function createAnnouncementDraft(
  input: AnnouncementDraftInput,
  deps: Deps,
  signal?: AbortSignal,
): Promise<AnnouncementDetail> {
  try {
    return toAnnouncementDetail(
      await authenticatedRequest<unknown>(
        `${internalPath(requireTenant())}/communications/`,
        {
          scope: 'authenticated-v1',
          method: 'POST',
          body: {
            title: input.title,
            body: input.body,
            priority: input.priority,
          },
          signal,
        },
        deps,
      ),
    );
  } catch (error) {
    return translate(error);
  }
}

/**
 * Edit a draft, and optionally say who it goes to.
 *
 * `audience` is sent only when the caller asks for it, because `set_audience`
 * REPLACES the rules: a PATCH that carried it by habit would overwrite a
 * distribution list the Web console had composed with branches and roles this
 * app cannot even display.
 *
 * The one audience this app composes is the whole company — see BR-012 — and
 * it is passed as an argument rather than defaulted, so sending a message to
 * everybody is always something somebody chose.
 */
export async function updateAnnouncementDraft(
  id: number,
  changes: Partial<AnnouncementDraftInput> & { audienceAllCompany?: true },
  deps: Deps,
  signal?: AbortSignal,
): Promise<AnnouncementDetail> {
  const body: Record<string, unknown> = {};
  if (changes.title !== undefined) body.title = changes.title;
  if (changes.body !== undefined) body.body = changes.body;
  if (changes.priority !== undefined) body.priority = changes.priority;
  if (changes.audienceAllCompany) {
    body.audience = [{ kind: ANNOUNCEMENT_AUDIENCE_ALL_COMPANY }];
  }

  try {
    return toAnnouncementDetail(
      await authenticatedRequest<unknown>(
        communicationPath(id),
        { scope: 'authenticated-v1', method: 'PATCH', body, signal },
        deps,
      ),
    );
  } catch (error) {
    return translate(error);
  }
}

/**
 * How many people it would reach right now.
 *
 * A POST because the server resolves the audience to answer, and the answer is
 * NOT kept: publication resolves it again from scratch.
 */
export async function previewAnnouncement(
  id: number,
  deps: Deps,
  signal?: AbortSignal,
): Promise<AnnouncementPreview> {
  try {
    return toAnnouncementPreview(
      await authenticatedRequest<unknown>(
        communicationPath(id, 'preview/'),
        { scope: 'authenticated-v1', method: 'POST', body: {}, signal },
        deps,
      ),
    );
  } catch (error) {
    return translate(error);
  }
}

/**
 * Send it.
 *
 * ONE NOTIFICATION ROW PER RECIPIENT, written by the server inside its own
 * transaction, and the audience is frozen at that moment. This cannot be
 * retried blindly and is not: publishing twice is a second message in forty
 * people's inboxes. The server answers the published communiqué, including the
 * frozen `recipient_count`, and that is what the screen then shows.
 */
export async function publishAnnouncement(
  id: number,
  deps: Deps,
  signal?: AbortSignal,
): Promise<AnnouncementDetail> {
  try {
    return toAnnouncementDetail(
      await authenticatedRequest<unknown>(
        communicationPath(id, 'publish/'),
        { scope: 'authenticated-v1', method: 'POST', body: {}, signal },
        deps,
      ),
    );
  } catch (error) {
    return translate(error);
  }
}

/**
 * Retire a draft.
 *
 * Only a draft: a published communiqué is in people's inboxes and the server
 * refuses to unsay it. Cancelling an already-cancelled one is not an error
 * there either, so the client does not pretend it is.
 */
export async function cancelAnnouncementDraft(
  id: number,
  deps: Deps,
  signal?: AbortSignal,
): Promise<AnnouncementDetail> {
  try {
    return toAnnouncementDetail(
      await authenticatedRequest<unknown>(
        communicationPath(id, 'cancel/'),
        { scope: 'authenticated-v1', method: 'POST', body: {}, signal },
        deps,
      ),
    );
  } catch (error) {
    return translate(error);
  }
}
