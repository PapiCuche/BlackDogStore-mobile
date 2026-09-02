/**
 * The INTERNAL audience's view of the workshop.
 *
 * Verified against `PapiCuche/BlackDogStore-web` @ `origin/master` `43fffb0`
 * (PR #7) with a live smoke over `/api/v1/internal/<slug>/service/`.
 *
 * DELIBERATELY NOT `@/domain/repairs`. That module is what a CUSTOMER sees: a
 * number, a state, a device summary and the events the shop chose to show them.
 * This one carries what the people doing the work need — who owns the device,
 * what the counter wrote down, who is responsible, every event including the
 * private comments.
 *
 * Widening the customer type to carry those fields would mean a customer screen
 * could one day render an internal note, and nothing in the type system would
 * object. Two audiences, two types; the duplication is the safety property, and
 * it is the same call M6 made for sales orders.
 */

export type ServiceBranch = {
  id: number;
  name: string;
};

/** One lifecycle state as THIS company presents it. */
export type ServiceStatusSetting = {
  code: string;
  label: string;
  isCustomerVisible: boolean;
  sortOrder: number;
};

/**
 * What the service module looks like for this company, right now.
 *
 * Both halves come from the server: the labels because a tenant renames them,
 * and the branches because access to a shop can be withdrawn between two visits.
 */
export type ServiceContext = {
  statuses: readonly ServiceStatusSetting[];
  availableBranches: readonly ServiceBranch[];
};

/** The thinnest customer there is — enough to recognise somebody at the counter. */
export type ServiceCustomerSummary = {
  id: number;
  displayName: string;
  documentNumber: string;
  phone: string;
};

