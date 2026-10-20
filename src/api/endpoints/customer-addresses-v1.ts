import { companySlug } from '@/config/env';
import type {
  AgencyCarrier,
  CustomerAddress,
  CustomerAddressBook,
  CustomerAddressInput,
  CustomerAddressKind,
} from '@/domain/customer/address-types';
import type { CustomerDocumentType } from '@/domain/customer/profile-types';
import { CUSTOMER_DOCUMENT_TYPES } from '@/domain/customer/profile-types';

import type { RefreshCoordinator } from '@/auth/refresh-coordinator';

import { authenticatedRequest } from '../authenticated-request';

/**
 * MY ADDRESS BOOK — `/api/v1/customer/<slug>/addresses/…`, DELIVERY-01.
 *
 * Verified on `PapiCuche/BlackDogStore-web` @ `origin/master`
 * `1448a5dd` (`store/v1_customer_views.py` > `_book_view`,
 * `store/account_views.py` > `AddressBookActions`, `store/delivery_services.py`):
 *
 *   GET    addresses/                 the book, the shop's limit and its agencies
 *   POST   addresses/                 add one
 *   PATCH  addresses/<id>/            correct one
 *   DELETE addresses/<id>/            take one out (204)
 *   POST   addresses/<id>/default/    make one the default
 *
 * ONE BOOK, TWO DOORS. The web reads the shop from the Host and the app from
 * the path; everything else is the same service and the same answers. Whose
 * book it is is never asked of the request.
 *
 * 404 FOR ANYTHING THAT IS NOT MINE, in every verb — never 403. A 403 would
 * confirm the entry exists, which is what somebody trying numbers is asking.
 *
 * THE DEFAULT IS THE SERVER'S TO MOVE. Exactly one active entry of a book can
 * be the default, enforced by a database constraint, so «make this the
 * default» is its own call and the answer is the entry as it now stands.
 */

export class MissingTenantError extends Error {
  constructor() {
    super(
      'Esta build no tiene empresa configurada (EXPO_PUBLIC_COMPANY_SLUG). ' +
        'No se pueden pedir tus direcciones sin saber de qué tienda.',
    );
    this.name = 'MissingTenantError';
  }
}

type Row = Record<string, unknown>;
type Deps = { refreshCoordinator: RefreshCoordinator };

function requireTenant(): string {
  if (!companySlug) throw new MissingTenantError();
  return companySlug;
}

function addressesPath(slug: string): string {
  return `/api/v1/customer/${encodeURIComponent(slug)}/addresses`;
}

function entryPath(id: number): string {
  return `${addressesPath(requireTenant())}/${encodeURIComponent(String(id))}/`;
}

function str(raw: unknown): string {
  return raw === null || raw === undefined ? '' : String(raw);
}

function toKind(raw: unknown): CustomerAddressKind {
  // Anything but the server's own word for an agency reads as a door: a door
  // entry shows a street, which is the harmless way to be wrong.
  return str(raw) === 'agency' ? 'agency' : 'address';
}

function toDocumentType(raw: unknown): CustomerDocumentType | '' {
  const value = str(raw);
  return (CUSTOMER_DOCUMENT_TYPES as readonly string[]).includes(value)
    ? (value as CustomerDocumentType)
    : '';
}

function toCarrierId(raw: unknown): number | null {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : null;
}

export function toCustomerAddress(raw: unknown): CustomerAddress {
  const row = (raw ?? {}) as Row;
  return {
    id: Number(row.id),
    label: str(row.label),
    kind: toKind(row.kind),
    recipientName: str(row.recipient_name),
    recipientDocumentType: toDocumentType(row.recipient_document_type),
    recipientDocumentNumber: str(row.recipient_document_number),
    recipientPhone: str(row.recipient_phone),
    addressLine: str(row.address_line),
    district: str(row.district),
    city: str(row.city),
    department: str(row.department),
    reference: str(row.reference),
    carrier: toCarrierId(row.carrier),
    carrierName: str(row.carrier_name),
    agencyName: str(row.agency_name),
    agencyLocality: str(row.agency_locality),
    isDefault: row.is_default === true,
  };
}

