import type { CustomerDocumentType } from '@/domain/customer/profile-types';

/**
 * AN ORDER'S DELIVERY, AS STAFF KEEP IT — DELIVERY-01.
 *
 * A RECORD BESIDE THE ORDER, not the order. Writing it changes neither the
 * delivery method the buyer chose, nor the address they typed, nor the total —
 * freight is information about what the shop paid — nor the dispatch state:
 * «enviado» is still said where it always was.
 *
 * `exists` tells a blank record from a real one, because the server answers the
 * same SHAPE either way: an order with no record reads as every field empty.
 */
export type DeliveryMode =
  | 'pickup_store'
  | 'local_delivery'
  | 'national_address'
  | 'agency_pickup'
  | '';

/** `OrderDelivery.FreightPaidBy`. */
export type FreightPaidBy = 'customer_at_destination' | 'store' | '';

export type OrderDeliveryRecord = {
  /** False for an order that has no record yet; the shape is the same. */
  exists: boolean;
  /**
   * Whether THIS reader may write it. Never true for a sale at the till — a
   * till sale has no delivery — so the server answers `can_edit` itself.
   */
  canEdit: boolean;
  mode: DeliveryMode;
  modeLabel: string;
  /**
   * The modes staff may leave this order in, FROM THE SERVER.
   *
   * Only two are interchangeable (`national_address` and `agency_pickup`);
   * everything else can only stay as it is. The list is read rather than
   * computed, so a rule change does not leave the app drawing a button the
   * save refuses.
   */
  allowedModes: readonly DeliveryMode[];
  recipientName: string;
  recipientDocumentType: CustomerDocumentType | '';
  recipientDocumentNumber: string;
  recipientPhone: string;
  /** The buyer's own address. Shown, never written from here. */
  addressLine: string;
  district: string;
  city: string;
  department: string;
  reference: string;
  carrier: number | null;
  /** The name the order LEFT with, not today's name of that carrier. */
  carrierName: string;
  agencyName: string;
  agencyLocality: string;
  /** A decimal string, or null. Information about freight, never part of a total. */
  freightAmount: string | null;
  freightPaidBy: FreightPaidBy;
  waybillNumber: string;
  trackingCode: string;
  trackingUrl: string;
  /**
   * Whether somebody TYPED that link.
   *
   * When false the link is derived from the carrier's page and the waybill, and
   * it moves when either does. That is why this app never sends `tracking_url`
   * back unchanged: a record echoed whole with a new waybill would freeze the
   * old page under the new number.
   */
  trackingUrlTyped: boolean;
  shippedAt: string | null;
  /** A name when the person has one; never a login. */
  updatedBy: string | null;
  updatedAt: string | null;
};

export const EMPTY_DELIVERY_RECORD: OrderDeliveryRecord = {
  exists: false,
  canEdit: false,
  mode: '',
  modeLabel: '',
  allowedModes: [],
  recipientName: '',
  recipientDocumentType: '',
  recipientDocumentNumber: '',
  recipientPhone: '',
  addressLine: '',
  district: '',
  city: '',
  department: '',
  reference: '',
  carrier: null,
  carrierName: '',
  agencyName: '',
  agencyLocality: '',
  freightAmount: null,
  freightPaidBy: '',
  waybillNumber: '',
  trackingCode: '',
  trackingUrl: '',
  trackingUrlTyped: false,
  shippedAt: null,
  updatedBy: null,
  updatedAt: null,
};

export function describeDeliveryMode(mode: DeliveryMode, label: string): string {
  if (label) return label;
  switch (mode) {
    case 'pickup_store':
      return 'Recojo en tienda';
    case 'local_delivery':
      return 'Delivery local';
    case 'national_address':
      return 'Envío nacional a domicilio';
    case 'agency_pickup':
      return 'Recojo en agencia';
    default:
      return 'Sin definir';
  }
}

export function describeFreightPaidBy(value: FreightPaidBy): string {
  if (value === 'customer_at_destination') return 'El cliente, al recibir';
  if (value === 'store') return 'La tienda';
  return 'Sin definir';
}

export const FREIGHT_PAID_BY_OPTIONS: readonly Exclude<FreightPaidBy, ''>[] = [
  'customer_at_destination',
  'store',
];

/** `OrderDelivery` field lengths, so the keyboard stops where the server does. */
export const DELIVERY_FIELD_LIMITS = {
  recipientName: 255,
  recipientPhone: 30,
  agencyName: 120,
  agencyLocality: 120,
  waybillNumber: 60,
  trackingCode: 80,
  trackingUrl: 500,
} as const;

/**
 * What a save sends — `STAFF_FIELDS`, minus what this app cannot name.
 *
 * THE BUYER'S ADDRESS IS NOT HERE. `address_line`, `district`, `city`,
 * `department` and `reference` are what the buyer typed; the staff allowlist
 * does not include them and neither does this.
 *
 * THE CARRIER IS NOT HERE EITHER, and that is a gap rather than a decision:
 * setting one needs the company's active carriers by id, and no `/api/v1/`
 * route lists them. See BR-013. An order keeps the carrier it has, and
 * everything else about its delivery can still be corrected.
 */
export type OrderDeliveryInput = {
  mode?: DeliveryMode;
  recipientName?: string;
  recipientPhone?: string;
  recipientDocumentType?: CustomerDocumentType | '';
  recipientDocumentNumber?: string;
  agencyName?: string;
  agencyLocality?: string;
  freightAmount?: string;
  freightPaidBy?: FreightPaidBy;
  waybillNumber?: string;
  trackingCode?: string;
  /** Sent ONLY when somebody typed it. See `trackingUrlTyped`. */
  trackingUrl?: string;
  /** An ISO timestamp, or '' to clear it. */
  shippedAt?: string;
};
