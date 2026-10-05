import { useQuery } from '@tanstack/react-query';

import type { AnnouncementStatus } from '@/domain/internal/announcement-types';
import { getAuthRuntime } from '@/auth/auth-runtime';
import { queryKeys } from '@/providers/query-client';
import { useQueryScope } from '@/providers/use-query-scope';
import { V1InternalCommunicationsRepository } from '@/repositories/api/v1-internal-communications-repository';

/**
 * Communiqués — M12C, read side.
 *
 * `retry: false` throughout, like the rest of the internal surface: the
 * interesting failures are permanent answers. 403 means the capability is gone,
 * 404 means this company is closed to you or the message was never sent to you.
 */
function repository(): V1InternalCommunicationsRepository {
  return new V1InternalCommunicationsRepository({
    refreshCoordinator: getAuthRuntime().coordinator,
  });
}

/** What this company has sent. `communications.manage`. */
export function useAnnouncements(
  params: { status?: AnnouncementStatus; page?: number } = {},
  options: { enabled?: boolean } = {},
) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.internalAnnouncements(scope, params),
    queryFn: ({ signal }) => repository().listAnnouncements(params, signal),
    enabled: options.enabled ?? true,
    retry: false,
  });
}

export function useAnnouncement(
  id: number | undefined,
  options: { enabled?: boolean } = {},
) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.internalAnnouncement(scope, id ?? -1),
    queryFn: ({ signal }) => repository().getAnnouncement(id!, signal),
    enabled: (options.enabled ?? true) && id !== undefined && Number.isFinite(id),
    retry: false,
  });
}

/**
 * How far a published message got.
 *
 * SECONDARY: the detail screen renders it inline and never gates on it. A draft
 * has no numbers worth asking for, so the caller holds this back.
 */
export function useAnnouncementStats(
  id: number | undefined,
  options: { enabled?: boolean } = {},
) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.internalAnnouncementStats(scope, id ?? -1),
    queryFn: ({ signal }) => repository().getAnnouncementStats(id!, signal),
    enabled: (options.enabled ?? true) && id !== undefined && Number.isFinite(id),
    retry: false,
  });
}

/**
 * A message that was sent to ME.
 *
 * No capability, and a different cache key from the manager's view of the same
 * message: the two carry different fields — the sender sees the audience rules,
 * a recipient must not — and one shared slot would let whichever loaded first
 * decide what the other shows.
 */
export function useAddressedAnnouncement(
  id: number | undefined,
  options: { enabled?: boolean } = {},
) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.internalAddressedAnnouncement(scope, id ?? -1),
    queryFn: ({ signal }) => repository().getAddressedAnnouncement(id!, signal),
    enabled: (options.enabled ?? true) && id !== undefined && Number.isFinite(id),
    retry: false,
  });
}
