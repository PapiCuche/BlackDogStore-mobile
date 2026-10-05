import {
  fetchPlatformAnnouncement,
  fetchPlatformAnnouncementStats,
  fetchPlatformAnnouncements,
} from '@/api/endpoints/platform-announcements-v1';
import type { RefreshCoordinator } from '@/auth/refresh-coordinator';
import type { AnnouncementStatus } from '@/domain/internal/announcement-types';

/**
 * Platform-wide communiqués, read side.
 *
 * Separate from the tenant repository although the row shape is the same: these
 * cross companies and are gated on the ACCOUNT being the platform master, not
 * on any capability inside a company.
 */
export class V1PlatformAnnouncementsRepository {
  constructor(private readonly deps: { refreshCoordinator: RefreshCoordinator }) {}

  async listAnnouncements(
    params: { status?: AnnouncementStatus; page?: number },
    signal?: AbortSignal,
  ) {
    return fetchPlatformAnnouncements(params, this.deps, signal);
  }

  async getAnnouncement(id: number, signal?: AbortSignal) {
    return fetchPlatformAnnouncement(id, this.deps, signal);
  }

  async getAnnouncementStats(id: number, signal?: AbortSignal) {
    return fetchPlatformAnnouncementStats(id, this.deps, signal);
  }
}
