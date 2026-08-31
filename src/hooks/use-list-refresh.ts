import { useConnectivity } from '@/connectivity/connectivity-provider';

/**
 * Pull-to-refresh, disabled when it could not possibly work.
 *
 * Two failure modes this avoids:
 *
 *  1. **The spinner that never stops.** With `onlineManager` wired to real
 *     connectivity, a refetch issued while offline is PAUSED rather than
 *     rejected — so `isRefetching` stays true and the control spins until the
 *     radio returns. Better to not offer the gesture.
 *  2. **A gesture on a feature that has no backend.** Pulling to refresh a
 *     "Próximamente" screen promises something the build cannot deliver.
 *
 * Returning `undefined` for `onRefresh` is what removes the control entirely:
 * React Native only attaches a `RefreshControl` when there is a handler.
 */
export function useListRefresh(
  query: { refetch: () => Promise<unknown>; isRefetching: boolean },
  options: { enabled?: boolean } = {},
): { onRefresh: (() => void) | undefined; refreshing: boolean } {
  const { isOffline } = useConnectivity();
  const enabled = (options.enabled ?? true) && !isOffline;

  return {
    onRefresh: enabled
      ? () => {
          void query.refetch();
        }
      : undefined,
    // Reported false when disabled, so a refetch that was already in flight
    // when connectivity dropped cannot leave the control spinning.
    refreshing: enabled ? query.isRefetching : false,
  };
}
