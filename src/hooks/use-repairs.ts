import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/providers/query-client';
import { useQueryScope } from '@/providers/use-query-scope';
import { repositories } from '@/repositories';
import { featureUnavailable } from '@/repositories/errors';

/**
 * Repairs.
 *
 * `repositories.repairs` is null in any build that may not serve mocks, because
 * Django has no repair domain at all (BR-005). The query then rejects with a
 * `FeatureUnavailableError` and the screen renders that honestly, instead of
 * showing an empty list that reads as "you have no repairs".
 */
const UNAVAILABLE =
  'Las reparaciones aún no están disponibles en esta versión. El servicio técnico todavía no tiene backend.';

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

export function useRepair(id: string | undefined) {
  const repository = repositories.repairs;
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.repair(scope, id ?? ''),
    queryFn: ({ signal }) =>
      repository ? repository.getRepairById(id!, signal) : featureUnavailable('repairs', UNAVAILABLE),
    enabled: Boolean(id),
    retry: false,
  });
}
