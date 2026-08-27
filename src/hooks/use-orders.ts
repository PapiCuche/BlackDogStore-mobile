import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/providers/query-client';
import { repositories } from '@/repositories';
import { featureUnavailable } from '@/repositories/errors';

/**
 * Orders.
 *
 * `GET /api/orders/` exists but cannot be reached from a native client
 * (BR-001), and omits `fulfillment_status` (BR-003). So the only implementation
 * is the mock one, and it is withheld from builds that may not serve mocks.
 */
const UNAVAILABLE =
  'Los pedidos aún no están disponibles en esta versión. Falta el contrato de autenticación para Mobile.';

export function useOrders() {
  const repository = repositories.orders;
  return useQuery({
    queryKey: queryKeys.orders(),
    queryFn: ({ signal }) =>
      repository ? repository.listOrders(signal) : featureUnavailable('orders', UNAVAILABLE),
    retry: false,
  });
}

export function useOrder(id: number | undefined) {
  const repository = repositories.orders;
  return useQuery({
    queryKey: queryKeys.order(id ?? -1),
    queryFn: ({ signal }) =>
      repository ? repository.getOrderById(id!, signal) : featureUnavailable('orders', UNAVAILABLE),
    enabled: id !== undefined && Number.isFinite(id),
    retry: false,
  });
}
