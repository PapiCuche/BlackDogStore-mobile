import { companySlug } from '@/config/env';
import type { RefreshCoordinator } from '@/auth/refresh-coordinator';
import type { AppNotification, NotificationPage } from '@/domain/notifications/types';
import { EMPTY_NOTIFICATION_PAGE } from '@/domain/notifications/types';

import { authenticatedRequest } from '../authenticated-request';
import { ApiError } from '../errors';

import { toNotification } from './customer-notifications-v1';

/**
 * The STAFF inbox — `/api/v1/internal/<company_slug>/notifications/`.
 *
 * Verified on `PapiCuche/BlackDogStore-web` @ `origin/master`
 * `aec829c697674efb61f9776a4f796bfc05663ddc` (`store/notification_views.py`,
 * M12B), the same four operations the customer surface has:
 *
 *   GET    notifications/                 the page
 *   GET    notifications/unread-count/    the badge
 *   POST   notifications/<id>/read/       one notice
 *   POST   notifications/read-all/        every unread one
 *
 * TWO SURFACES THAT NEVER MIX. This module exists at all because the server
 * refuses to serve both audiences from one endpoint that branches on
 * `is_staff`: one boolean between a colleague's inbox and a customer's is
 * exactly the shape M12B split apart. So the paths are separate here too, and
 * the cache keys they feed live under the INTERNAL namespace.
 *
 * NO CAPABILITY, and that is the backend's decision. An assignment notice is
 * not administrative data about other people — it is what the platform told
 * THIS person — and gating it would let an admin stop somebody reading their
 * own work. Being an active member of the company is the whole requirement.
 *
 * The row shape is identical to the customer one, so `toNotification` is shared
 * rather than copied: two mappers for one server payload would drift the moment
 * a field moved.
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
  return `/api/v1/internal/${encodeURIComponent(slug)}/notifications`;
}

function requireTenant(): string {
  if (!companySlug) throw new MissingTenantError();
  return companySlug;
}

const DEFAULT_PAGE_SIZE = 20;

export type InternalNotificationQuery = {
  page?: number;
  pageSize?: number;
  unreadOnly?: boolean;
};

function listQuery(
  params: InternalNotificationQuery,
): Record<string, string | number | boolean | undefined> {
  return {
    page: params.page,
    page_size: params.pageSize,
    unread: params.unreadOnly ? '1' : undefined,
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

/**
 * One page of the caller's own staff inbox in this company.
 *
 * A 404 is an empty inbox: on the internal surface it means the company is
 * unknown, closed, or this person is not an active member of it, and the server
 * makes those indistinguishable so a valid login cannot map the platform's
 * tenants. All three read the same way on screen.
 */
export async function fetchInternalNotifications(
  params: InternalNotificationQuery,
  deps: { refreshCoordinator: RefreshCoordinator },
  signal?: AbortSignal,
): Promise<NotificationPage> {
  try {
    const body = await authenticatedRequest<unknown>(
      `${notificationsPath(requireTenant())}/`,
      { scope: 'authenticated-v1', query: listQuery(params), signal },
      deps,
    );
    return toPage(body, params.page ?? 1, params.pageSize ?? DEFAULT_PAGE_SIZE);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return EMPTY_NOTIFICATION_PAGE;
    throw error;
  }
}

export async function fetchInternalUnreadCount(
  deps: { refreshCoordinator: RefreshCoordinator },
  signal?: AbortSignal,
): Promise<number> {
  try {
    const body = await authenticatedRequest<unknown>(
      `${notificationsPath(requireTenant())}/unread-count/`,
      { scope: 'authenticated-v1', signal },
      deps,
    );
    const unread = Number((body as Record<string, unknown>)?.unread);
    return Number.isFinite(unread) && unread > 0 ? unread : 0;
  } catch (error) {
    // A badge is never the reason a screen fails.
    if (error instanceof ApiError && error.status === 404) return 0;
    throw error;
  }
}

export async function markInternalNotificationRead(
  id: number,
  deps: { refreshCoordinator: RefreshCoordinator },
  signal?: AbortSignal,
): Promise<AppNotification> {
  return toNotification(
    await authenticatedRequest<unknown>(
      `${notificationsPath(requireTenant())}/${encodeURIComponent(String(id))}/read/`,
      { scope: 'authenticated-v1', method: 'POST', body: {}, signal },
      deps,
    ),
  );
}

export async function markAllInternalNotificationsRead(
  deps: { refreshCoordinator: RefreshCoordinator },
  signal?: AbortSignal,
): Promise<number> {
  const body = await authenticatedRequest<unknown>(
    `${notificationsPath(requireTenant())}/read-all/`,
    { scope: 'authenticated-v1', method: 'POST', body: {}, signal },
    deps,
  );
  const marked = Number((body as Record<string, unknown>)?.marked);
  return Number.isFinite(marked) && marked > 0 ? marked : 0;
}
