import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { InternalCapabilityMissingError } from '@/api/endpoints/internal-v1';
import type { ServiceOrderQuery } from '@/api/endpoints/internal-service-v1';
import { getAuthRuntime } from '@/auth/auth-runtime';
import type {
  ServiceDeviceInput,
  ServiceOrderInput,
} from '@/domain/internal/service-types';
import { queryKeys } from '@/providers/query-client';
import { useQueryScope } from '@/providers/use-query-scope';
import { V1InternalServiceRepository } from '@/repositories/api/v1-internal-service-repository';

/**
 * The internal service module's data.
 *
 * Built lazily from the shared auth runtime, so this repository uses the SAME
 * token graph as everything else. Two coordinators over one Keychain entry
 * would rotate the refresh token against each other — the bug M5 fixed, and
 * every new repository has to keep not reopening it.
 */
function repository(): V1InternalServiceRepository {
  return new V1InternalServiceRepository({
    refreshCoordinator: getAuthRuntime().coordinator,
  });
}

/**
 * `retry: false` throughout: the interesting failures are permanent answers.
 * 404 means the company is closed to you or that order is not in your shop,
 * 403 means the capability is gone. Asking again only delays the honest screen.
 */
export function useServiceContext(options: { enabled?: boolean } = {}) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.internalServiceContext(scope),
    queryFn: ({ signal }) => repository().getContext(signal),
    enabled: options.enabled ?? true,
    retry: false,
    // Short, not infinite: a branch withdrawn an hour ago should disappear from
    // the picker on the next visit, not at the next cold start.
    staleTime: 30_000,
  });
}

export function useServiceOrders(
  query: ServiceOrderQuery = {},
  options: { enabled?: boolean } = {},
) {
  const scope = useQueryScope();
  const { branchId, ...rest } = query;
  return useQuery({
    queryKey: queryKeys.internalServiceOrders(scope, branchId ?? null, rest),
    queryFn: ({ signal }) => repository().listOrders(query, signal),
    enabled: options.enabled ?? true,
    retry: false,
  });
}

export function useServiceOrder(id: number | undefined, options: { enabled?: boolean } = {}) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.internalServiceOrder(scope, id ?? -1),
    queryFn: ({ signal }) => repository().getOrder(id!, signal),
    enabled: (options.enabled ?? true) && id !== undefined && Number.isFinite(id),
    retry: false,
  });
}

export function useServiceCustomerSearch(
  search: string,
  options: { enabled?: boolean } = {},
) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.internalServiceCustomers(scope, search),
    queryFn: ({ signal }) => repository().searchCustomers({ search }, signal),
    enabled: options.enabled ?? true,
    retry: false,
  });
}

export function useServiceDevices(
  query: { customerId?: number; search?: string } = {},
  options: { enabled?: boolean } = {},
) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.internalServiceDevices(
      scope, query.customerId ?? null, query.search ?? '',
    ),
    queryFn: ({ signal }) => repository().listDevices(query, signal),
    enabled: options.enabled ?? true,
    retry: false,
  });
}

export function useServiceAssignmentOptions(
  id: number | undefined,
  options: { enabled?: boolean } = {},
) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.internalServiceAssignment(scope, id ?? -1),
    queryFn: ({ signal }) => repository().getAssignmentOptions(id!, signal),
    enabled: (options.enabled ?? true) && id !== undefined && Number.isFinite(id),
    retry: false,
  });
}

/**
 * Every write in this module drops the WHOLE service namespace.
 *
 * A list is filtered, a detail embeds its own timeline, and an assignment
 * changes what the list shows in its technician column. Surgically patching
 * three shapes to save one refetch is how a screen ends up showing a state that
 * no longer matches the rows under it.
 *
 * On a 403 the internal caches are DROPPED instead: the capability was revoked
 * while the screen was open, and continuing to render company data the server
 * has just refused would be showing something the app is no longer entitled to.
 * The CUSTOMER cache is left alone — losing an internal permission is not
 * losing a session, and this person may still be a client of the same shop.
 */
function useServiceMutation<TInput, TResult>(
  run: (input: TInput) => Promise<TResult>,
) {
  const client = useQueryClient();
  const scope = useQueryScope();

  return useMutation({
    mutationFn: run,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.internalServiceRoot(scope) });
    },
    onError: (error) => {
      if (error instanceof InternalCapabilityMissingError) {
        client.removeQueries({ queryKey: queryKeys.internalServiceRoot(scope) });
        client.removeQueries({ queryKey: queryKeys.internalContext(scope) });
      }
    },
    // A repair order, a state change and an assignment are all non-idempotent:
    // a retried POST is a second order, a second history row, a second
    // assignment. Nothing here retries, and nothing here is queued offline.
    retry: false,
  });
}

export function useReceiveDevice() {
  return useServiceMutation<ServiceOrderInput, unknown>((input) =>
    repository().receiveDevice(input),
  );
}

export function useCreateServiceDevice() {
  return useServiceMutation<ServiceDeviceInput, unknown>((input) =>
    repository().createDevice(input),
  );
}

export function useServiceTransition() {
  return useServiceMutation<{ id: number; status: string; comment?: string }, unknown>(
    (input) => repository().transition(input),
  );
}

export function useAssignTechnician() {
  return useServiceMutation<{ id: number; technicianId: number | null }, unknown>(
    (input) => repository().assignTechnician(input),
  );
}
