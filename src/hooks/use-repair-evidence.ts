import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/providers/query-client';
import { useQueryScope } from '@/providers/use-query-scope';
import { repositories } from '@/repositories';
import { featureUnavailable } from '@/repositories/errors';

/**
 * The photos the shop shared on one repair — M12D.
 *
 * SECONDARY to the repair itself, like the quote and the balance: the detail
 * screen renders this inline and never gates the page on it. Most repairs have
 * no shared photos, and a screen that failed to load because an absent thing
 * failed to load would be worse than the absence.
 */
const UNAVAILABLE = 'Las fotos no están disponibles en esta versión de la app.';

export function useRepairEvidence(
  repairId: number | undefined,
  options: { enabled?: boolean } = {},
) {
  const repository = repositories.repairs;
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.repairEvidence(scope, repairId ?? -1),
    queryFn: ({ signal }) =>
      repository
        ? repository.listEvidence(repairId!, signal)
        : featureUnavailable('repairs', UNAVAILABLE),
    enabled: (options.enabled ?? true) && repairId !== undefined && Number.isFinite(repairId),
    retry: false,
  });
}

/**
 * The Authorization header the image loader must send.
 *
 * A QUERY rather than a value read at render time, because the token lives in
 * memory and may be near expiry: resolving it can need a refresh, which is
 * asynchronous. The image loader cannot retry a 401 the way the JSON pipeline
 * does, so the header is made good BEFORE the request.
 *
 * `staleTime` is deliberately short. An access token outlives it comfortably,
 * and the cost of being wrong is a broken thumbnail.
 */
const AUTHORIZATION_FRESHNESS = 30_000;

export function useEvidenceAuthorization(options: { enabled?: boolean } = {}) {
  const repository = repositories.repairs;
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.evidenceAuthorization(scope),
    queryFn: () =>
      repository
        ? repository.evidenceAuthorization()
        : featureUnavailable('repairs', UNAVAILABLE),
    enabled: options.enabled ?? true,
    staleTime: AUTHORIZATION_FRESHNESS,
    // Never written to disk by anything: the cache is memory-only by decision
    // (DEC-MOBILE-003), which is what makes holding a credential here allowed.
    gcTime: AUTHORIZATION_FRESHNESS,
    retry: false,
  });
}
