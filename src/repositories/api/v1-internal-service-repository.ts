import {
  fetchServiceDelivery,
  postServiceDelivery,
  fetchServiceQualityCheck,
  fetchServiceQualityHistory,
  patchServiceQualityItem,
  postServiceQualityFail,
  postServiceQualityPass,
  postServiceQualityStart,
  fetchServiceExecution,
  fetchServicePartCandidates,
  fetchServicePartUsages,
  patchServiceExecution,
  postServiceExecutionComplete,
  postServiceExecutionPause,
  postServiceExecutionResume,
  postServiceExecutionStart,
  postServicePartUsage,
  postServicePartUsageReverse,
  deleteServiceQuoteItem,
  fetchServiceAssignmentOptions,
  fetchServiceDiagnostics,
  fetchServiceQuotes,
  patchServiceDiagnostic,
  patchServiceQuote,
  postServiceDiagnostic,
  postServiceQuote,
  postServiceQuoteCancel,
  postServiceQuoteItem,
  postServiceQuotePublish,
  fetchServiceContext,
  fetchServiceDevices,
  fetchServiceOrder,
  fetchServiceOrders,
  postServiceAssignment,
  postServiceDevice,
  postServiceOrder,
  postServiceTransition,
  searchServiceCustomers,
  type ServiceOrderQuery,
} from '@/api/endpoints/internal-service-v1';
import type { RefreshCoordinator } from '@/auth/refresh-coordinator';
import type {
  ServiceDeliveryInput,
  ServiceQualityResultInput,
  ServiceCompleteInput,
  ServiceExecutionInput,
  ServicePartUsageInput,
  ServiceAssignmentOptions,
  ServiceDiagnostic,
  ServiceDiagnosticInput,
  ServiceDiagnosticList,
  ServiceQuote,
  ServiceQuoteInput,
  ServiceQuoteItemInput,
  ServiceQuoteList,
  ServiceContext,
  ServiceCustomerPage,
  ServiceDeviceCreated,
  ServiceDeviceInput,
  ServiceDevicePage,
  ServiceOrderDetail,
  ServiceOrderInput,
  ServiceOrderPage,
} from '@/domain/internal/service-types';

/**
 * The company's workshop, over `/api/v1/internal/<slug>/service/`.
 *
 * A SEPARATE repository from `V1CustomerRepairRepository`, and the separation is
 * the point: one answers "this company's repairs" under a capability, the other
 * answers "my repairs" as a client. The same person can legitimately ask both,
 * and a single class that switched between them would be one refactor away from
 * answering the wrong one.
 *
 * Never touches `/api/admin/`.
 */
export class V1InternalServiceRepository {
  constructor(private readonly deps: { refreshCoordinator: RefreshCoordinator }) {}

  async getContext(signal?: AbortSignal): Promise<ServiceContext> {
    return fetchServiceContext(this.deps, signal);
  }

  async searchCustomers(
    query: { search?: string; page?: number } = {},
    signal?: AbortSignal,
  ): Promise<ServiceCustomerPage> {
    return searchServiceCustomers(query, this.deps, signal);
  }

  async listDevices(
    query: { customerId?: number; search?: string; page?: number } = {},
    signal?: AbortSignal,
  ): Promise<ServiceDevicePage> {
    return fetchServiceDevices(query, this.deps, signal);
  }

  async createDevice(
    input: ServiceDeviceInput,
    signal?: AbortSignal,
  ): Promise<ServiceDeviceCreated> {
    return postServiceDevice(input, this.deps, signal);
  }

  async listOrders(
    query: ServiceOrderQuery = {},
    signal?: AbortSignal,
  ): Promise<ServiceOrderPage> {
    return fetchServiceOrders(query, this.deps, signal);
  }

  async getOrder(id: number, signal?: AbortSignal): Promise<ServiceOrderDetail> {
    return fetchServiceOrder(id, this.deps, signal);
  }

  /**
   * Receive a device.
   *
   * Deliberately NOT called `createOrder(order)`. The payload is an intent: the
   * number, the state, the company and the receiver are the server's, and a
   * name that implied the client was supplying a finished order would invite a
   * caller to look for fields that do not exist.
   */
  async receiveDevice(
    input: ServiceOrderInput,
    signal?: AbortSignal,
  ): Promise<ServiceOrderDetail> {
    return postServiceOrder(input, this.deps, signal);
  }

