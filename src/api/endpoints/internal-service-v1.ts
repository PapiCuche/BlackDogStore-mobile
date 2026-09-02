import type { RefreshCoordinator } from '@/auth/refresh-coordinator';
import { companySlug } from '@/config/env';
import type {
  ServiceAssignment,
  ServiceDiagnostic,
  ServiceDiagnosticInput,
  ServiceDiagnosticList,
  ServiceQuote,
  ServiceQuoteInput,
  ServiceQuoteItem,
  ServiceQuoteItemInput,
  ServiceQuoteList,
  ServiceAssignmentOptions,
  ServiceContext,
  ServiceCustomerPage,
  ServiceCustomerSummary,
  ServiceDevice,
  ServiceDeviceCreated,
  ServiceDeviceInput,
  ServiceDevicePage,
  ServiceHistoryEntry,
  ServiceOrder,
  ServiceOrderDetail,
  ServiceOrderInput,
  ServiceOrderPage,
} from '@/domain/internal/service-types';

import { authenticatedRequest } from '../authenticated-request';
import { ApiError, userFacingMessage } from '../errors';
import {
  InternalAccessDeniedError,
  InternalCapabilityMissingError,
  MissingTenantError,
} from './internal-v1';

/**
 * INTERNAL technical service — `/api/v1/internal/<company_slug>/service/…`.
 *
 * Verified on `PapiCuche/BlackDogStore-web` @ `origin/master` `43fffb0` (PR #7)
 * with a live smoke over all nine routes.
 *
 * ⚠️  NEVER `/api/admin/`. That surface authenticates by cookie and CSRF.
 *
 * THREE GATES, all the server's:
 *
 *   No active membership          → 404, indistinguishable from unknown company
 *   Membership, no capability     → 403, re-resolved on EVERY request
 *   A branch or order out of reach → 404, NOT 403
 *
 * The third is why `ServiceOutOfScopeError` exists separately. The server
 * answers 404 so nobody can sweep ids to map their company's shops, and an app
 * that translated it into "your membership is gone" would raise the wrong alarm.
 */

/** The selected branch or order is not one this member may reach. */
export class ServiceOutOfScopeError extends Error {
  constructor() {
    super('Eso no está disponible para tu cuenta en esta empresa.');
    this.name = 'ServiceOutOfScopeError';
  }
}

/** The server refused the operation itself — an illegal move, an invalid payload. */
export class ServiceRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ServiceRejectedError';
  }
}

function servicePath(slug: string): string {
  return `/api/v1/internal/${encodeURIComponent(slug)}/service`;
}

function requireTenant(): string {
  if (!companySlug) throw new MissingTenantError();
  return companySlug;
}

type Row = Record<string, unknown>;

function str(value: unknown, fallback = ''): string {
  return value === null || value === undefined ? fallback : String(value);
}

