import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getAuthRuntime } from '@/auth/auth-runtime';
import { InternalCapabilityMissingError } from '@/api/endpoints/internal-v1';
import type { FulfillmentStatus } from '@/domain/internal/types';
import { queryKeys } from '@/providers/query-client';
import { useQueryScope } from '@/providers/use-query-scope';
import { V1InternalSalesRepository } from '@/repositories/api/v1-internal-sales-repository';

/**
 * The internal sales module's data.
 *
 * Built lazily from the shared auth runtime, so this repository uses the SAME
 * token graph as everything else. Two coordinators over one Keychain entry
 * would rotate the refresh token against each other — the bug M5 fixed and this
 * must not reintroduce.
 */
function repository(): V1InternalSalesRepository {
  return new V1InternalSalesRepository({ refreshCoordinator: getAuthRuntime().coordinator });
}

/**
 * Who this person is inside the company, freshly resolved.
 *
 * `retry: false` because the two interesting failures are both permanent
 * answers: 404 means "you do not belong here" and 403 means "you lack the
 * capability". Retrying either would just ask the same question again.
 */
export function useInternalContext(options: { enabled?: boolean } = {}) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.internalContext(scope),
    queryFn: ({ signal }) => repository().getContext(signal),
    enabled: options.enabled ?? true,
    retry: false,
    // Short, not infinite: a revoked permission should surface on the next
    // visit rather than at the next cold start.
    staleTime: 30_000,
  });
}

export function useInternalOrders(
  params: { search?: string; page?: number } = {},
  options: { enabled?: boolean } = {},
) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.internalOrders(scope, params),
    queryFn: ({ signal }) => repository().listOrders(params, signal),
    enabled: options.enabled ?? true,
    retry: false,
  });
}

export function useInternalOrder(id: number | undefined, options: { enabled?: boolean } = {}) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.internalOrder(scope, id ?? -1),
    queryFn: ({ signal }) => repository().getOrder(id!, signal),
    enabled: (options.enabled ?? true) && id !== undefined && Number.isFinite(id),
    retry: false,
  });
}

/**
 * Move an order's fulfilment state.
 *
 * On a 403 the INTERNAL cache is dropped — the permission was revoked while
 * this screen was open, and continuing to render company data the server has
 * just refused would be showing something the app is no longer entitled to.
 *
 * The customer cache is left alone. Losing an internal permission is not
 * losing a session: this person may still be a client of the same shop.
 */
export function useSetFulfillmentStatus() {
  const client = useQueryClient();
  const scope = useQueryScope();

  return useMutation({
    mutationFn: (input: { id: number; fulfillmentStatus: FulfillmentStatus; note?: string }) =>
      repository().setFulfillmentStatus(input),
    onSuccess: (detail) => {
      client.setQueryData(queryKeys.internalOrder(scope, detail.id), detail);
      void client.invalidateQueries({ queryKey: queryKeys.internalOrders(scope, {}) });
    },
    onError: (error) => {
      if (error instanceof InternalCapabilityMissingError) {
        void client.removeQueries({ queryKey: queryKeys.internalContext(scope) });
        void client.removeQueries({ queryKey: queryKeys.internalOrder(scope, 0).slice(0, -2) });
      }
    },
    retry: false,
  });
}
