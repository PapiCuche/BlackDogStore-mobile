import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/providers/query-client';
import { repositories } from '@/repositories';

export function useRepairs() {
  return useQuery({
    queryKey: queryKeys.repairs(),
    queryFn: ({ signal }) => repositories.repairs.listRepairs(signal),
  });
}

export function useRepair(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.repair(id ?? ''),
    queryFn: ({ signal }) => repositories.repairs.getRepairById(id!, signal),
    enabled: Boolean(id),
  });
}