  async transition(
    input: { id: number; status: string; comment?: string },
    signal?: AbortSignal,
  ): Promise<ServiceOrderDetail> {
    return postServiceTransition(input, this.deps, signal);
  }

  async getAssignmentOptions(
    id: number,
    signal?: AbortSignal,
  ): Promise<ServiceAssignmentOptions> {
    return fetchServiceAssignmentOptions(id, this.deps, signal);
  }

  async assignTechnician(
    input: { id: number; technicianId: number | null },
    signal?: AbortSignal,
  ): Promise<ServiceOrderDetail> {
    return postServiceAssignment(input, this.deps, signal);
  }

  // ── BR-005B ────────────────────────────────────────────────────────────

  async listDiagnostics(
    orderId: number,
    signal?: AbortSignal,
  ): Promise<ServiceDiagnosticList> {
    return fetchServiceDiagnostics(orderId, this.deps, signal);
  }

  async createDiagnostic(
    orderId: number,
    input: ServiceDiagnosticInput,
    signal?: AbortSignal,
  ): Promise<ServiceDiagnostic> {
    return postServiceDiagnostic(orderId, input, this.deps, signal);
  }

  async updateDiagnostic(
    orderId: number,
    diagnosticId: number,
    input: Partial<ServiceDiagnosticInput>,
    signal?: AbortSignal,
  ): Promise<ServiceDiagnostic> {
    return patchServiceDiagnostic(orderId, diagnosticId, input, this.deps, signal);
  }

  async listQuotes(orderId: number, signal?: AbortSignal): Promise<ServiceQuoteList> {
    return fetchServiceQuotes(orderId, this.deps, signal);
  }

  async createQuote(
    orderId: number,
    input: ServiceQuoteInput,
    signal?: AbortSignal,
  ): Promise<ServiceQuote> {
    return postServiceQuote(orderId, input, this.deps, signal);
  }

  async updateQuote(
    orderId: number,
    quoteId: number,
    input: ServiceQuoteInput,
    signal?: AbortSignal,
  ): Promise<ServiceQuote> {
    return patchServiceQuote(orderId, quoteId, input, this.deps, signal);
  }

  async addQuoteItem(
    orderId: number,
    quoteId: number,
    input: ServiceQuoteItemInput,
    signal?: AbortSignal,
  ): Promise<ServiceQuote> {
    return postServiceQuoteItem(orderId, quoteId, input, this.deps, signal);
  }

  async removeQuoteItem(
    orderId: number,
    quoteId: number,
    itemId: number,
    signal?: AbortSignal,
  ): Promise<ServiceQuote> {
    return deleteServiceQuoteItem(orderId, quoteId, itemId, this.deps, signal);
  }

  /**
   * Send the quote to the customer.
   *
   * Deliberately NOT called `setWaitingApproval`. The order moving is a
   * CONSEQUENCE of publishing, not the thing being asked for, and a name that
   * described the side effect would invite somebody to look for a way to
   * produce it without a quote — which is the exact thing M9 closed.
   */
  async publishQuote(
    orderId: number,
    quoteId: number,
    signal?: AbortSignal,
  ): Promise<ServiceQuote> {
    return postServiceQuotePublish(orderId, quoteId, this.deps, signal);
  }

  async cancelQuote(
    orderId: number,
    quoteId: number,
    signal?: AbortSignal,
  ): Promise<ServiceQuote> {
    return postServiceQuoteCancel(orderId, quoteId, this.deps, signal);
  }

  // ---------------------------------------------------------------------
  // M10 / BR-005C — the bench
  // ---------------------------------------------------------------------

  async getExecution(orderId: number, signal?: AbortSignal) {
    return fetchServiceExecution(orderId, this.deps, signal);
  }

