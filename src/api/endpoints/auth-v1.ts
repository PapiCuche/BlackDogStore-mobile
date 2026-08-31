import type { Customer, CustomerRole } from '@/domain/customers/types';

import { request } from '../client';

/**
 * The NATIVE authentication contract — `/api/v1/auth/`.
 *
 * Verified on `PapiCuche/BlackDogStore-web` @ `origin/master` `7c55ebc`
 * (PR #2, "feat(api): add scoped v1 native authentication"):
 *
 *   POST /api/v1/auth/login/    { email, password } → tokens in the BODY
 *   POST /api/v1/auth/refresh/  { refresh }         → access + ROTATED refresh
 *   POST /api/v1/auth/logout/   { refresh }         → best effort, always 200
 *   GET  /api/v1/auth/me/       Bearer              → identity + companies
 *
 * WHY THIS IS NOT `/api/auth/`
 *
 * The web contract posts a USERNAME and returns its JWTs in HttpOnly cookies
 * paired with CSRF — a browser contract this client cannot speak, and one we
 * are explicitly not changing. `src/api/api-scope.ts` refuses to send a Bearer
 * token to `/api/auth/`, `/api/admin/` or `/api/me/` for exactly that reason.
 *
 * NOTHING HERE IS LOGGED. Not the password, not a token, not a header. The only
 * thing that ever leaves this module is a typed result or a typed error.
 */

/** Login and `/me/` return the same identity envelope. */
type IdentityWire = {
  user: {
    id: number;
    username: string;
    email: string;
    first_name: string;
    last_name: string;
    role: string;
    is_email_verified: boolean;
  };
  available_companies: {
    slug: string;
    name: string;
    relation: string;
  }[];
};

type TokenWire = {
  access: string;
  refresh: string;
  /** Seconds, matching how SimpleJWT expresses lifetimes. */
  expires_in: number;
};

export type AuthLoginWire = TokenWire & IdentityWire;
export type AuthRefreshWire = TokenWire;
export type AuthIdentityWire = IdentityWire;

/**
 * A company the server has VERIFIED this user has a relation with.
 *
 * `relation` is reported rather than flattened because `member` (staff) and
 * `customer` (buyer) are different facts. The app must not treat one as the
 * other, and neither is a grant: every private endpoint re-checks for itself.
 */
export type CompanyRelation = 'member' | 'customer';

export type AuthCompanyWire = {
  slug: string;
  name: string;
  relation: CompanyRelation;
};

const KNOWN_ROLES: readonly string[] = [
  'customer', 'sales', 'inventory', 'technician', 'admin', 'superadmin',
];

function toRole(raw: unknown): CustomerRole {
  // An unrecognised role degrades to the least privileged one rather than
  // being passed through. A future backend role must not become a truthy
  // string that some screen compares loosely.
  const value = String(raw ?? '');
  return (KNOWN_ROLES.includes(value) ? value : 'customer') as CustomerRole;
}

export function toCustomer(wire: IdentityWire['user']): Customer {
  return {
    id: Number(wire.id),
    username: String(wire.username ?? ''),
    email: String(wire.email ?? ''),
    firstName: String(wire.first_name ?? ''),
    lastName: String(wire.last_name ?? ''),
    role: toRole(wire.role),
    isEmailVerified: Boolean(wire.is_email_verified),
  };
}

export function toCompanies(rows: IdentityWire['available_companies']): AuthCompanyWire[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row) => row && typeof row.slug === 'string' && row.slug.length > 0)
    .map((row) => ({
      slug: row.slug,
      name: String(row.name ?? ''),
      // Anything the app does not recognise is treated as the WEAKER relation.
      relation: row.relation === 'member' ? 'member' : 'customer',
    }));
}

export async function postLogin(
  credentials: { email: string; password: string },
  signal?: AbortSignal,
): Promise<AuthLoginWire> {
  return request<AuthLoginWire>('/api/v1/auth/login/', {
    method: 'POST',
    body: credentials,
    signal,
  });
}

export async function postRefresh(
  refreshToken: string,
  signal?: AbortSignal,
): Promise<AuthRefreshWire> {
  return request<AuthRefreshWire>('/api/v1/auth/refresh/', {
    method: 'POST',
    body: { refresh: refreshToken },
    signal,
  });
}

/**
 * Best-effort server-side revocation.
 *
 * The server answers 200 for an expired, malformed or already-blacklisted
 * token, so the only failure this can produce is a network one — which the
 * caller ignores, because the local credentials are already gone by then.
 */
export async function postLogout(refreshToken: string, signal?: AbortSignal): Promise<void> {
  await request<unknown>('/api/v1/auth/logout/', {
    method: 'POST',
    body: { refresh: refreshToken },
    signal,
  });
}

/**
 * The caller's own identity.
 *
 * Takes the access token as an ARGUMENT rather than reading it from the store,
 * because the cold-start path calls this immediately after a refresh, with a
 * token it holds and the store may not have installed yet.
 *
 * Uses `request` with an explicit header instead of `authenticatedRequest`: this
 * call must NOT trigger the 401→refresh→retry pipeline. It is what runs right
 * after a refresh, and letting it start another one would be a loop.
 */
export async function getIdentity(
  accessToken: string,
  signal?: AbortSignal,
): Promise<AuthIdentityWire> {
  return request<AuthIdentityWire>('/api/v1/auth/me/', {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal,
  });
}
