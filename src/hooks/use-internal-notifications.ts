import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getAuthRuntime } from '@/auth/auth-runtime';
import { queryKeys } from '@/providers/query-client';
import { useQueryScope } from '@/providers/use-query-scope';
import { V1InternalNotificationRepository } from '@/repositories/api/v1-internal-notification-repository';

/**
 * The staff inbox — M12B, internal audience.
 *
 * Built lazily from the shared auth runtime, like every other internal
 * repository, so there is one token graph rather than two coordinators
 * rotating the same refresh token against each other.
 *
 * No capability gate: being an active member of the company is the whole
 * requirement, which is the server's decision and not an omission here.
 */
function repository(): V1InternalNotificationRepository {
  return new V1InternalNotificationRepository({
    refreshCoordinator: getAuthRuntime().coordinator,
  });
}

export function useInternalNotifications(
  params: { unreadOnly?: boolean; page?: number } = {},
  options: { enabled?: boolean } = {},
) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.internalNotifications(scope, params),
    queryFn: ({ signal }) => repository().listNotifications(params, signal),
    enabled: options.enabled ?? true,
    retry: false,
  });
}

/** The badge. Its own request: a page of twenty cannot count two hundred. */
export function useInternalUnreadCount(options: { enabled?: boolean } = {}) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.internalNotificationsUnread(scope),
    queryFn: ({ signal }) => repository().getUnreadCount(signal),
    enabled: options.enabled ?? true,
    retry: false,
  });
}

/**
 * Mark one notice read, or all of them.
 *
 * `onSettled`, not `onSuccess`: a 404 means the row is not what the screen
 * thinks it is, and the honest next step is to refetch what is really there.
 * Nothing is drawn as read before the server agrees — `read_at` is its record.
 */
function useReadMutation<TInput>(run: (input: TInput) => Promise<unknown>) {
  const client = useQueryClient();
  const scope = useQueryScope();

  return useMutation({
    mutationFn: run,
    onSettled: () => {
      void client.invalidateQueries({ queryKey: queryKeys.internalNotificationsRoot(scope) });
      void client.invalidateQueries({ queryKey: queryKeys.internalNotificationsUnread(scope) });
    },
    retry: false,
  });
}

export function useMarkInternalNotificationRead() {
  return useReadMutation<number>((id) => repository().markRead(id));
}

export function useMarkAllInternalNotificationsRead() {
  return useReadMutation<void>(() => repository().markAllRead());
}
