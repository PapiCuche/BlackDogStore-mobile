import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/providers/query-client';
import { useQueryScope } from '@/providers/use-query-scope';
import { repositories } from '@/repositories';
import { featureUnavailable } from '@/repositories/errors';

/**
 * A customer's OWN orders.
 *
 * M4 — real, over `/api/v1/customer/<company>/orders/`. The legacy
 * `GET /api/orders/` is still off limits: it authenticates by cookie + CSRF and
 * omits `fulfillment_status`, which is why BR-001 and BR-003 existed.
 *
 * `enabled` is the caller's, because these queries are PRIVATE: a screen must
 * be able to hold them back until a session exists rather than firing a request
 * that can only come back 401. See `features/auth/private-action-gate`.
 */
const UNAVAILABLE =
  'Los pedidos no están disponibles en esta versión de la app.';

export function useOrders(options: { enabled?: boolean } = {}) {
  const repository = repositories.orders;
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.orders(scope),
    queryFn: ({ signal }) =>
      repository ? repository.listOrders(signal) : featureUnavailable('orders', UNAVAILABLE),
    enabled: options.enabled ?? true,
    retry: false,
  });
}

export function useOrder(id: number | undefined, options: { enabled?: boolean } = {}) {
  const repository = repositories.orders;
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.order(scope, id ?? -1),
    queryFn: ({ signal }) =>
      repository ? repository.getOrderById(id!, signal) : featureUnavailable('orders', UNAVAILABLE),
    enabled: (options.enabled ?? true) && id !== undefined && Number.isFinite(id),
    retry: false,
  });
}