  /**
   * Begin the work.
   *
   * Deliberately NOT called `setInRepair`. The order moving is a CONSEQUENCE of
   * a technician starting, not the thing being asked for — the same naming rule
   * `publishQuote` follows, and for the same reason: a name that described the
   * side effect would invite somebody to look for a way to produce it without
   * the record that gives it meaning.
   */
  async startRepair(orderId: number, signal?: AbortSignal) {
    return postServiceExecutionStart(orderId, this.deps, signal);
  }

  async updateExecution(
    orderId: number,
    input: ServiceExecutionInput,
    signal?: AbortSignal,
  ) {
    return patchServiceExecution(orderId, input, this.deps, signal);
  }

  async completeRepair(
    orderId: number,
    input: ServiceCompleteInput,
    signal?: AbortSignal,
  ) {
    return postServiceExecutionComplete(orderId, input, this.deps, signal);
  }

  async pauseForParts(orderId: number, comment: string, signal?: AbortSignal) {
    return postServiceExecutionPause(orderId, comment, this.deps, signal);
  }

  async resumeRepair(orderId: number, signal?: AbortSignal) {
    return postServiceExecutionResume(orderId, this.deps, signal);
  }

  async listPartCandidates(orderId: number, signal?: AbortSignal) {
    return fetchServicePartCandidates(orderId, this.deps, signal);
  }

  async listPartUsages(orderId: number, signal?: AbortSignal) {
    return fetchServicePartUsages(orderId, this.deps, signal);
  }

  /**
   * Consume one approved part.
   *
   * The key comes from the CALLER, held across retries. Minting one here would
   * mint a new one per attempt, which is the one thing an idempotency key must
   * never do.
   */
  async recordPartUsage(
    orderId: number,
    input: ServicePartUsageInput,
    signal?: AbortSignal,
  ) {
    return postServicePartUsage(orderId, input, this.deps, signal);
  }

  async reversePartUsage(
    orderId: number,
    usageId: number,
    reason: string,
    signal?: AbortSignal,
  ) {
    return postServicePartUsageReverse(orderId, usageId, reason, this.deps, signal);
  }

  // ---------------------------------------------------------------------
  // M11 / BR-005D — quality control
  // ---------------------------------------------------------------------

  async getQualityCheck(orderId: number, signal?: AbortSignal) {
    return fetchServiceQualityCheck(orderId, this.deps, signal);
  }

  async listQualityChecks(orderId: number, signal?: AbortSignal) {
    return fetchServiceQualityHistory(orderId, this.deps, signal);
  }

  /**
   * Open an inspection.
   *
   * Deliberately NOT called `setQualityControl`. The order moving is a
   * CONSEQUENCE of a checklist being opened against a finished repair, not the
   * thing being asked for — the same naming rule `publishQuote` and
   * `startRepair` follow.
   */
  async startQualityCheck(orderId: number, signal?: AbortSignal) {
    return postServiceQualityStart(orderId, this.deps, signal);
  }

  async recordQualityResult(
    orderId: number,
    itemId: number,
    input: ServiceQualityResultInput,
    signal?: AbortSignal,
  ) {
    return patchServiceQualityItem(orderId, itemId, input, this.deps, signal);
  }

  async passQualityCheck(orderId: number, notes: string, signal?: AbortSignal) {
    return postServiceQualityPass(orderId, notes, this.deps, signal);
  }

  async failQualityCheck(orderId: number, notes: string, signal?: AbortSignal) {
    return postServiceQualityFail(orderId, notes, this.deps, signal);
  }

  // ---------------------------------------------------------------------
  // M12 / BR-005E — the handover
  // ---------------------------------------------------------------------

  async getDelivery(orderId: number, signal?: AbortSignal) {
    return fetchServiceDelivery(orderId, this.deps, signal);
  }

  /**
   * Deliberately NOT called `setDelivered`. The order closing is a CONSEQUENCE
   * of somebody collecting the device, not the thing being asked for — the same
   * naming rule `publishQuote`, `startRepair` and `startQualityCheck` follow.
   *
   * And there is no `updateDelivery` or `deleteDelivery`, because the server has
   * neither: the row refuses both in its own `save`.
   */
  async recordDelivery(
    orderId: number,
    input: ServiceDeliveryInput,
    signal?: AbortSignal,
  ) {
    return postServiceDelivery(orderId, input, this.deps, signal);
  }
}
