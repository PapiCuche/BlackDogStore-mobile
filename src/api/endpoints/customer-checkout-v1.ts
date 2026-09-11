import { companySlug } from '@/config/env';
import type { RefreshCoordinator } from '@/auth/refresh-coordinator';
import type { Cart } from '@/domain/cart/types';
import { toCheckoutItems } from '@/domain/cart/types';

import { authenticatedRequest } from '../authenticated-request';
import { ApiError } from '../errors';

/**
 * The NATIVE checkout — `POST /api/v1/customer/<company_slug>/checkout/`.
 *
 * Request verified on `PapiCuche/BlackDogStore-web` @ `origin/master` `0b184d3`
 * (PR #4); response re-verified on `2dca0a3`.
 *
 * WHAT THIS SENDS: intent. A list of `{product_slug, quantity}`, the buyer's
 * details, and an idempotency key. Nothing about money.
 *
 * The server REJECTS a price, a total, a discount, a stock figure, a company or
 * a branch — it does not merely ignore them. So this module has no way to
 * express one, which is the point: a client that cannot say what something
 * costs cannot be wrong about it.
 */

export class MissingTenantError extends Error {
  constructor() {
    super(
      'Esta build no tiene empresa configurada (EXPO_PUBLIC_COMPANY_SLUG). ' +
        'No se puede pagar sin saber en qué tienda.',
    );
    this.name = 'MissingTenantError';
  }
}

/** The idempotency key was reused for a different basket. The fix is a new key. */
export class CheckoutConflictError extends Error {
  readonly orderId: number | null;

  constructor(orderId: number | null) {
    super('Esta compra ya se inició con otro contenido. Vuelve a intentarlo desde el carrito.');
    this.name = 'CheckoutConflictError';
    this.orderId = orderId;
  }
}

/** The basket cannot be bought as it stands — stock, availability or coupon. */
export class CheckoutRejectedError extends Error {
  readonly reasons: readonly string[];

  constructor(detail: string, reasons: readonly string[] = []) {
    super(detail);
    this.name = 'CheckoutRejectedError';
    this.reasons = reasons;
  }
}

export type CheckoutDetails = {
  customerName: string;
  customerPhone: string;
  documentType: 'dni' | 'ruc' | 'ce';
  documentNumber: string;
  deliveryMethod: 'pickup_store' | 'delivery_arequipa' | 'national_shipping';
  receiptType: 'boleta' | 'factura';
  acceptedTerms: boolean;
  acceptedWarrantyPolicy: boolean;
  addressLine?: string;
  city?: string;
  district?: string;
  reference?: string;
  notes?: string;
  couponCode?: string;
  /** Optional. Contact only — the order belongs to the authenticated user. */
  contactEmail?: string;
};

/**
 * What this app takes from the answer: the order, and nothing else.
 *
 * The server also returns `status` and a `payment` session: an Izipay session
 * built for the web SDK (`08b8d7f`). This module deliberately does NOT read
 * `payment`. Opening a payment from the app is blocked (BR-010 / H-PAY-01, see
 * `config/customer-payment.ts`), and half-reading a session built for another
 * client would be a payment integration nobody verified.
 */
export type CheckoutResult = {
  orderId: number;
};

function customerPath(slug: string): string {
  return `/api/v1/customer/${encodeURIComponent(slug)}`;
}

function requireTenant(): string {
  if (!companySlug) throw new MissingTenantError();
  return companySlug;
}

export async function postCheckout(
  input: {
    cart: Cart;
    details: CheckoutDetails;
    /** Stable across retries of the SAME basket; different for a new attempt. */
    idempotencyKey: string;
  },
  deps: { refreshCoordinator: RefreshCoordinator },
  signal?: AbortSignal,
): Promise<CheckoutResult> {
  const body: Record<string, unknown> = {
    items: toCheckoutItems(input.cart),
    customer_name: input.details.customerName,
    customer_phone: input.details.customerPhone,
    document_type: input.details.documentType,
    document_number: input.details.documentNumber,
    delivery_method: input.details.deliveryMethod,
    receipt_type: input.details.receiptType,
    accepted_terms: input.details.acceptedTerms,
    accepted_warranty_policy: input.details.acceptedWarrantyPolicy,
    idempotency_key: input.idempotencyKey,
  };

  // Optional fields are omitted rather than sent empty: the server's conditional
  // validation reads absence and blankness the same way, and sending nothing is
  // the smaller payload and the clearer intent.
  const optional: [string, string | undefined][] = [
    ['address_line', input.details.addressLine],
    ['city', input.details.city],
    ['district', input.details.district],
    ['reference', input.details.reference],
    ['notes', input.details.notes],
    ['coupon_code', input.details.couponCode],
    ['contact_email', input.details.contactEmail],
  ];
  for (const [key, value] of optional) {
    if (value !== undefined && value !== '') body[key] = value;
  }

  try {
    const raw = await authenticatedRequest<{ order_id: number }>(
      `${customerPath(requireTenant())}/checkout/`,
      { method: 'POST', body, scope: 'authenticated-v1', signal },
      deps,
    );
    return { orderId: Number(raw.order_id) };
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      throw new CheckoutConflictError(readOrderId(error));
    }
    if (error instanceof ApiError && error.status === 400) {
      throw new CheckoutRejectedError(error.message, readReasons(error));
    }
    throw error;
  }
}

function readOrderId(error: ApiError): number | null {
  const value = (error.fieldErrors as Record<string, unknown> | null)?.order_id;
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readReasons(error: ApiError): string[] {
  const value = (error.fieldErrors as Record<string, unknown> | null)?.errors;
  if (Array.isArray(value)) return value.map(String);
  return [];
}