export type ServiceDevice = {
  id: number;
  customer: number;
  customerName: string;
  deviceType: string;
  deviceTypeLabel: string;
  brand: string;
  model: string;
  displayName: string;
  serialNumber: string;
  imei: string;
  color: string;
  storageCapacity: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

/** A warning, never a refusal — the server does not block a duplicate serial. */
export type ServiceDeviceCreated = ServiceDevice & {
  possibleDuplicates: readonly ServiceDevice[];
};

export type ServiceAssignment = {
  id: number;
  technician: number;
  technicianName: string;
  assignedAt: string;
  unassignedAt: string | null;
};

/** One internal timeline event. `comment` is here and NEVER on the customer type. */
export type ServiceHistoryEntry = {
  id: number;
  fromStatus: string;
  toStatus: string;
  toStatusLabel: string;
  origin: string;
  comment: string;
  isCustomerVisible: boolean;
  actorName: string;
  createdAt: string;
};

export type ServiceOrder = {
  id: number;
  number: string;
  status: string;
  statusLabel: string;
  customer: number;
  customerName: string;
  device: number;
  deviceSummary: string;
  branch: number;
  branchName: string;
  /** Empty when nobody holds it. Derived from the assignment table, not a column. */
  technicianName: string;
  receivedAt: string;
  closedAt: string | null;
  updatedAt: string;
};

/**
 * A move the server says this order may make, with the tenant's own word.
 *
 * There is deliberately no transition table in this codebase. A client with its
 * own copy drifts the first time the machine changes, and the drift shows up as
 * a button that fails — which reads as a broken app rather than as a policy.
 */
export type ServiceTransitionOption = {
  code: string;
  label: string;
};

export type ServiceOrderDetail = ServiceOrder & {
  reportedIssue: string;
  physicalCondition: string;
  receivedAccessories: string;
  internalNotes: string;
  receivedByName: string;
  deviceDetail: ServiceDevice | null;
  history: readonly ServiceHistoryEntry[];
  assignments: readonly ServiceAssignment[];
  availableTransitions: readonly ServiceTransitionOption[];
};

export type ServiceOrderPage = {
  count: number;
  page: number;
  pageSize: number;
  results: readonly ServiceOrder[];
};

export type ServiceDevicePage = {
  count: number;
  page: number;
  pageSize: number;
  results: readonly ServiceDevice[];
};

export type ServiceCustomerPage = {
  count: number;
  page: number;
  pageSize: number;
  results: readonly ServiceCustomerSummary[];
};

/** A candidate technician, as the server offers them: a name and nothing else. */
export type ServiceTechnicianCandidate = {
  id: number;
  name: string;
};

export type ServiceAssignmentOptions = {
  current: ServiceAssignment | null;
  candidates: readonly ServiceTechnicianCandidate[];
};

/**
 * Registering a device. An INTENT, and the absences are the contract.
 *
 * No `companyId`: the tenant is in the URL, and a company id in a body is a
 * parameter somebody will eventually try to change.
 *
 * No unlock code, PIN, pattern, password, Apple ID or iCloud credential. Repair
 * shops ask for them; a field for one would make the backend's table a
 * credential store with no encryption, retention or deletion policy — none of
 * which exist. A structural test fails if one appears here.
 */
export type ServiceDeviceInput = {
  customerId: number;
  deviceType: string;
  brand: string;
  model: string;
  serialNumber?: string;
  imei?: string;
  color?: string;
  storageCapacity?: string;
  notes?: string;
};

/**
 * Receiving a device. Also an intent.
 *
 * There is no field for the order number, the status, the company, who received
 * it or when — all five are the server's, and having no field is the only way
 * to guarantee a client cannot set one.
 */
export type ServiceOrderInput = {
  customerId: number;
  deviceId: number;
  branchId: number;
  reportedIssue: string;
  physicalCondition?: string;
  receivedAccessories?: string;
  internalNotes?: string;
};

export const CAP_SERVICE_ORDERS_VIEW = 'service.orders.view';
export const CAP_SERVICE_ORDERS_CREATE = 'service.orders.create';
export const CAP_SERVICE_ORDERS_MANAGE = 'service.orders.manage';
export const CAP_SERVICE_DEVICES_VIEW = 'service.devices.view';
export const CAP_SERVICE_DEVICES_MANAGE = 'service.devices.manage';
export const CAP_SERVICE_CUSTOMERS_VIEW = 'service.customers.view';

/**
 * The device types the intake form offers.
 *
 * Mirrors Django's `Device.TYPE_CHOICES`, and it is deliberately generic: this
 * platform is not an Apple reseller's software, and a shop that repairs
 * consoles must be able to file a console. The server rejects anything else, so
 * this list is presentation — the labels are only a fallback for a payload that
 * arrives without `device_type_label`.
 */
export const SERVICE_DEVICE_TYPES = [
  { value: 'phone', label: 'Teléfono' },
  { value: 'tablet', label: 'Tablet' },
  { value: 'laptop', label: 'Laptop' },
  { value: 'desktop', label: 'Computadora de escritorio' },
  { value: 'console', label: 'Consola' },
  { value: 'wearable', label: 'Wearable' },
  { value: 'other', label: 'Otro' },
] as const;

// ---------------------------------------------------------------------------
// BR-005B — diagnosis, quotes and the customer's decision (M9)
// ---------------------------------------------------------------------------

/**
 * What the technician found. Versioned, and frozen once a quote goes out.
 *
 * `internalNotes` lives HERE and has no counterpart on the customer side. That
 * asymmetry is the point of keeping the two domains apart.
 */
export type ServiceDiagnostic = {
  id: number;
  revision: number;
  status: string;
  statusLabel: string;
  description: string;
  rootCause: string;
  recommendedAction: string;
  internalNotes: string;
  diagnosedByName: string;
  createdAt: string;
  updatedAt: string;
  /** ISO-8601 once a quote built on it was published; null while it is a draft. */
  finalizedAt: string | null;
};

export type ServiceQuoteItem = {
  id: number;
  itemType: string;
  itemTypeLabel: string;
  description: string;
  /** Decimal STRINGS. Parsed only at the point of display, never for arithmetic. */
  quantity: string;
  unitPrice: string;
  lineTotal: string;
  /** A catalogue reference, not the authority for this historical price. */
  product: number | null;
  sortOrder: number;
};

/** The customer's answer, as the people doing the work need to read it. */
export type ServiceQuoteDecision = {
  decision: string;
  /** THE CUSTOMER'S WORDS. Internal only — never on the customer contract. */
  reason: string;
  channel: string;
  decidedAt: string;
};

export type ServiceQuote = {
  id: number;
  revision: number;
  status: string;
  statusLabel: string;
  diagnostic: number | null;
  currency: string;
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  total: string;
  validUntil: string | null;
  /** Server-computed. Never recalculated here from `validUntil`. */
  isExpired: boolean;
  /** Whether the quote may still be edited — a draft, and nothing else. */
  isEditable: boolean;
  customerNotes: string;
  internalNotes: string;
  items: readonly ServiceQuoteItem[];
  decision: ServiceQuoteDecision | null;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  cancelledAt: string | null;
};

/**
 * The collection shape these two endpoints use: `{count, results}`.
 *
 * NOT the four-field page envelope the order and device lists return. Neither
 * of these paginates — an order has a handful of revisions, not a board of
 * them — and inventing `page`/`page_size` fields the server does not send would
 * be describing a contract that does not exist.
 */
export type ServiceDiagnosticList = {
  count: number;
  results: readonly ServiceDiagnostic[];
};

export type ServiceQuoteList = {
  count: number;
  results: readonly ServiceQuote[];
};

/**
 * Recording a diagnosis. An intention.
 *
 * No `diagnosedBy` and no `technicianId`: the authenticated actor is the only
 * claim M9 supports. Recording a diagnosis in somebody else's name is a
 * business decision nobody has made.
 *
 * No `status` — finalising happens by publishing a quote, not by asking.
 */
export type ServiceDiagnosticInput = {
  description: string;
  recommendedAction: string;
  /** Optional on purpose: a technician often knows WHAT before they know WHY. */
  rootCause?: string;
  internalNotes?: string;
};

/**
 * Composing a quote's header.
 *
 * No `revision`, no `currency`, no `subtotal`, no `total`, no `status`: all of
 * them are the server's, and having no field is the only way to guarantee a
 * client cannot set one.
 */
export type ServiceQuoteInput = {
  diagnosticId?: number | null;
  validUntil?: string | null;
  customerNotes?: string;
  internalNotes?: string;
  discountAmount?: string;
};

/** One line. `lineTotal` is quantity × unitPrice, computed by the server. */
export type ServiceQuoteItemInput = {
  itemType: string;
  description: string;
  quantity: string;
  unitPrice: string;
  productId?: number | null;
  sortOrder?: number;
};

export const CAP_SERVICE_DIAGNOSTIC_MANAGE = 'service.diagnostic.manage';

/**
 * The line types a quote may carry.
 *
 * Mirrors Django's `RepairQuoteItem.TYPE_CHOICES`. The labels are a fallback
 * for a payload that arrives without `item_type_label`; the server rejects any
 * value outside this set regardless of what this app offers.
 */
export const SERVICE_QUOTE_ITEM_TYPES = [
  { value: 'labor', label: 'Mano de obra' },
  { value: 'part', label: 'Repuesto' },
  { value: 'service', label: 'Servicio' },
] as const;

// ---------------------------------------------------------------------------
// M10 / BR-005C — the bench and its parts. INTERNAL ONLY.
// ---------------------------------------------------------------------------
//
// There is no customer counterpart to anything below, and that is structural
// rather than an omission. A customer learns their device is `in_repair` from
// the status and its tenant label. They do not learn which battery went in,
// what the shop paid for it, which shelf it came off, or who fitted it. The
// approved quote is what they were told and agreed to, and M9 already shows
// them that.

/**
 * How a piece of work ENDED. Mirrors Django's `RepairResultCode`.
 *
 * Three members, and the platform means to keep it that way. Anything finer —
 * "replaced screen", "cleaned board" — is `workPerformed`, which is prose,
 * because a taxonomy of repairs is a taxonomy of every device ever made.
 */
export const SERVICE_RESULT_CODES = [
  { value: 'success', label: 'Resuelto' },
  { value: 'partial', label: 'Resuelto parcialmente' },
  { value: 'unresolved', label: 'No resuelto' },
] as const;

export type ServiceResultCode = (typeof SERVICE_RESULT_CODES)[number]['value'];

/** One part booked against a repair, and its reversal if it has one. */
export type ServicePartUsage = {
  id: number;
  quoteItemId: number;
  productId: number;
  /** Snapshotted at the moment of use, so an edited product name cannot rewrite history. */
  description: string;
  quantity: number;
  stockMovementId: number;
  actorName: string;
  createdAt: string;
  isReversed: boolean;
  reversedAt: string | null;
  reversedByName: string;
  reversalReason: string;
};

/**
 * The bench record.
 *
 * NOT the repair order. The order is the ticket — who brought what in and where
 * it is in its life. This is when somebody started, what they actually did and
 * when they stopped.
 */
export type ServiceExecution = {
  id: number;
  startedAt: string;
  completedAt: string | null;
  isCompleted: boolean;
  workPerformed: string;
  result: string;
  resultLabel: string;
  internalNotes: string;
  startedByName: string;
  completedByName: string;
  parts: readonly ServicePartUsage[];
  createdAt: string;
  updatedAt: string;
};

/**
 * A part this repair MAY still consume.
 *
 * A service-shaped answer, not an inventory one: the approved line, how much of
 * it is outstanding, and what the order's own branch holds. No cost, no other
 * branches, no Kardex — which is why this surface needs `service.repair.manage`
 * and never `inventory.view`.
 */
export type ServicePartCandidate = {
  quoteItemId: number;
  productId: number;
  description: string;
  approvedQuantity: number;
  usedQuantity: number;
  outstandingQuantity: number;
  availableInBranch: number;
};

/** What a technician may change on an OPEN execution. Three fields. */
export type ServiceExecutionInput = {
  workPerformed?: string;
  result?: string;
  internalNotes?: string;
};

/** Finishing. The result is required; a repair that ended has an outcome. */
export type ServiceCompleteInput = {
  workPerformed: string;
  result: ServiceResultCode;
  internalNotes?: string;
};

/**
 * Consuming a part: WHICH APPROVED LINE, and HOW MANY.
 *
 * No branch (it is the order's), no product (it is the line's), no price (the
 * quote settled that), no movement type or stock figures (inventory computes
 * those). `idempotencyKey` is here because only the client can mint one that
 * survives the client's own retry.
 */
export type ServicePartUsageInput = {
  quoteItemId: number;
  quantity: number;
  idempotencyKey: string;
};

export const CAP_SERVICE_REPAIR_MANAGE = 'service.repair.manage';

// ---------------------------------------------------------------------------
// M11 / BR-005D — quality control. INTERNAL ONLY.
// ---------------------------------------------------------------------------
//
// No customer counterpart, and the omission is structural. A customer sees the
// STAGE — "en control de calidad", then "listo para recoger" — through the
// ordinary status and their tenant's own label. They do not see which points
// were tested, which one failed, what the technician wrote about it, or who ran
// the inspection.
//
// "Falló la cámara frontal" is a note between a shop and itself. Publishing it
// would turn every rework into an argument.

/** How one point of a checklist came out. Mirrors Django's `QualityResultCode`. */
export const QUALITY_RESULTS = [
  { value: 'pass', label: 'Correcto' },
  { value: 'fail', label: 'Falla' },
  { value: 'not_applicable', label: 'No aplica' },
] as const;

export type QualityResult = (typeof QUALITY_RESULTS)[number]['value'];

/**
 * One point of the SNAPSHOT.
 *
 * `code` and `label` were copied when the inspection opened, not joined to a
 * template. An administrator who renames a point tomorrow has not changed what
 * a technician read on the screen today.
 */
export type ServiceQualityItem = {
  id: number;
  code: string;
  label: string;
  isRequired: boolean;
  /** '' until somebody answers. `not_applicable` IS an answer. */
  result: string;
  notes: string;
  sortOrder: number;
};

export type ServiceQualityCheck = {
  id: number;
  status: string;
  statusLabel: string;
  isOpen: boolean;
  /** The list's name at the moment it was copied. There is deliberately no id. */
  templateName: string;
  notes: string;
  checkedByName: string;
  completedByName: string;
  executionId: number;
  startedAt: string;
  completedAt: string | null;
  items: readonly ServiceQualityItem[];
};

/** Answering one point: a result and, optionally, why. */
export type ServiceQualityResultInput = {
  result: QualityResult;
  notes?: string;
};

export const CAP_SERVICE_QUALITY_MANAGE = 'service.quality.manage';