function toAgencyCarriers(raw: unknown): AgencyCarrier[] {
  if (!Array.isArray(raw)) return [];
  const carriers: AgencyCarrier[] = [];
  for (const entry of raw) {
    const row = (entry ?? {}) as Row;
    const id = toCarrierId(row.id);
    // A carrier with no usable id cannot be chosen, and offering its name
    // would let somebody pick something the save then refuses.
    if (id === null) continue;
    carriers.push({ id, name: str(row.name) });
  }
  return carriers;
}

function toCount(raw: unknown): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

/** The book, the shop's limit and the agencies it offers today. */
export async function fetchAddressBook(
  deps: Deps,
  signal?: AbortSignal,
): Promise<CustomerAddressBook> {
  const row = (await authenticatedRequest<unknown>(
    `${addressesPath(requireTenant())}/`,
    { scope: 'authenticated-v1', signal },
    deps,
  )) as Row;

  const results = row.results;
  return {
    entries: Array.isArray(results) ? results.map(toCustomerAddress) : [],
    // The limit is the shop's rule, read on every request rather than pinned
    // here: a build from last month must not promise ten when it is now five.
    limit: toCount(row.limit),
    agencyCarriers: toAgencyCarriers(row.agency_carriers),
  };
}

/**
 * The body of a save: only what the caller set.
 *
 * The server keeps every field the body omits, so a PATCH of the label cannot
 * blank a reference somebody typed carefully. The document goes as a pair, as
 * on the profile.
 */
function addressBody(input: CustomerAddressInput): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (input.kind !== undefined) body.kind = input.kind;
  if (input.label !== undefined) body.label = input.label;
  if (input.recipientName !== undefined) body.recipient_name = input.recipientName;
  if (input.recipientPhone !== undefined) body.recipient_phone = input.recipientPhone;
  if (
    input.recipientDocumentType !== undefined
    || input.recipientDocumentNumber !== undefined
  ) {
    body.recipient_document_type = input.recipientDocumentType ?? '';
    body.recipient_document_number = input.recipientDocumentNumber ?? '';
  }
  if (input.addressLine !== undefined) body.address_line = input.addressLine;
  if (input.district !== undefined) body.district = input.district;
  if (input.city !== undefined) body.city = input.city;
  if (input.department !== undefined) body.department = input.department;
  if (input.reference !== undefined) body.reference = input.reference;
  if (input.carrier !== undefined) body.carrier = input.carrier;
  if (input.agencyName !== undefined) body.agency_name = input.agencyName;
  if (input.agencyLocality !== undefined) body.agency_locality = input.agencyLocality;
  return body;
}

/**
 * Add an entry.
 *
 * The first entry of a book makes its owner a client of the shop, with the
 * account's name — so an account with no name is refused with «Completa tu
 * nombre en «Mi cuenta»», and that sentence is shown as the server wrote it.
 */
export async function createAddress(
  input: CustomerAddressInput,
  deps: Deps,
  signal?: AbortSignal,
): Promise<CustomerAddress> {
  return toCustomerAddress(
    await authenticatedRequest<unknown>(
      `${addressesPath(requireTenant())}/`,
      { scope: 'authenticated-v1', method: 'POST', body: addressBody(input), signal },
      deps,
    ),
  );
}

export async function updateAddress(
  id: number,
  input: CustomerAddressInput,
  deps: Deps,
  signal?: AbortSignal,
): Promise<CustomerAddress> {
  return toCustomerAddress(
    await authenticatedRequest<unknown>(
      entryPath(id),
      { scope: 'authenticated-v1', method: 'PATCH', body: addressBody(input), signal },
      deps,
    ),
  );
}

/**
 * Take an entry out of the book.
 *
 * The server DEACTIVATES it rather than deleting the row — an order that was
 * shipped there still points at it — and answers 204, so there is nothing to
 * map back.
 */
export async function removeAddress(
  id: number,
  deps: Deps,
  signal?: AbortSignal,
): Promise<void> {
  await authenticatedRequest<unknown>(
    entryPath(id),
    { scope: 'authenticated-v1', method: 'DELETE', signal },
    deps,
  );
}

/** Make one entry the default. The server moves the flag off the previous one. */
export async function setDefaultAddress(
  id: number,
  deps: Deps,
  signal?: AbortSignal,
): Promise<CustomerAddress> {
  return toCustomerAddress(
    await authenticatedRequest<unknown>(
      `${entryPath(id)}default/`,
      { scope: 'authenticated-v1', method: 'POST', body: {}, signal },
      deps,
    ),
  );
}
