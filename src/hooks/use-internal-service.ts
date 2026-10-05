import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { InternalCapabilityMissingError } from '@/api/endpoints/internal-v1';
import type { ServiceOrderQuery } from '@/api/endpoints/internal-service-v1';
import { getAuthRuntime } from '@/auth/auth-runtime';
import type {
  ServiceDeliveryInput,
  ServicePaymentInput,
  ServiceQualityResultInput,
  ServiceCompleteInput,
  ServiceExecutionInput,
  ServicePartUsageInput,
  ServiceDeviceInput,
  ServiceDiagnosticInput,
  ServiceOrderInput,
  ServiceQuoteInput,
  ServiceQuoteItemInput,
  ServiceTrackingLink,
  ServiceTrackingReveal,
  StaffQuoteDecisionInput,
  WhatsAppConsent,
} from '@/domain/internal/service-types';
import { isDeviceLookupWorthAsking } from '@/domain/internal/service-types';
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

/**
 * Write down the answer the customer gave a person — SERVICE-TRACKING.
 *
 * `service.quotes.record_decision`, which the server demands on top of
 * `service.orders.view`. No retry: an approval starts a repair, and a client
 * that resent one on a flaky network would be deciding on somebody's behalf.
 * A 409 means the quote already has an answer, and the screen shows the
 * server's sentence.
 */
export function useRecordQuoteDecision(orderId: number) {
  return useServiceMutation<
    { quoteId: number; input: StaffQuoteDecisionInput },
    unknown
  >(({ quoteId, input }) => repository().recordQuoteDecision(orderId, quoteId, input));
}

/**
 * Void an approval and quote again — `service.diagnostic.manage`.
 *
 * The answer is the NEW draft. The approved quote stays `superseded` with its
 * decision, so what was agreed before remains answerable.
 */
export function useReopenQuote(orderId: number) {
  return useServiceMutation<{ quoteId: number; reason: string }, unknown>(
    ({ quoteId, reason }) => repository().reopenQuote(orderId, quoteId, reason),
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

// ---------------------------------------------------------------------------
// M11 / BR-005D — quality control
// ---------------------------------------------------------------------------

export function useServiceQualityCheck(
  orderId: number | undefined,
  options: { enabled?: boolean } = {},
) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.internalServiceQuality(scope, orderId ?? -1),
    queryFn: ({ signal }) => repository().getQualityCheck(orderId!, signal),
    enabled: (options.enabled ?? true) && orderId !== undefined && Number.isFinite(orderId),
    retry: false,
  });
}

export function useServiceQualityHistory(
  orderId: number | undefined,
  options: { enabled?: boolean } = {},
) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.internalServiceQualityHistory(scope, orderId ?? -1),
    queryFn: ({ signal }) => repository().listQualityChecks(orderId!, signal),
    enabled: (options.enabled ?? true) && orderId !== undefined && Number.isFinite(orderId),
    retry: false,
  });
}

export function useStartQualityCheck(orderId: number) {
  return useServiceMutation<void, unknown>(() => repository().startQualityCheck(orderId));
}

export function useRecordQualityResult(orderId: number) {
  return useServiceMutation<
    { itemId: number; input: ServiceQualityResultInput }, unknown
  >(({ itemId, input }) => repository().recordQualityResult(orderId, itemId, input));
}

export function usePassQualityCheck(orderId: number) {
  return useServiceMutation<{ notes?: string }, unknown>(({ notes }) =>
    repository().passQualityCheck(orderId, notes ?? ''),
  );
}

export function useFailQualityCheck(orderId: number) {
  return useServiceMutation<{ notes?: string }, unknown>(({ notes }) =>
    repository().failQualityCheck(orderId, notes ?? ''),
  );
}

// ---------------------------------------------------------------------------
// M12 / BR-005E — the handover
// ---------------------------------------------------------------------------

export function useServiceDelivery(
  orderId: number | undefined,
  options: { enabled?: boolean } = {},
) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.internalServiceDelivery(scope, orderId ?? -1),
    queryFn: ({ signal }) => repository().getDelivery(orderId!, signal),
    enabled: (options.enabled ?? true) && orderId !== undefined && Number.isFinite(orderId),
    retry: false,
  });
}

/**
 * Record the handover.
 *
 * `useServiceMutation` and not `useStockTouchingMutation`: handing a device back
 * moves no stock. The parts left inventory when the technician fitted them, and
 * invalidating the warehouse here would make a counter's screen refetch shelves
 * for no reason.
 *
 * `retry: false` comes from the shared helper and matters more here than
 * anywhere: a retried POST the user did not ask for is a second handover
 * record, and the idempotency key protects the SERVER from a duplicate — not the
 * user from an intention they never had.
 */
export function useRecordDelivery(orderId: number) {
  return useServiceMutation<ServiceDeliveryInput, unknown>((input) =>
    repository().recordDelivery(orderId, input),
  );
}

