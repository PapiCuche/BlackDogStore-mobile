import type { Customer } from '@/domain/customers/types';

import type { AuthMode } from './auth-policy';

/**
 * Session types.
 *
 * ⚠️  MOBILE AUTHENTICATION IS NOT IMPLEMENTED. See docs/MOBILE_AUTH.md.
 *
 * THREE THINGS, KEPT APART (M1):
 *
 *   `AuthSession`  — product state. What the UI renders. Lives in React.
 *   `UserProfile`  — who the person is. Displayable. Lives inside the session.
 *   `TokenPair`    — transport credentials. NEVER here; see `tokens/`.
 *
 * The separation is not tidiness. React state ends up in devtools dumps, Fast
 * Refresh snapshots and crash reports, so anything placed here should be
 * treated as effectively public. That is fine for a display name and fatal for
 * a token.
 */

export type { AuthMode } from './auth-policy';

/** The person. Django's `UserSerializer` shape plus the role from `/auth/me/`. */
export type UserProfile = Customer;

/**
 * A company the signed-in user may act within.
 *
 * SaaS reality: a user can belong to several companies. Modelling a single
 * company on the session would have to be undone later, so the shape allows for
 * many from the start — while `activeCompany` keeps today's single-tenant
 * behaviour trivial.
 */
export type AuthCompanyRef = {
  slug: string;
  name: string;
};

/**
 * Tenant context, AS VALIDATED BY THE SERVER.
 *
 * `EXPO_PUBLIC_COMPANY_SLUG` is a build's CHOICE of storefront, not proof of
 * anything. It must never, on its own, grant access to private data. Authority
 * comes from the server having checked the relation.
 *
 * M3 — this is now populated for real. `/api/v1/auth/me/` returns the companies
 * the server VERIFIED this user has a relation with, from `Membership` (staff)
 * or `Customer` (buyer) rows it owns. `activeCompany` is the build's slug IF it
 * appears in that list, and **null otherwise** — no fallback to the pilot, no
 * "first company in the list", no membership invented from a build constant.
 *
 * A null `activeCompany` with a non-empty `availableCompanies` is a real and
 * meaningful state: this person has an account, just not with this storefront.
 *
 * Still not authorization. Every private endpoint re-checks server-side.
 *
 * See BR-002 and BR-006.
 */
export type AuthTenantContext = {
  activeCompany: AuthCompanyRef | null;
  availableCompanies: readonly AuthCompanyRef[];
};

export type AuthSession = {
  user: UserProfile;
  /** How this session was obtained. `mock` is visible to the UI on purpose. */
  mode: AuthMode;
  /**
   * ISO-8601 session expiry, or null when unknown / non-expiring (mock).
   * NOT the access token's expiry — that lives with the token, in memory.
   */
  expiresAt: string | null;
  /** Server-validated tenant context. Null until a contract provides it. */
  tenant: AuthTenantContext | null;
};

/**
 * The auth state machine.
 *
 * Five states, and each one exists because the UI must do something different:
 *
 *   loading                 deciding; show nothing conclusive
 *   authenticated           session in hand
 *   unauthenticated         no session; show the sign-in form
 *   unavailable             no auth mechanism in this BUILD; hide the form
 *   temporarily-unavailable credentials kept, server unreachable; offer retry
 *
 * `unavailable` and `temporarily-unavailable` look similar and are opposites:
 * the first is permanent for this build and the form is a lie, the second is a
 * connectivity blip and the credentials are still good.
 */
export type AuthStatus =
  | 'loading'
  | 'authenticated'
  | 'unauthenticated'
  | 'unavailable'
  | 'temporarily-unavailable';

/**
 * Sign-in input.
 *
 * `identifier` CARRIES AN EMAIL on the native contract. BR-001A settled it:
 * `/api/v1/auth/login/` takes `{email, password}`, unlike the web contract's
 * `username` (`USERNAME_FIELD` is still `username` on the stock `auth.User`,
 * and the web login is unchanged).
 *
 * The name stays abstract so a future contract could accept something else
 * without touching every caller, but it is no longer an open question: the
 * login screen collects an email and `DjangoAuthTransport` sends it as `email`.
 *
 * The password is present for exactly as long as one call takes. It is never
 * stored on the session, never persisted, never logged.
 */
export type SignInCredentials = {
  identifier: string;
  password: string;
};

export type RegistrationDetails = {
  firstName: string;
  email: string;
  password: string;
};
