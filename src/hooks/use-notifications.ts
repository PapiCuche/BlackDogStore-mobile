import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/providers/query-client';
import { useQueryScope } from '@/providers/use-query-scope';
import { repositories } from '@/repositories';
import { featureUnavailable } from '@/repositories/errors';

/**
 * The customer's own inbox — M12B.
 *
 * PRIVATE queries, so `enabled` belongs to the caller: a screen holds them
 * back until a session exists rather than firing a request that can only come
 * back 401.
 *
 * `retry: false` for the same reason the other private reads use it: the
 * interesting failure here — "not a client of this company" — is a permanent
 * answer the server gives as an empty inbox, and asking again only delays an
 * honest screen.
 */
const UNAVAILABLE = 'Los avisos no están disponibles en esta versión de la app.';

export function useNotifications(
  params: { unreadOnly?: boolean; page?: number } = {},
  options: { enabled?: boolean } = {},
) {
  const repository = repositories.notifications;
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.notifications(scope, params),
    queryFn: ({ signal }) =>
      repository
        ? repository.listNotifications(params, signal)
        : featureUnavailable('customerNotifications', UNAVAILABLE),
    enabled: options.enabled ?? true,
    retry: false,
  });
}

/**
 * The badge.
 *
 * Its own request, never a count of the page in hand. A screen may render
 * without it — that is why nothing gates on its error state.
 */
export function useUnreadNotificationCount(options: { enabled?: boolean } = {}) {
  const repository = repositories.notifications;
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.notificationsUnread(scope),
    queryFn: ({ signal }) =>
      repository
        ? repository.getUnreadCount(signal)
        : featureUnavailable('customerNotifications', UNAVAILABLE),
    enabled: options.enabled ?? true,
    retry: false,
  });
}

/**
 * Mark one notice read.
 *
 * NO OPTIMISTIC WRITE. `read_at` is the server's timestamp, and a row drawn as
 * read before the server agreed would survive a failed request as a lie about
 * what the platform recorded.
 *
 * Invalidation sweeps the whole inbox root: reading one notice changes the
 * page AND the badge, and refetching one without the other shows a screen that
 * disagrees with itself.
 */
export function useMarkNotificationRead() {
  const client = useQueryClient();
  const scope = useQueryScope();

  return useMutation({
    mutationFn: (id: number) => {
      const repository = repositories.notifications;
      return repository
        ? repository.markRead(id)
        : featureUnavailable('customerNotifications', UNAVAILABLE);
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: queryKeys.notificationsRoot(scope) });
      void client.invalidateQueries({ queryKey: queryKeys.notificationsUnread(scope) });
    },
  });
}

/** Mark every unread notice read. Same invalidation, same reason. */
export function useMarkAllNotificationsRead() {
  const client = useQueryClient();
  const scope = useQueryScope();

  return useMutation({
    mutationFn: () => {
      const repository = repositories.notifications;
      return repository
        ? repository.markAllRead()
        : featureUnavailable('customerNotifications', UNAVAILABLE);
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: queryKeys.notificationsRoot(scope) });
      void client.invalidateQueries({ queryKey: queryKeys.notificationsUnread(scope) });
    },
  });
}