// ---------------------------------------------------------------------------
// M12B / BR-005F — the payment ledger
// ---------------------------------------------------------------------------

export function useServicePayments(
  orderId: number | undefined,
  options: { enabled?: boolean } = {},
) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.internalServicePayments(scope, orderId ?? -1),
    queryFn: ({ signal }) => repository().listPayments(orderId!, signal),
    enabled: (options.enabled ?? true) && orderId !== undefined && Number.isFinite(orderId),
    retry: false,
  });
}

export function useServicePaymentSummary(
  orderId: number | undefined,
  options: { enabled?: boolean } = {},
) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.internalServicePaymentSummary(scope, orderId ?? -1),
    queryFn: ({ signal }) => repository().getPaymentSummary(orderId!, signal),
    enabled: (options.enabled ?? true) && orderId !== undefined && Number.isFinite(orderId),
    retry: false,
  });
}

/**
 * Record money received.
 *
 * `useServiceMutation`, not `useStockTouchingMutation`: taking payment moves no
 * stock, and invalidating the warehouse here would make a counter's screen
 * refetch shelves for no reason.
 *
 * `retry: false` comes from the shared helper and matters more here than
 * anywhere in the app. A retried POST the user did not ask for is a second
 * charge, and the idempotency key protects the SERVER from a duplicate — not
 * the user from an intention they never had.
 */
export function useRecordServicePayment(orderId: number) {
  return useServiceMutation<ServicePaymentInput, unknown>((input) =>
    repository().recordPayment(orderId, input),
  );
}

/** Undo a payment recorded in error. NOT a refund; the server returns no money. */
export function useReverseServicePayment(orderId: number) {
  return useServiceMutation<{ paymentId: number; reason?: string }, unknown>(
    ({ paymentId, reason }) =>
      repository().reversePayment(orderId, paymentId, reason ?? ''),
  );
}

// ---------------------------------------------------------------------------
// SERVICE-TRACKING — the customer's link to one repair
// ---------------------------------------------------------------------------

/**
 * Whether the order's public link is live, and how often it was opened.
 *
 * `service.orders.view`, like reading the order itself, so this rides along
 * with the detail screen. It does NOT carry the link.
 */
export function useServiceTrackingLink(
  orderId: number | undefined,
  options: { enabled?: boolean } = {},
) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.internalServiceTrackingLink(scope, orderId ?? -1),
    queryFn: ({ signal }) => repository().getTrackingLink(orderId!, signal),
    enabled: (options.enabled ?? true) && orderId !== undefined && Number.isFinite(orderId),
    retry: false,
  });
}

/**
 * Ask the server for the link, to hand it to the customer.
 *
 * A MUTATION although it reads: the server audits the act, needs
 * `service.quotes.record_decision` for it, and answers 409 when the order's
 * link was revoked. A query would retry it and cache a bearer credential; this
 * neither retries nor stores the result anywhere but the screen's own state.
 */
export function useRevealTrackingLink(orderId: number) {
  return useServiceMutation<void, ServiceTrackingReveal>(() =>
    repository().revealTrackingLink(orderId),
  );
}

/**
 * Replace the link, or turn it off. Both take `service.orders.manage` and
 * neither answers with a link — the status that comes back is the whole reply.
 */
export function useRotateTrackingLink(orderId: number) {
  return useServiceMutation<void, ServiceTrackingLink>(() =>
    repository().rotateTrackingLink(orderId),
  );
}

export function useRevokeTrackingLink(orderId: number) {
  return useServiceMutation<void, ServiceTrackingLink>(() =>
    repository().revokeTrackingLink(orderId),
  );
}

// ---------------------------------------------------------------------------
// M12D — repair photos, staff side
// ---------------------------------------------------------------------------

/** Every photo on the order. `service.orders.view`, like the order itself. */
export function useServiceEvidence(
  orderId: number | undefined,
  options: { enabled?: boolean } = {},
) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.internalServiceEvidence(scope, orderId ?? -1),
    queryFn: ({ signal }) => repository().listEvidence(orderId!, signal),
    enabled: (options.enabled ?? true) && orderId !== undefined && Number.isFinite(orderId),
    retry: false,
  });
}

/**
 * The Bearer header the image loader needs.
 *
 * A query because resolving it can require a refresh, and short-lived because
 * the cost of being wrong is a broken thumbnail rather than a wrong decision.
 */
const IMAGE_AUTHORIZATION_FRESHNESS = 30_000;

export function useServiceEvidenceAuthorization(options: { enabled?: boolean } = {}) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.internalEvidenceAuthorization(scope),
    queryFn: () => repository().evidenceAuthorization(),
    enabled: options.enabled ?? true,
    staleTime: IMAGE_AUTHORIZATION_FRESHNESS,
    gcTime: IMAGE_AUTHORIZATION_FRESHNESS,
    retry: false,
  });
}