export function toServiceDevice(raw: unknown): ServiceDevice {
  const row = raw as Row;
  return {
    id: Number(row.id),
    customer: Number(row.customer ?? 0),
    customerName: str(row.customer_name),
    deviceType: str(row.device_type),
    deviceTypeLabel: str(row.device_type_label),
    brand: str(row.brand),
    model: str(row.model),
    displayName: str(row.display_name),
    serialNumber: str(row.serial_number),
    imei: str(row.imei),
    color: str(row.color),
    storageCapacity: str(row.storage_capacity),
    notes: str(row.notes),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

function toAssignment(raw: unknown): ServiceAssignment {
  const row = raw as Row;
  return {
    id: Number(row.id),
    technician: Number(row.technician ?? 0),
    technicianName: str(row.technician_name),
    assignedAt: str(row.assigned_at),
    unassignedAt: row.unassigned_at ? str(row.unassigned_at) : null,
  };
}

function toHistoryEntry(raw: unknown): ServiceHistoryEntry {
  const row = raw as Row;
  return {
    id: Number(row.id),
    fromStatus: str(row.from_status),
    toStatus: str(row.to_status),
    toStatusLabel: str(row.to_status_label),
    origin: str(row.origin),
    comment: str(row.comment),
    // Strictly `=== true`: an absent flag is not a grant, and this one decides
    // whether staff are looking at something a customer can also see.
    isCustomerVisible: row.is_customer_visible === true,
    actorName: str(row.actor_name),
    createdAt: str(row.created_at),
  };
}

export function toServiceOrder(raw: unknown): ServiceOrder {
  const row = raw as Row;
  return {
    id: Number(row.id),
    number: str(row.number),
    status: str(row.status),
    statusLabel: str(row.status_label),
    customer: Number(row.customer ?? 0),
    customerName: str(row.customer_name),
    device: Number(row.device ?? 0),
    deviceSummary: str(row.device_summary),
    branch: Number(row.branch ?? 0),
    branchName: str(row.branch_name),
    technicianName: str(row.technician_name),
    receivedAt: str(row.received_at),
    closedAt: row.closed_at ? str(row.closed_at) : null,
    updatedAt: str(row.updated_at),
  };
}

export function toServiceOrderDetail(raw: unknown): ServiceOrderDetail {
  const row = raw as Row;
  return {
    ...toServiceOrder(row),
    reportedIssue: str(row.reported_issue),
    physicalCondition: str(row.physical_condition),
    receivedAccessories: str(row.received_accessories),
    internalNotes: str(row.internal_notes),
    receivedByName: str(row.received_by_name),
    deviceDetail: row.device_detail ? toServiceDevice(row.device_detail) : null,
    history: Array.isArray(row.history) ? row.history.map(toHistoryEntry) : [],
    assignments: Array.isArray(row.assignments) ? row.assignments.map(toAssignment) : [],
    // Taken verbatim. This app computes no transition of its own.
    availableTransitions: Array.isArray(row.available_transitions)
      ? row.available_transitions.map((entry) => {
          const option = entry as Row;
          return { code: str(option.code), label: str(option.label) };
        })
      : [],
  };
}

function toCustomerSummary(raw: unknown): ServiceCustomerSummary {
  const row = raw as Row;
  return {
    id: Number(row.id),
    displayName: str(row.display_name),
    documentNumber: str(row.document_number),
    phone: str(row.phone),
  };
}

function page<T>(raw: Row, map: (item: unknown) => T) {
  return {
    count: Number(raw.count ?? 0),
    page: Number(raw.page ?? 1),
    pageSize: Number(raw.page_size ?? 0),
    results: Array.isArray(raw.results) ? raw.results.map(map) : [],
  };
}

/**
 * Turn the meaningful HTTP answers into typed outcomes.
 *
 * `scoped` says whether the request named something the caller may not reach —
 * a branch, an order, a device. Without it a 404 means the company is closed to
 * this person; with it, that one thing is.
 */
function translate(error: unknown, scoped: boolean): never {
  if (error instanceof ApiError && error.status === 404) {
    throw scoped ? new ServiceOutOfScopeError() : new InternalAccessDeniedError();
  }
  if (error instanceof ApiError && error.status === 403) {
    throw new InternalCapabilityMissingError();
  }
  if (error instanceof ApiError && error.status === 400) {
    throw new ServiceRejectedError(rejectionMessage(error));
  }
  throw error;
}

/**
 * The server's own words, when it has any.
 *
 * A domain refusal arrives as `{"detail": "Ese cambio de estado no está
 * permitido."}` and is the most useful thing to show. A serializer refusal
 * arrives as `{"field": ["…"]}`, where the client's generic "HTTP 400" is worse
 * than the field's. Neither is invented here.
 */
function rejectionMessage(error: ApiError): string {
  if (error.message && !error.message.startsWith('HTTP ')) return error.message;
  const fromFields = error.fieldErrors
    ? Object.values(error.fieldErrors).flat().filter(Boolean)
    : [];
  if (fromFields.length > 0) return fromFields.join(' ');
  return 'El servidor rechazó la operación.';
}

type Deps = { refreshCoordinator: RefreshCoordinator };

export async function fetchServiceContext(
  deps: Deps,
  signal?: AbortSignal,
): Promise<ServiceContext> {
  try {
    const raw = await authenticatedRequest<Row>(
      `${servicePath(requireTenant())}/context/`,
      { scope: 'authenticated-v1', signal },
      deps,
    );
    return {
      statuses: Array.isArray(raw.statuses)
        ? raw.statuses.map((entry) => {
            const row = entry as Row;
            return {
              code: str(row.code),
              label: str(row.label),
              isCustomerVisible: row.is_customer_visible === true,
              sortOrder: Number(row.sort_order ?? 0),
            };
          })
        : [],
      availableBranches: Array.isArray(raw.available_branches)
        ? raw.available_branches.map((entry) => {
            const row = entry as Row;
            return { id: Number(row.id), name: str(row.name) };
          })
        : [],
    };
  } catch (error) {
    return translate(error, false);
  }
}

export async function searchServiceCustomers(
  query: { search?: string; page?: number },
  deps: Deps,
  signal?: AbortSignal,
): Promise<ServiceCustomerPage> {
  const params: Record<string, string | number> = {};
  if (query.search) params.search = query.search;
  if (query.page !== undefined) params.page = query.page;
  try {
    return page(
      await authenticatedRequest<Row>(
        `${servicePath(requireTenant())}/customers/`,
        { scope: 'authenticated-v1', query: params, signal },
        deps,
      ),
      toCustomerSummary,
    );
  } catch (error) {
    return translate(error, false);
  }
}

export async function fetchServiceDevices(
  query: { customerId?: number; search?: string; page?: number },
  deps: Deps,
  signal?: AbortSignal,
): Promise<ServiceDevicePage> {
  const params: Record<string, string | number> = {};
  if (query.customerId !== undefined) params.customer_id = query.customerId;
  if (query.search) params.search = query.search;
  if (query.page !== undefined) params.page = query.page;
  try {
    return page(
      await authenticatedRequest<Row>(
        `${servicePath(requireTenant())}/devices/`,
        { scope: 'authenticated-v1', query: params, signal },
        deps,
      ),
      toServiceDevice,
    );
  } catch (error) {
    return translate(error, query.customerId !== undefined);
  }
}

export async function postServiceDevice(
  input: ServiceDeviceInput,
  deps: Deps,
  signal?: AbortSignal,
): Promise<ServiceDeviceCreated> {
  const body: Record<string, unknown> = {
    customer_id: input.customerId,
    device_type: input.deviceType,
    brand: input.brand,
    model: input.model,
  };
  if (input.serialNumber) body.serial_number = input.serialNumber;
  if (input.imei) body.imei = input.imei;
  if (input.color) body.color = input.color;
  if (input.storageCapacity) body.storage_capacity = input.storageCapacity;
  if (input.notes) body.notes = input.notes;

  try {
    const raw = await authenticatedRequest<Row>(
      `${servicePath(requireTenant())}/devices/`,
      { method: 'POST', body, scope: 'authenticated-v1', signal },
      deps,
    );
    return {
      ...toServiceDevice(raw),
      possibleDuplicates: Array.isArray(raw.possible_duplicates)
        ? raw.possible_duplicates.map(toServiceDevice)
        : [],
    };
  } catch (error) {
    return translate(error, true);
  }
}

export type ServiceOrderQuery = {
  branchId?: number;
  status?: string;
  search?: string;
  technicianId?: number;
  page?: number;
};

export async function fetchServiceOrders(
  query: ServiceOrderQuery,
  deps: Deps,
  signal?: AbortSignal,
): Promise<ServiceOrderPage> {
  const params: Record<string, string | number> = {};
  if (query.branchId !== undefined) params.branch_id = query.branchId;
  if (query.status) params.status = query.status;
  if (query.search) params.search = query.search;
  if (query.technicianId !== undefined) params.technician_id = query.technicianId;
  if (query.page !== undefined) params.page = query.page;

  try {
    return page(
      await authenticatedRequest<Row>(
        `${servicePath(requireTenant())}/orders/`,
        { scope: 'authenticated-v1', query: params, signal },
        deps,
      ),
      toServiceOrder,
    );
  } catch (error) {
    return translate(error, query.branchId !== undefined);
  }
}

export async function fetchServiceOrder(
  id: number,
  deps: Deps,
  signal?: AbortSignal,
): Promise<ServiceOrderDetail> {
  try {
    return toServiceOrderDetail(
      await authenticatedRequest<unknown>(
        `${servicePath(requireTenant())}/orders/${encodeURIComponent(String(id))}/`,
        { scope: 'authenticated-v1', signal },
        deps,
      ),
    );
  } catch (error) {
    return translate(error, true);
  }
}

export async function postServiceOrder(
  input: ServiceOrderInput,
  deps: Deps,
  signal?: AbortSignal,
): Promise<ServiceOrderDetail> {
  const body: Record<string, unknown> = {
    customer_id: input.customerId,
    device_id: input.deviceId,
    branch_id: input.branchId,
    reported_issue: input.reportedIssue,
  };
  if (input.physicalCondition) body.physical_condition = input.physicalCondition;
  if (input.receivedAccessories) body.received_accessories = input.receivedAccessories;
  if (input.internalNotes) body.internal_notes = input.internalNotes;

  try {
    return toServiceOrderDetail(
      await authenticatedRequest<unknown>(
        `${servicePath(requireTenant())}/orders/`,
        { method: 'POST', body, scope: 'authenticated-v1', signal },
        deps,
      ),
    );
  } catch (error) {
    return translate(error, true);
  }
}

/**
 * Move an order.
 *
 * `status` must be one the server OFFERED. It re-validates regardless of what
 * the app drew, so a rejection here is a normal outcome — the machine may have
 * moved between rendering the button and pressing it.
 */
export async function postServiceTransition(
  input: { id: number; status: string; comment?: string },
  deps: Deps,
  signal?: AbortSignal,
): Promise<ServiceOrderDetail> {
  const body: Record<string, unknown> = { status: input.status };
  if (input.comment) body.comment = input.comment;

  try {
    return toServiceOrderDetail(
      await authenticatedRequest<unknown>(
        `${servicePath(requireTenant())}/orders/${encodeURIComponent(String(input.id))}/transition/`,
        { method: 'POST', body, scope: 'authenticated-v1', signal },
        deps,
      ),
    );
  } catch (error) {
    return translate(error, true);
  }
}

export async function fetchServiceAssignmentOptions(
  id: number,
  deps: Deps,
  signal?: AbortSignal,
): Promise<ServiceAssignmentOptions> {
  try {
    const raw = await authenticatedRequest<Row>(
      `${servicePath(requireTenant())}/orders/${encodeURIComponent(String(id))}/assignment/`,
      { scope: 'authenticated-v1', signal },
      deps,
    );
    return {
      current: raw.current ? toAssignment(raw.current) : null,
      candidates: Array.isArray(raw.candidates)
        ? raw.candidates.map((entry) => {
            const row = entry as Row;
            return { id: Number(row.id), name: str(row.name) };
          })
        : [],
    };
  } catch (error) {
    return translate(error, true);
  }
}

/**
 * Assign a technician, or release the order with a null id.
 *
 * Only an id travels — never a user object, never an email. The server resolves
 * it against its own eligible set, so an id from another tenant is not found
 * rather than found-then-refused.
 */
export async function postServiceAssignment(
  input: { id: number; technicianId: number | null },
  deps: Deps,
  signal?: AbortSignal,
): Promise<ServiceOrderDetail> {
  try {
    return toServiceOrderDetail(
      await authenticatedRequest<unknown>(
        `${servicePath(requireTenant())}/orders/${encodeURIComponent(String(input.id))}/assignment/`,
        {
          method: 'POST',
          body: { technician_id: input.technicianId },
          scope: 'authenticated-v1',
          signal,
        },
        deps,
      ),
    );
  } catch (error) {
    return translate(error, true);
  }
}

/**
 * The message to put in front of the person who pressed the button.
 *
 * `userFacingMessage` deliberately swallows `error.message` for API failures —
 * a Django traceback in a toast is both confusing and a small disclosure. But
 * the outcomes below are written BY the domain FOR the operator ("ese cambio de
 * estado no está permitido", "esa persona no forma parte del personal activo"),
 * and replacing them with "ocurrió un error inesperado" would hide the only
 * useful thing the server said.
 */
export function serviceErrorMessage(error: unknown): string {
  if (
    error instanceof ServiceRejectedError ||
    error instanceof ServiceOutOfScopeError ||
    error instanceof InternalCapabilityMissingError ||
    error instanceof InternalAccessDeniedError
  ) {
    return error.message;
  }
  return userFacingMessage(error);
}

export { InternalAccessDeniedError, InternalCapabilityMissingError, MissingTenantError };

// ---------------------------------------------------------------------------
// BR-005B — diagnosis and quotes
// ---------------------------------------------------------------------------

function orderPath(id: number): string {
  return `${servicePath(requireTenant())}/orders/${encodeURIComponent(String(id))}`;
}

export function toServiceDiagnostic(raw: unknown): ServiceDiagnostic {
  const row = raw as Row;
  return {
    id: Number(row.id),
    revision: Number(row.revision ?? 1),
    status: str(row.status),
    statusLabel: str(row.status_label),
    description: str(row.description),
    rootCause: str(row.root_cause),
    recommendedAction: str(row.recommended_action),
    internalNotes: str(row.internal_notes),
    diagnosedByName: str(row.diagnosed_by_name),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
    finalizedAt: row.finalized_at ? str(row.finalized_at) : null,
  };
}

export function toServiceQuoteItem(raw: unknown): ServiceQuoteItem {
  const row = raw as Row;
  return {
    id: Number(row.id),
    itemType: str(row.item_type),
    itemTypeLabel: str(row.item_type_label),
    description: str(row.description),
    // Decimal strings, carried verbatim. Nothing in this app multiplies them.
    quantity: str(row.quantity, '0'),
    unitPrice: str(row.unit_price, '0'),
    lineTotal: str(row.line_total, '0'),
    product: row.product === null || row.product === undefined ? null : Number(row.product),
    sortOrder: Number(row.sort_order ?? 0),
  };
}

export function toServiceQuote(raw: unknown): ServiceQuote {
  const row = raw as Row;
  const decision = row.decision as Row | null | undefined;
  return {
    id: Number(row.id),
    revision: Number(row.revision ?? 1),
    status: str(row.status),
    statusLabel: str(row.status_label),
    diagnostic:
      row.diagnostic === null || row.diagnostic === undefined
        ? null
        : Number(row.diagnostic),
    currency: str(row.currency),
    subtotal: str(row.subtotal, '0'),
    discountAmount: str(row.discount_amount, '0'),
    taxAmount: str(row.tax_amount, '0'),
    total: str(row.total, '0'),
    validUntil: row.valid_until ? str(row.valid_until) : null,
    // Strictly `=== true`: an absent flag is not a grant, and these two decide
    // whether an editor is drawn and whether a quote can still be published.
    isExpired: row.is_expired === true,
    isEditable: row.is_editable === true,
    customerNotes: str(row.customer_notes),
    internalNotes: str(row.internal_notes),
    items: Array.isArray(row.items) ? row.items.map(toServiceQuoteItem) : [],
    decision: decision
      ? {
          decision: str(decision.decision),
          reason: str(decision.reason),
          channel: str(decision.channel),
          decidedAt: str(decision.decided_at),
        }
      : null,
    createdByName: str(row.created_by_name),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
    sentAt: row.sent_at ? str(row.sent_at) : null,
    approvedAt: row.approved_at ? str(row.approved_at) : null,
    rejectedAt: row.rejected_at ? str(row.rejected_at) : null,
    cancelledAt: row.cancelled_at ? str(row.cancelled_at) : null,
  };
}

/**
 * Every function below names an order id in its path.
 *
 * So every one is `scoped: true` when it translates a 404: the server answers
 * that for an order, a quote or a diagnosis this member cannot reach, and the
 * app must say "that is not available to you" rather than "your membership is
 * gone".
 */
export async function fetchServiceDiagnostics(
  orderId: number,
  deps: Deps,
  signal?: AbortSignal,
): Promise<ServiceDiagnosticList> {
  try {
    const raw = await authenticatedRequest<Row>(
      `${orderPath(orderId)}/diagnostics/`,
      { scope: 'authenticated-v1', signal },
      deps,
    );
    return {
      count: Number(raw.count ?? 0),
      results: Array.isArray(raw.results) ? raw.results.map(toServiceDiagnostic) : [],
    };
  } catch (error) {
    return translate(error, true);
  }
}

export async function postServiceDiagnostic(
  orderId: number,
  input: ServiceDiagnosticInput,
  deps: Deps,
  signal?: AbortSignal,
): Promise<ServiceDiagnostic> {
  const body: Record<string, unknown> = {
    description: input.description,
    recommended_action: input.recommendedAction,
  };
  if (input.rootCause) body.root_cause = input.rootCause;
  if (input.internalNotes) body.internal_notes = input.internalNotes;

  try {
    return toServiceDiagnostic(
      await authenticatedRequest<unknown>(
        `${orderPath(orderId)}/diagnostics/`,
        { method: 'POST', body, scope: 'authenticated-v1', signal },
        deps,
      ),
    );
  } catch (error) {
    return translate(error, true);
  }
}

export async function patchServiceDiagnostic(
  orderId: number,
  diagnosticId: number,
  input: Partial<ServiceDiagnosticInput>,
  deps: Deps,
  signal?: AbortSignal,
): Promise<ServiceDiagnostic> {
  const body: Record<string, unknown> = {};
  if (input.description !== undefined) body.description = input.description;
  if (input.recommendedAction !== undefined) {
    body.recommended_action = input.recommendedAction;
  }
  if (input.rootCause !== undefined) body.root_cause = input.rootCause;
  if (input.internalNotes !== undefined) body.internal_notes = input.internalNotes;

  try {
    return toServiceDiagnostic(
      await authenticatedRequest<unknown>(
        `${orderPath(orderId)}/diagnostics/${encodeURIComponent(String(diagnosticId))}/`,
        { method: 'PATCH', body, scope: 'authenticated-v1', signal },
        deps,
      ),
    );
  } catch (error) {
    return translate(error, true);
  }
}

export async function fetchServiceQuotes(
  orderId: number,
  deps: Deps,
  signal?: AbortSignal,
): Promise<ServiceQuoteList> {
  try {
    const raw = await authenticatedRequest<Row>(
      `${orderPath(orderId)}/quotes/`,
      { scope: 'authenticated-v1', signal },
      deps,
    );
    return {
      count: Number(raw.count ?? 0),
      results: Array.isArray(raw.results) ? raw.results.map(toServiceQuote) : [],
    };
  } catch (error) {
    return translate(error, true);
  }
}

function quoteBody(input: ServiceQuoteInput): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (input.diagnosticId !== undefined) body.diagnostic_id = input.diagnosticId;
  if (input.validUntil !== undefined) body.valid_until = input.validUntil;
  if (input.customerNotes !== undefined) body.customer_notes = input.customerNotes;
  if (input.internalNotes !== undefined) body.internal_notes = input.internalNotes;
  if (input.discountAmount !== undefined) body.discount_amount = input.discountAmount;
  return body;
}

export async function postServiceQuote(
  orderId: number,
  input: ServiceQuoteInput,
  deps: Deps,
  signal?: AbortSignal,
): Promise<ServiceQuote> {
  try {
    return toServiceQuote(
      await authenticatedRequest<unknown>(
        `${orderPath(orderId)}/quotes/`,
        { method: 'POST', body: quoteBody(input), scope: 'authenticated-v1', signal },
        deps,
      ),
    );
  } catch (error) {
    return translate(error, true);
  }
}

export async function patchServiceQuote(
  orderId: number,
  quoteId: number,
  input: ServiceQuoteInput,
  deps: Deps,
  signal?: AbortSignal,
): Promise<ServiceQuote> {
  try {
    return toServiceQuote(
      await authenticatedRequest<unknown>(
        `${orderPath(orderId)}/quotes/${encodeURIComponent(String(quoteId))}/`,
        { method: 'PATCH', body: quoteBody(input), scope: 'authenticated-v1', signal },
        deps,
      ),
    );
  } catch (error) {
    return translate(error, true);
  }
}

export async function postServiceQuoteItem(
  orderId: number,
  quoteId: number,
  input: ServiceQuoteItemInput,
  deps: Deps,
  signal?: AbortSignal,
): Promise<ServiceQuote> {
  const body: Record<string, unknown> = {
    item_type: input.itemType,
    description: input.description,
    quantity: input.quantity,
    unit_price: input.unitPrice,
  };
  if (input.productId !== undefined && input.productId !== null) {
    body.product_id = input.productId;
  }
  if (input.sortOrder !== undefined) body.sort_order = input.sortOrder;

  try {
    return toServiceQuote(
      await authenticatedRequest<unknown>(
        `${orderPath(orderId)}/quotes/${encodeURIComponent(String(quoteId))}/items/`,
        { method: 'POST', body, scope: 'authenticated-v1', signal },
        deps,
      ),
    );
  } catch (error) {
    return translate(error, true);
  }
}

export async function deleteServiceQuoteItem(
  orderId: number,
  quoteId: number,
  itemId: number,
  deps: Deps,
  signal?: AbortSignal,
): Promise<ServiceQuote> {
  try {
    return toServiceQuote(
      await authenticatedRequest<unknown>(
        `${orderPath(orderId)}/quotes/${encodeURIComponent(String(quoteId))}`
          + `/items/${encodeURIComponent(String(itemId))}/`,
        { method: 'DELETE', scope: 'authenticated-v1', signal },
        deps,
      ),
    );
  } catch (error) {
    return translate(error, true);
  }
}

/**
 * Send the quote to the customer.
 *
 * THE ONLY WAY AN ORDER REACHES `waiting_approval`. The server removed that
 * state from `available_transitions` in M9 precisely so this is the only route,
 * and it re-checks everything — order in diagnosis, quote a draft, at least one
 * line — whatever the app drew.
 */
export async function postServiceQuotePublish(
  orderId: number,
  quoteId: number,
  deps: Deps,
  signal?: AbortSignal,
): Promise<ServiceQuote> {
  try {
    return toServiceQuote(
      await authenticatedRequest<unknown>(
        `${orderPath(orderId)}/quotes/${encodeURIComponent(String(quoteId))}/publish/`,
        { method: 'POST', body: {}, scope: 'authenticated-v1', signal },
        deps,
      ),
    );
  } catch (error) {
    return translate(error, true);
  }
}

/** Withdraw a quote the customer has not answered. Returns the order to diagnosis. */
export async function postServiceQuoteCancel(
  orderId: number,
  quoteId: number,
  deps: Deps,
  signal?: AbortSignal,
): Promise<ServiceQuote> {
  try {
    return toServiceQuote(
      await authenticatedRequest<unknown>(
        `${orderPath(orderId)}/quotes/${encodeURIComponent(String(quoteId))}/cancel/`,
        { method: 'POST', body: {}, scope: 'authenticated-v1', signal },
        deps,
      ),
    );
  } catch (error) {
    return translate(error, true);
  }
}
