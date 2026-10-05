import {
  fetchAddressedAnnouncement,
  fetchAnnouncement,
  fetchAnnouncements,
  fetchAnnouncementStats,
  type AnnouncementQuery,
} from '@/api/endpoints/internal-communications-v1';
import type { RefreshCoordinator } from '@/auth/refresh-coordinator';

/**
 * Communiqués — M12C, read side.
 *
 * Two audiences in one class because they are the same domain object seen from
 * two distances: `listAnnouncements` is the sender looking at what it sent,
 * `getAddressedAnnouncement` is a recipient opening what they were sent. The
 * server gates them differently and the methods are named so a caller cannot
 * confuse one for the other.
 */
export class V1InternalCommunicationsRepository {
  constructor(private readonly deps: { refreshCoordinator: RefreshCoordinator }) {}

  async listAnnouncements(params: AnnouncementQuery, signal?: AbortSignal) {
    return fetchAnnouncements(params, this.deps, signal);
  }

  async getAnnouncement(id: number, signal?: AbortSignal) {
    return fetchAnnouncement(id, this.deps, signal);
  }

  async getAnnouncementStats(id: number, signal?: AbortSignal) {
    return fetchAnnouncementStats(id, this.deps, signal);
  }

  async getAddressedAnnouncement(id: number, signal?: AbortSignal) {
    return fetchAddressedAnnouncement(id, this.deps, signal);
  }
}
