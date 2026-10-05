import { companySlug } from '@/config/env';
import type {
  AppNotification,
  NotificationPage,
  NotificationPriority,
  NotificationSource,
} from '@/domain/notifications/types';
import { EMPTY_NOTIFICATION_PAGE } from '@/domain/notifications/types';

import type { RefreshCoordinator } from '@/auth/refresh-coordinator';

import { authenticatedRequest } from '../authenticated-request';
import { ApiError } from '../errors';

/**
 * The CUSTOMER inbox — `/api/v1/customer/<company_slug>/notifications/`.
 *
 * Verified on `PapiCuche/BlackDogStore-web` @ `origin/master`
 * `aec829c697674efb61f9776a4f796bfc05663ddc`, reading
 * `store/notification_views.py` (M12B) and `store/v1_urls.py`.
 *
 * FOUR OPERATIONS, ONE INBOX:
 *
 *   GET    notifications/                 the page
 *   GET    notifications/unread-count/    the badge, as a COUNT
 *   POST   notifications/<id>/read/       one notice
 *   POST   notifications/read-all/        every unread one
 *
 * NO CAPABILITY, BY DESIGN. This is not administrative data about other
 * people: it is what the platform told THIS person. The server scopes the
 * queryset to the `Customer` row that matches the caller and the company in
 * the path, so an id from a colleague's inbox — or another tenant's — answers
 * 404 rather than 403. A 403 would confirm the row exists.
 *
 * The badge is its own request on purpose. Counting a page client-side would
 * report "20 unread" for an inbox of two hundred.
 */

/**
 * Raised when a build with no resolved tenant asks for private records.
 *
 * Declared here like every other customer endpoint module declares it: nothing
 * was sent, so this is not an `ApiError`, and `retry-policy.ts` already treats
 * the name as terminal.
 */
export class MissingTenantError extends Error {
  constructor() {
    super(
      'Esta build no tiene empresa configurada (EXPO_PUBLIC_COMPANY_SLUG). ' +
        'No se pueden pedir avisos sin saber de qué empresa.',
    );
    this.name = 'MissingTenantError';
  }
}

function notificationsPath(slug: string): string {
  return `/api/v1/customer/${encodeURIComponent(slug)}/notifications`;
}

function requireTenant(): string {
  if (!companySlug) throw new MissingTenantError();
  return companySlug;
}

const PRIORITIES: readonly string[] = ['info', 'action', 'warning', 'critical'];
const SOURCES: readonly string[] = ['system', 'announcement'];

function toPriority(raw: unknown): NotificationPriority {
  const value = String(raw ?? '');
  // An unknown priority reads as `info`, never as `critical`. Inventing urgency
  // the server did not send would train people to ignore the ones that matter.
  return (PRIORITIES.includes(value) ? value : 'info') as NotificationPriority;
}

function toSource(raw: unknown): NotificationSource {
  const value = String(raw ?? '');
  return (SOURCES.includes(value) ? value : 'system') as NotificationSource;
}

export function toNotification(raw: unknown): AppNotification {
  const row = (raw ?? {}) as Record<string, unknown>;
  const targetId = row.target_id;
  return {
    id: Number(row.id),
    title: String(row.title ?? ''),
    body: String(row.body ?? ''),
    priority: toPriority(row.priority),
    source: toSource(row.source),
    targetType: String(row.target_type ?? ''),
    targetId:
      targetId === null || targetId === undefined || !Number.isFinite(Number(targetId))
        ? null
        : Number(targetId),
    readAt: row.read_at === null || row.read_at === undefined ? null : String(row.read_at),
    createdAt: String(row.created_at ?? ''),
  };
}