/**
 * Share one photo with the customer, stop sharing it, or retire it.
 *
 * Each write is gated by the capability the photo's STAGE demands plus access
 * to the order's branch — the server asks for both on every request, and these
 * do not retry: sharing somebody's device photo is not something to repeat on a
 * flaky network.
 */
export function usePublishEvidence(orderId: number) {
  return useServiceMutation<{ evidenceId: number }, unknown>(({ evidenceId }) =>
    repository().publishEvidence(orderId, evidenceId),
  );
}

export function useHideEvidence(orderId: number) {
  return useServiceMutation<{ evidenceId: number }, unknown>(({ evidenceId }) =>
    repository().hideEvidence(orderId, evidenceId),
  );
}

export function useVoidEvidence(orderId: number) {
  return useServiceMutation<{ evidenceId: number; reason: string }, unknown>(
    ({ evidenceId, reason }) => repository().voidEvidence(orderId, evidenceId, reason),
  );
}

// ---------------------------------------------------------------------------
// DEVICE-IDENTITY / POS-SVC-01 — the two questions asked before an order exists
// ---------------------------------------------------------------------------

/**
 * Has this device been here before?
 *
 * The caller decides when to ask, through `enabled`: the server ignores a
 * serial under four characters and an IMEI that is not fifteen digits, so
 * firing on every keystroke would spend requests that cannot match.
 * `isDeviceLookupWorthAsking` is the same rule, mirrored to stay quiet.
 */
export function useServiceDeviceLookup(
  query: { serialNumber?: string; imei?: string },
  options: { enabled?: boolean } = {},
) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.internalServiceDeviceLookup(scope, query),
    queryFn: ({ signal }) => repository().lookupDevices(query, signal),
    enabled: (options.enabled ?? true) && isDeviceLookupWorthAsking(query),
    retry: false,
  });
}

/** Who may be handed a repair received at one branch. */
export function useServiceTechnicianCandidates(
  branchId: number | null,
  options: { enabled?: boolean } = {},
) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.internalServiceTechnicians(scope, branchId ?? -1),
    queryFn: ({ signal }) => repository().listTechnicianCandidates(branchId!, signal),
    enabled: (options.enabled ?? true) && branchId !== null,
    retry: false,
  });
}

// ---------------------------------------------------------------------------
// WHATSAPP-NOTIFY — what the customer was told, and whether we may tell them
// ---------------------------------------------------------------------------

/**
 * Send one failed WhatsApp notice again.
 *
 * NOT RETRIED AUTOMATICALLY, which is the point: a message to somebody's phone
 * is sent because a person decided to send it. The server scopes the notice to
 * this order and this company, and answers with the notice as it now stands.
 */
export function useRetryWhatsAppNotice(orderId: number) {
  return useServiceMutation<{ noticeId: number }, unknown>(({ noticeId }) =>
    repository().retryWhatsAppNotice(orderId, noticeId),
  );
}

/**
 * Record whether the customer agreed to be messaged.
 *
 * `service.customers.manage`. A phone number on file is not consent, so this
 * is a deliberate act with a date and an author — and withdrawing it is the
 * same act with the other answer.
 */
export function useSetWhatsAppConsent() {
  return useServiceMutation<{ customerId: number; optIn: boolean }, WhatsAppConsent>(
    ({ customerId, optIn }) => repository().setWhatsAppConsent(customerId, optIn),
  );
}

/**
 * Undo a wrong account link — `service.customers.manage`.
 *
 * No retry and no optimistic state: unlinking is how a real customer stops
 * being told their record belongs to somebody else, and doing it twice on a
 * flaky network is not something a client should decide.
 */
export function useUnlinkCustomerAccount() {
  return useServiceMutation<
    { customerId: number; reason: string },
    { id: number; hasAccount: boolean }
  >(({ customerId, reason }) => repository().unlinkCustomerAccount(customerId, reason));
}

/** One device and every visit it has made — `service.devices.view`. */
export function useServiceDevice(
  deviceId: number | undefined,
  options: { enabled?: boolean } = {},
) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.internalServiceDevice(scope, deviceId ?? -1),
    queryFn: ({ signal }) => repository().getDevice(deviceId!, signal),
    enabled: (options.enabled ?? true) && deviceId !== undefined && Number.isFinite(deviceId),
    retry: false,
  });
}

/**
 * Correct the note on a photo.
 *
 * The only editable field of an evidence row, gated by the capability its STAGE
 * demands. An empty note is a legitimate correction and is sent as such.
 */
export function useUpdateEvidenceCaption(orderId: number) {
  return useServiceMutation<{ evidenceId: number; caption: string }, unknown>(
    ({ evidenceId, caption }) =>
      repository().updateEvidenceCaption(orderId, evidenceId, caption),
  );
}
