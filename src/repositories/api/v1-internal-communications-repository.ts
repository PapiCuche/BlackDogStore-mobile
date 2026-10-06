import {
  cancelAnnouncementDraft,
  createAnnouncementDraft,
  fetchAddressedAnnouncement,
  fetchAnnouncement,
  fetchAnnouncements,
  fetchAnnouncementStats,
  previewAnnouncement,
  publishAnnouncement,
  updateAnnouncementDraft,
  type AnnouncementQuery,
} from '@/api/endpoints/internal-communications-v1';
import type { RefreshCoordinator } from '@/auth/refresh-coordinator';
import type { AnnouncementDraftInput } from '@/domain/internal/announcement-types';

/**
 * Communiqués — M12C.
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

  // Authoring. Every one of these needs `communications.manage` in THIS
  // company, and the audience this app can compose is the whole company — the
  // other four kinds name identifiers no v1 route publishes (BR-012).
  async createDraft(input: AnnouncementDraftInput, signal?: AbortSignal) {
    return createAnnouncementDraft(input, this.deps, signal);
  }

  async updateDraft(
    id: number,
    changes: Partial<AnnouncementDraftInput> & { audienceAllCompany?: true },
    signal?: AbortSignal,
  ) {
    return updateAnnouncementDraft(id, changes, this.deps, signal);
  }

  async previewDraft(id: number, signal?: AbortSignal) {
    return previewAnnouncement(id, this.deps, signal);
  }

  async publishDraft(id: number, signal?: AbortSignal) {
    return publishAnnouncement(id, this.deps, signal);
  }

  async cancelDraft(id: number, signal?: AbortSignal) {
    return cancelAnnouncementDraft(id, this.deps, signal);
  }
}