function toPage(raw: unknown, fallbackPage: number, fallbackSize: number): NotificationPage {
  const body = (raw ?? {}) as Record<string, unknown>;
  const rows = Array.isArray(body.results) ? body.results : [];
  return {
    items: rows.map(toNotification),
    count: Number.isFinite(Number(body.count)) ? Number(body.count) : rows.length,
    page: Number.isFinite(Number(body.page)) ? Number(body.page) : fallbackPage,
    pageSize: Number.isFinite(Number(body.page_size)) ? Number(body.page_size) : fallbackSize,
  };
}

export type NotificationQuery = {
  page?: number;
  pageSize?: number;
  unreadOnly?: boolean;
};

/** The server caps `page_size` at 50 and defaults to 20; mirror the default only. */
const DEFAULT_PAGE_SIZE = 20;

function listQuery(params: NotificationQuery): Record<string, string | number | boolean | undefined> {
  return {
    page: params.page,
    page_size: params.pageSize,
    // Only sent when asked for: an absent filter and `unread=0` are not the
    // same request, and the server reads any of 1/true/yes as "unread only".
    unread: params.unreadOnly ? '1' : undefined,
  };
}

/**
 * One page of the caller's own inbox.
 *
 * A 404 becomes an empty page, for the reason the orders list documents: on
 * this surface "unknown company", "inactive company" and "not a client here"
 * are deliberately indistinguishable, and all three read to a person as "there
 * is nothing of yours here".
 */
export async function fetchCustomerNotifications(
  params: NotificationQuery,
  deps: { refreshCoordinator: RefreshCoordinator },
  signal?: AbortSignal,
): Promise<NotificationPage> {
  const path = `${notificationsPath(requireTenant())}/`;
  try {
    const body = await authenticatedRequest<unknown>(
      path,
      { scope: 'authenticated-v1', query: listQuery(params), signal },
      deps,
    );
    return toPage(body, params.page ?? 1, params.pageSize ?? DEFAULT_PAGE_SIZE);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return EMPTY_NOTIFICATION_PAGE;
    throw error;
  }
}

/** The badge. The server counts; this app never tallies a page. */
export async function fetchCustomerUnreadCount(
  deps: { refreshCoordinator: RefreshCoordinator },
  signal?: AbortSignal,
): Promise<number> {
  const path = `${notificationsPath(requireTenant())}/unread-count/`;
  try {
    const body = await authenticatedRequest<unknown>(
      path,
      { scope: 'authenticated-v1', signal },
      deps,
    );
    const unread = Number((body as Record<string, unknown>)?.unread);
    return Number.isFinite(unread) && unread > 0 ? unread : 0;
  } catch (error) {
    // No badge rather than an error: a count nobody asked for must never be
    // the reason a screen fails.
    if (error instanceof ApiError && error.status === 404) return 0;
    throw error;
  }
}

/**
 * Mark one notice read.
 *
 * Idempotent server-side — a second call moves nothing — and the response is
 * the notice as it now stands, which is what the list redraws from.
 */
export async function markCustomerNotificationRead(
  id: number,
  deps: { refreshCoordinator: RefreshCoordinator },
  signal?: AbortSignal,
): Promise<AppNotification> {
  const path = `${notificationsPath(requireTenant())}/${encodeURIComponent(String(id))}/read/`;
  return toNotification(
    await authenticatedRequest<unknown>(
      path,
      { scope: 'authenticated-v1', method: 'POST', body: {}, signal },
      deps,
    ),
  );
}

/** Mark every unread notice read. Returns how many moved, per the server. */
export async function markAllCustomerNotificationsRead(
  deps: { refreshCoordinator: RefreshCoordinator },
  signal?: AbortSignal,
): Promise<number> {
  const path = `${notificationsPath(requireTenant())}/read-all/`;
  const body = await authenticatedRequest<unknown>(
    path,
    { scope: 'authenticated-v1', method: 'POST', body: {}, signal },
    deps,
  );
  const marked = Number((body as Record<string, unknown>)?.marked);
  return Number.isFinite(marked) && marked > 0 ? marked : 0;
}
