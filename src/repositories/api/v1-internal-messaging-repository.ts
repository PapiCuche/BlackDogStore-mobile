import {
  fetchMessagingSettings,
  patchMessagingSettings,
} from '@/api/endpoints/internal-messaging-v1';
import type { RefreshCoordinator } from '@/auth/refresh-coordinator';
import type { MessagingSettingsInput } from '@/domain/internal/messaging-types';

/** The tenant's WhatsApp setup: read with `settings.view`, write with `settings.manage`. */
export class V1InternalMessagingRepository {
  constructor(private readonly deps: { refreshCoordinator: RefreshCoordinator }) {}

  async getSettings(signal?: AbortSignal) {
    return fetchMessagingSettings(this.deps, signal);
  }

  async updateSettings(input: MessagingSettingsInput, signal?: AbortSignal) {
    return patchMessagingSettings(input, this.deps, signal);
  }
}
