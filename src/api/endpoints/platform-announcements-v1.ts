import type { RefreshCoordinator } from '@/auth/refresh-coordinator';
import type {
  AnnouncementDetail,
  AnnouncementStats,
  AnnouncementStatus,
} from '@/domain/internal/announcement-types';

import { authenticatedRequest } from '../authenticated-request';
import { ApiError } from '../errors';
import {
  toAnnouncementDetail,
  toAnnouncementSummary,
  toAnnouncementStats,
  type AnnouncementPage,
} from './internal-communications-v1';

/**
 * Platform-wide communiqués — M12C, the master's side.
 *
 * Verified on `PapiCuche/BlackDogStore-web` @ `origin/master`
 * `aec829c697674efb61f9776a4f796bfc05663ddc`
 * (`store/announcement_views.py` > `_PlatformMixin` and the four views):
 *
 *   GET platform/announcements/              every company's messages
 *   GET platform/announcements/<id>/         one, with its audience rules
 *   GET platform/announcements/<id>/stats/   aggregates
 *
 * THE AUTHORITY IS THE ACCOUNT, NOT A ROLE. `_PlatformMixin` asks
 * `user.is_superuser` and nothing else — never a tenant role called "Master",
 * never a membership stood up for the purpose. A caller who is not one gets
 * 404, not 403: the platform surface does not confirm that it exists.
 *
 * NO TENANT IN THE PATH, deliberately: these messages cross companies, which is
 * exactly why only the platform account may read them.
 *
 * WRITING IS NOT HERE. Creating, editing, composing cross-tenant audience
 * rules, previewing and publishing all exist on the server. Publishing one of
 * these writes a notification row for every recipient in every company it
 * names, and that is not an act to expose on a phone before there is an
 * audience editor to make it legible.
 */

type Deps = { refreshCoordinator: RefreshCoordinator };
type Row = Record<string, unknown>;

const PLATFORM_PATH = '/api/v1/platform/announcements/';

/** The platform surface answers 404 to anybody who is not the master account. */
export class PlatformAccessDeniedError extends Error {
  constructor() {
    super('Esta sección es de la administración de la plataforma.');
    this.name = 'PlatformAccessDeniedError';
  }
}

function translate(error: unknown): never {
  if (error instanceof ApiError && error.status === 404) {
    throw new PlatformAccessDeniedError();
  }
  throw error;
}

export async function fetchPlatformAnnouncements(
  params: { status?: AnnouncementStatus; page?: number; pageSize?: number },
  deps: Deps,
  signal?: AbortSignal,
): Promise<AnnouncementPage> {
  try {
    const body = await authenticatedRequest<unknown>(
      PLATFORM_PATH,
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

export async function fetchPlatformAnnouncement(
  id: number,
  deps: Deps,
  signal?: AbortSignal,
): Promise<AnnouncementDetail> {
  try {
    return toAnnouncementDetail(
      await authenticatedRequest<unknown>(
        `${PLATFORM_PATH}${encodeURIComponent(String(id))}/`,
        { scope: 'authenticated-v1', signal },
        deps,
      ),
    );
  } catch (error) {
    return translate(error);
  }
}

export async function fetchPlatformAnnouncementStats(
  id: number,
  deps: Deps,
  signal?: AbortSignal,
): Promise<AnnouncementStats> {
  try {
    return toAnnouncementStats(
      await authenticatedRequest<unknown>(
        `${PLATFORM_PATH}${encodeURIComponent(String(id))}/stats/`,
        { scope: 'authenticated-v1', signal },
        deps,
      ),
    );
  } catch (error) {
    return translate(error);
  }
}
