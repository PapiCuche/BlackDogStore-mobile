import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { InternalCapabilityMissingError } from '@/api/endpoints/internal-v1';
import type { ServiceOrderQuery } from '@/api/endpoints/internal-service-v1';
import { getAuthRuntime } from '@/auth/auth-runtime';
import type {
  ServiceCompleteInput,
  ServiceExecutionInput,
  ServicePartUsageInput,
  ServiceDeviceInput,
  ServiceDiagnosticInput,
  ServiceOrderInput,
  ServiceQuoteInput,
  ServiceQuoteItemInput,
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

// ---------------------------------------------------------------------------
// BR-005B — diagnosis and quotes
// ---------------------------------------------------------------------------

/**
 * Reading uses `service.orders.view`, so these two queries are enabled by the
 * same capability that opened the order. Composing needs
 * `service.diagnostic.manage`, and that gate lives on the buttons.
 */
export function useServiceDiagnostics(
  orderId: number | undefined,
  options: { enabled?: boolean } = {},
) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.internalServiceDiagnostics(scope, orderId ?? -1),
    queryFn: ({ signal }) => repository().listDiagnostics(orderId!, signal),
    enabled: (options.enabled ?? true) && orderId !== undefined && Number.isFinite(orderId),
    retry: false,
  });
}

export function useServiceQuotes(
  orderId: number | undefined,
  options: { enabled?: boolean } = {},
) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.internalServiceQuotes(scope, orderId ?? -1),
    queryFn: ({ signal }) => repository().listQuotes(orderId!, signal),
    enabled: (options.enabled ?? true) && orderId !== undefined && Number.isFinite(orderId),
    retry: false,
  });
}

export function useCreateDiagnostic(orderId: number) {
  return useServiceMutation<ServiceDiagnosticInput, unknown>((input) =>
    repository().createDiagnostic(orderId, input),
  );
}

export function useUpdateDiagnostic(orderId: number) {
  return useServiceMutation<
    { diagnosticId: number; input: Partial<ServiceDiagnosticInput> },
    unknown
  >(({ diagnosticId, input }) =>
    repository().updateDiagnostic(orderId, diagnosticId, input),
  );
}

export function useCreateQuote(orderId: number) {
  return useServiceMutation<ServiceQuoteInput, unknown>((input) =>
    repository().createQuote(orderId, input),
  );
}

export function useUpdateQuote(orderId: number) {
  return useServiceMutation<{ quoteId: number; input: ServiceQuoteInput }, unknown>(
    ({ quoteId, input }) => repository().updateQuote(orderId, quoteId, input),
  );
}

export function useAddQuoteItem(orderId: number) {
  return useServiceMutation<{ quoteId: number; input: ServiceQuoteItemInput }, unknown>(
    ({ quoteId, input }) => repository().addQuoteItem(orderId, quoteId, input),
  );
}

export function useRemoveQuoteItem(orderId: number) {
  return useServiceMutation<{ quoteId: number; itemId: number }, unknown>(
    ({ quoteId, itemId }) => repository().removeQuoteItem(orderId, quoteId, itemId),
  );
}

/**
 * Publish, and withdraw.
 *
 * Both move the ORDER as well as the quote, which is why they use the same
 * whole-namespace invalidation as every other write here: the order's status,
 * its history and its quote list all change together, and a screen that
 * refetched one of the three would contradict itself.
 */
export function usePublishQuote(orderId: number) {
  return useServiceMutation<{ quoteId: number }, unknown>(({ quoteId }) =>
    repository().publishQuote(orderId, quoteId),
  );
}

export function useCancelQuote(orderId: number) {
  return useServiceMutation<{ quoteId: number }, unknown>(({ quoteId }) =>
    repository().cancelQuote(orderId, quoteId),
  );
}

// ---------------------------------------------------------------------------
// M10 / BR-005C — the bench and its parts
// ---------------------------------------------------------------------------

