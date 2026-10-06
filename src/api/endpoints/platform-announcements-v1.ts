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
 * WRITING IS NOT HERE, and that is now a decision rather than a gap.
 *
 * The tenant surface gained authoring (M12C, `all_company`) because one of its
 * five audience kinds names no identifier. The platform surface has no such
 * option: `_parse_platform_rules` wants a list of company slugs or the literal
 * `ALL_ACTIVE_COMPANIES`, and `/api/v1/` publishes no route that lists the
 * companies — so the only audience composable from here is
 * `ALL_ACTIVE_COMPANIES` crossed with `all_company`, which is a notification
 * row for every person in every company on the platform.
 *
 * That single act is the broadest thing this system can do, and the server
 * makes it spell its own name precisely to keep it from happening by accident.
 * Offering it as the ONLY authoring this screen has — with no way to send to
 * one company instead — would make the dangerous send the easy one. It stays on
 * the console until BR-012 exposes the companies, and then both become
 * possible together.
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
