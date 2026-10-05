import { useQuery } from '@tanstack/react-query';

import { getAuthRuntime } from '@/auth/auth-runtime';
import type { AnnouncementStatus } from '@/domain/internal/announcement-types';
import { queryKeys } from '@/providers/query-client';
import { useQueryScope } from '@/providers/use-query-scope';
import { V1PlatformAnnouncementsRepository } from '@/repositories/api/v1-platform-announcements-repository';

/**
 * Platform-wide communiqués — M12C, read side.
 *
 * Every hook here takes `enabled` from the caller, which passes the SESSION's
 * answer about the account being the platform master. That is a decision about
 * what to draw: the server asks `is_superuser` itself and answers 404 to
 * anybody else, so a disabled query is a quiet screen rather than a guard.
 */
function repository(): V1PlatformAnnouncementsRepository {
  return new V1PlatformAnnouncementsRepository({
    refreshCoordinator: getAuthRuntime().coordinator,
  });
}

export function usePlatformAnnouncements(
  params: { status?: AnnouncementStatus; page?: number } = {},
  options: { enabled?: boolean } = {},
) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.platformAnnouncements(scope, params),
    queryFn: ({ signal }) => repository().listAnnouncements(params, signal),
    enabled: options.enabled ?? true,
    retry: false,
  });
}

export function usePlatformAnnouncement(
  id: number | undefined,
  options: { enabled?: boolean } = {},
) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.platformAnnouncement(scope, id ?? -1),
    queryFn: ({ signal }) => repository().getAnnouncement(id!, signal),
    enabled: (options.enabled ?? true) && id !== undefined && Number.isFinite(id),
    retry: false,
  });
}

export function usePlatformAnnouncementStats(
  id: number | undefined,
  options: { enabled?: boolean } = {},
) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.platformAnnouncementStats(scope, id ?? -1),
    queryFn: ({ signal }) => repository().getAnnouncementStats(id!, signal),
    enabled: (options.enabled ?? true) && id !== undefined && Number.isFinite(id),
    retry: false,
  });
}