export function useServiceExecution(
  orderId: number | undefined,
  options: { enabled?: boolean } = {},
) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.internalServiceExecution(scope, orderId ?? -1),
    queryFn: ({ signal }) => repository().getExecution(orderId!, signal),
    enabled: (options.enabled ?? true) && orderId !== undefined && Number.isFinite(orderId),
    retry: false,
  });
}

export function useServicePartUsages(
  orderId: number | undefined,
  options: { enabled?: boolean } = {},
) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.internalServiceParts(scope, orderId ?? -1),
    queryFn: ({ signal }) => repository().listPartUsages(orderId!, signal),
    enabled: (options.enabled ?? true) && orderId !== undefined && Number.isFinite(orderId),
    retry: false,
  });
}

export function useServicePartCandidates(
  orderId: number | undefined,
  options: { enabled?: boolean } = {},
) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.internalServicePartCandidates(scope, orderId ?? -1),
    queryFn: ({ signal }) => repository().listPartCandidates(orderId!, signal),
    enabled: (options.enabled ?? true) && orderId !== undefined && Number.isFinite(orderId),
    retry: false,
  });
}

/**
 * A service write that also moved STOCK.
 *
 * `useServiceMutation` invalidates the service subtree, which is right and not
 * enough: a part coming off a shelf changes what the Inventory module would
 * show for that branch, and somebody who holds both modules must not open
 * Inventory to a number that is one battery stale.
 *
 * INVALIDATION CROSSES THE MODULE BOUNDARY; DATA DOES NOT. Nothing here reads
 * an inventory repository, imports an inventory type, or renders a stock
 * figure it did not get from the service surface. It marks the other module's
 * cache dirty and lets that module refetch its own numbers when somebody opens
 * it. Nothing is loaded eagerly — a technician who never opens Inventory pays
 * for nothing.
 */
function useStockTouchingMutation<TInput, TResult>(
  run: (input: TInput) => Promise<TResult>,
) {
  const client = useQueryClient();
  const scope = useQueryScope();

  return useMutation({
    mutationFn: run,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.internalServiceRoot(scope) });
      void client.invalidateQueries({ queryKey: queryKeys.internalInventoryRoot(scope) });
    },
    onError: (error) => {
      if (error instanceof InternalCapabilityMissingError) {
        client.removeQueries({ queryKey: queryKeys.internalServiceRoot(scope) });
        client.removeQueries({ queryKey: queryKeys.internalContext(scope) });
      }
    },
    // Consuming a part is a physical fact. A replay the user did not ask for is
    // a second battery off the shelf — and the server's idempotency key protects
    // the server, not the user's intention.
    retry: false,
  });
}

export function useStartRepair(orderId: number) {
  return useServiceMutation<void, unknown>(() => repository().startRepair(orderId));
}

export function useUpdateExecution(orderId: number) {
  return useServiceMutation<ServiceExecutionInput, unknown>((input) =>
    repository().updateExecution(orderId, input),
  );
}

export function useCompleteRepair(orderId: number) {
  return useServiceMutation<ServiceCompleteInput, unknown>((input) =>
    repository().completeRepair(orderId, input),
  );
}

export function usePauseForParts(orderId: number) {
  return useServiceMutation<{ comment?: string }, unknown>(({ comment }) =>
    repository().pauseForParts(orderId, comment ?? ''),
  );
}

export function useResumeRepair(orderId: number) {
  return useServiceMutation<void, unknown>(() => repository().resumeRepair(orderId));
}

export function useRecordPartUsage(orderId: number) {
  return useStockTouchingMutation<ServicePartUsageInput, unknown>((input) =>
    repository().recordPartUsage(orderId, input),
  );
}

export function useReversePartUsage(orderId: number) {
  return useStockTouchingMutation<{ usageId: number; reason?: string }, unknown>(
    ({ usageId, reason }) => repository().reversePartUsage(orderId, usageId, reason ?? ''),
  );
}
