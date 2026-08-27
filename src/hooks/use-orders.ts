import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/providers/query-client';
import { repositories } from '@/repositories';

export function useOrders() {
  return useQuery({
    queryKey: queryKeys.orders(),
    queryFn: ({ signal }) => repositories.orders.listOrders(signal),
  });
}

export function useOrder(id: number | undefined) {
  return useQuery({
    queryKey: queryKeys.order(id ?? -1),
    queryFn: ({ signal }) => repositories.orders.getOrderById(id!, signal),
    enabled: id !== undefined && Number.isFinite(id),
  });
}
