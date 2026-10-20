import { companySlug } from '@/config/env';
import type {
  CustomerDocumentType,
  CustomerProfile,
  CustomerProfileInput,
  EmailCodeRequest,
} from '@/domain/customer/profile-types';
import { CUSTOMER_DOCUMENT_TYPES } from '@/domain/customer/profile-types';

import type { RefreshCoordinator } from '@/auth/refresh-coordinator';

import { authenticatedRequest } from '../authenticated-request';
import { ApiError } from '../errors';

/**
 * MY OWN FILE IN THIS SHOP — `/api/v1/customer/<slug>/…`, CLIENT-SEC-01.
 *
 * Verified on `PapiCuche/BlackDogStore-web` @ `origin/master`
 * `1448a5dd` (`store/v1_customer_views.py`, `store/customer_profile.py`,
 * `store/account_views.py` > `VerifyOwnEmailActions`):
 *
 *   GET   profile/                my five fields, plus what is known of my address
 *   PATCH profile/                save what I changed
 *   POST  verify-email/send/      send a code to the address that signs me in
 *   POST  verify-email/confirm/   {code}
 *
 * NO CAPABILITY. This is not administrative data about other people: it is the
 * caller's own record. The gate is the one the whole customer surface shares —
 * a client of the company in the path — and somebody who is not gets a 404
 * before anything is looked up.
 *
 * THE ADDRESS IS NEVER SENT. `verify-email/send/` mails the account's own
 * address, read from the session; there is no field here that could aim a code
 * at somebody else's inbox. The code also cannot finish or revive an account
 * that cannot sign in — its token has a purpose of its own.
 *
 * ALL OR NOTHING ON A SAVE. One refused field leaves the record exactly as it
 * was, including whether there is a record at all, so the answer to a PATCH is
 * the profile as it now stands rather than what was asked for.
 */

export class MissingTenantError extends Error {
  constructor() {
    super(
      'Esta build no tiene empresa configurada (EXPO_PUBLIC_COMPANY_SLUG). ' +
        'No se puede abrir tu cuenta sin saber de qué tienda.',
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

function customerPath(slug: string): string {
  return `/api/v1/customer/${encodeURIComponent(slug)}`;
}

function str(raw: unknown): string {
  return raw === null || raw === undefined ? '' : String(raw);
}

function nullableStr(raw: unknown): string | null {
  return raw === null || raw === undefined || raw === '' ? null : String(raw);
}

function toDocumentType(raw: unknown): CustomerDocumentType | '' {
  const value = str(raw);
  // An unknown type reads as none at all. Showing «DNI» for something the
  // server called something else would misdescribe somebody's identity.
  return (CUSTOMER_DOCUMENT_TYPES as readonly string[]).includes(value)
    ? (value as CustomerDocumentType)
    : '';
}

export function toCustomerProfile(raw: unknown): CustomerProfile {
  const row = (raw ?? {}) as Row;
  return {
    email: str(row.email),
    emailVerifiedAt: nullableStr(row.email_verified_at),
    // Absent reads as "not available": offering a code the server would refuse
    // teaches people the button is broken.
    emailVerificationAvailable: row.email_verification_available === true,
    firstName: str(row.first_name),
    lastName: str(row.last_name),
    phone: str(row.phone),
    documentType: toDocumentType(row.document_type),
    documentNumber: str(row.document_number),
    // Absent reads as LOCKED: the safe default is not offering to edit a
    // document the shop may own.
    documentLocked: row.document_locked !== false,
  };
}

/** My record as it stands. A fresh request every time: `Cache-Control: no-store`. */
export async function fetchCustomerProfile(
  deps: Deps,
  signal?: AbortSignal,
): Promise<CustomerProfile> {
  return toCustomerProfile(
    await authenticatedRequest<unknown>(
      `${customerPath(requireTenant())}/profile/`,
      { scope: 'authenticated-v1', signal },
      deps,
    ),
  );
}

/**
 * Save what changed, and nothing else.
 *
 * A field that is absent from the body KEEPS its value — that is the server's
 * rule (`if field not in data`) — so sending the whole form would overwrite a
 * phone somebody corrected at the counter five minutes ago. Only what the
 * person touched travels.
 *
 * The document is sent as a PAIR, because the server judges it as one: a
 * number without its type cannot be checked, and a type without a number says
 * nothing.
 */
export async function updateCustomerProfile(
  input: CustomerProfileInput,
  deps: Deps,
  signal?: AbortSignal,
): Promise<CustomerProfile> {
  const body: Record<string, unknown> = {};
  if (input.firstName !== undefined) body.first_name = input.firstName;
  if (input.lastName !== undefined) body.last_name = input.lastName;
  if (input.phone !== undefined) body.phone = input.phone;
  if (input.documentType !== undefined || input.documentNumber !== undefined) {
    body.document_type = input.documentType ?? '';
    body.document_number = input.documentNumber ?? '';
  }

  return toCustomerProfile(
    await authenticatedRequest<unknown>(
      `${customerPath(requireTenant())}/profile/`,
      { scope: 'authenticated-v1', method: 'PATCH', body, signal },
      deps,
    ),
  );
}

/**
 * Ask for a code for my own address.
 *
 * Three answers worth telling apart, and the server tells them apart itself:
 * an address already proved comes back 200 with `already_verified`, a second
 * request too soon is a 429 with the shop's own sentence, and a mail that
 * could not be sent is a 503 — in that last case the server rolled the code
 * back, so asking again later is the right move and nothing was spent.
 */
export async function sendOwnEmailCode(
  deps: Deps,
  signal?: AbortSignal,
): Promise<EmailCodeRequest> {
  const row = (await authenticatedRequest<unknown>(
    `${customerPath(requireTenant())}/verify-email/send/`,
    { scope: 'authenticated-v1', method: 'POST', body: {}, signal },
    deps,
  )) as Row;

  return {
    detail: str(row.detail),
    alreadyVerified: row.already_verified === true,
    emailVerifiedAt: nullableStr(row.email_verified_at),
  };
}

/**
 * Hand the code back.
 *
 * The server counts the attempts and refuses with one sentence whatever went
 * wrong — wrong code, expired, spent — so this does not guess which it was.
 */
export async function confirmOwnEmailCode(
  code: string,
  deps: Deps,
  signal?: AbortSignal,
): Promise<{ detail: string; emailVerifiedAt: string | null }> {
  const row = (await authenticatedRequest<unknown>(
    `${customerPath(requireTenant())}/verify-email/confirm/`,
    { scope: 'authenticated-v1', method: 'POST', body: { code: code.trim() }, signal },
    deps,
  )) as Row;

  return { detail: str(row.detail), emailVerifiedAt: nullableStr(row.email_verified_at) };
}

/**
 * Whether a refusal is the throttle rather than a bad code.
 *
 * «Ya te enviamos un código hace poco» is not an error to retry on a loop: the
 * wait is one a minute and five a day, counted on the account.
 */
export function isEmailCodeThrottled(error: unknown): boolean {
  return error instanceof ApiError && error.status === 429;
}
