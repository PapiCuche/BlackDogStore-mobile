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
