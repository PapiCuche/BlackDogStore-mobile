import type { CustomerDocumentType } from './profile-types';

/**
 * MY ADDRESS BOOK IN THIS SHOP — DELIVERY-01.
 *
 * The same book the web's «Mi cuenta» keeps, through the same service
 * (`delivery_services`). Whose book it is is never asked of the request: it is
 * the signed-in account's, and an entry that is not in it answers 404 in every
 * verb.
 *
 * TWO KINDS OF ENTRY, AND THEY ARE NOT THE SAME SHAPE. A door needs a street,
 * a district and a city; an agency needs the agency's name, its locality and
 * WHICH carrier it belongs to — one of this shop's own active agencies. The
 * server drops the fields of the other kind on every save, so a door that
 * becomes an agency keeps nothing of its street.
 */
export type CustomerAddressKind = 'address' | 'agency';

export type CustomerAddress = {
  id: number;
  /** A name the buyer gave it, like «Casa». May be empty. */
  label: string;
  kind: CustomerAddressKind;
  recipientName: string;
  recipientDocumentType: CustomerDocumentType | '';
  recipientDocumentNumber: string;
  recipientPhone: string;
  /** Door entries. Empty on an agency entry. */
  addressLine: string;
  district: string;
  city: string;
  department: string;
  reference: string;
  /** Agency entries. `carrier` is null on a door entry. */
  carrier: number | null;
  carrierName: string;
  agencyName: string;
  agencyLocality: string;
  /** Exactly one entry of a book can be the default; the server enforces it. */
  isDefault: boolean;
};

/** One of the shop's own agencies, as the server offers them. */
export type AgencyCarrier = { id: number; name: string };

/**
 * The book, with what the shop allows.
 *
 * `limit` and `agencyCarriers` come from the server on every read rather than
 * being constants here: the limit is the shop's rule and the carriers are the
 * ones it has switched on today.
 */
export type CustomerAddressBook = {
  entries: readonly CustomerAddress[];
  limit: number;
  agencyCarriers: readonly AgencyCarrier[];
};

export const EMPTY_ADDRESS_BOOK: CustomerAddressBook = {
  entries: [],
  limit: 0,
  agencyCarriers: [],
};

/** `CustomerAddress` field lengths, so the keyboard stops where the server does. */
export const ADDRESS_FIELD_LIMITS = {
  label: 60,
  recipientName: 255,
  recipientPhone: 30,
  recipientDocumentNumber: 20,
  addressLine: 300,
  district: 100,
  city: 100,
  department: 100,
  reference: 250,
  agencyName: 120,
  agencyLocality: 120,
} as const;

/**
 * What a save sends. Absent fields keep their value, as on the profile.
 *
 * `carrier` is an id the SERVER published in `agencyCarriers`. There is no
 * other way to name a carrier here: an entry can never be GIVEN an agency the
 * shop does not offer, and a typed name would be a carrier nobody has.
 */
export type CustomerAddressInput = {
  kind?: CustomerAddressKind;
  label?: string;
  recipientName?: string;
  recipientPhone?: string;
  recipientDocumentType?: CustomerDocumentType | '';
  recipientDocumentNumber?: string;
  addressLine?: string;
  district?: string;
  city?: string;
  department?: string;
  reference?: string;
  carrier?: number;
  agencyName?: string;
  agencyLocality?: string;
};

/** Which fields each kind REQUIRES — `_address_values`, judged by kind. */
export const REQUIRED_DOOR_FIELDS = ['addressLine', 'district', 'city'] as const;
export const REQUIRED_AGENCY_FIELDS = ['agencyName', 'agencyLocality'] as const;

export function describeAddressKind(kind: CustomerAddressKind): string {
  return kind === 'agency' ? 'Agencia' : 'Dirección';
}

/** One line a person recognises, for a list where the detail does not fit. */
export function summariseAddress(entry: CustomerAddress): string {
  if (entry.kind === 'agency') {
    const place = [entry.agencyName, entry.agencyLocality].filter(Boolean).join(' · ');
    return entry.carrierName ? `${entry.carrierName} — ${place}` : place;
  }
  return [entry.addressLine, entry.district, entry.city].filter(Boolean).join(', ');
}
