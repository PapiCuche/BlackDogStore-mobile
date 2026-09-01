import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/providers/query-client';
import { useQueryScope } from '@/providers/use-query-scope';
import { repositories } from '@/repositories';
import { featureUnavailable } from '@/repositories/errors';

/**
 * A customer's own repairs.
 *
 * M8 — real, over `/api/v1/customer/<company>/repairs/`. `repositories.repairs`
 * is null only when there is no session runtime at all (no API url, no mocks);
 * the query then rejects with a `FeatureUnavailableError` and the screen says
 * so, rather than showing an empty list that reads as "you have no repairs".
 *
 * These are PRIVATE queries. `retry: false` because the interesting failure —
 * "not a client of this company" — is a permanent answer, and asking again
 * only delays the honest screen.
 */
const UNAVAILABLE =
  'Las reparaciones no están disponibles en esta versión de la app.';

export function useRepairs() {
  const repository = repositories.repairs;
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.repairs(scope),
    queryFn: ({ signal }) =>
      repository ? repository.listRepairs(signal) : featureUnavailable('repairs', UNAVAILABLE),
    retry: false,
  });
}

export function useRepair(id: number | undefined) {
  const repository = repositories.repairs;
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.repair(scope, id ?? -1),
    queryFn: ({ signal }) =>
      repository ? repository.getRepairById(id!, signal) : featureUnavailable('repairs', UNAVAILABLE),
    enabled: id !== undefined && Number.isFinite(id),
    retry: false,
  });
}
