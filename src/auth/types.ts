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
 * Null until a backend contract delivers it, and that is the whole point:
 * `EXPO_PUBLIC_COMPANY_SLUG` is a build's CHOICE of storefront, not proof of
 * anything. It must never, on its own, grant access to private data. Authority
 * comes from the server having checked the user's membership — exactly what
 * `store/tenancy.py` already does for staff via `resolve_company_for_user`.
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
 * `identifier`, not `email`: verified on `origin/master`, `LoginView` builds a
 * `TokenObtainPairSerializer` over the stock `auth.User`, whose
 * `USERNAME_FIELD` is `username`. Whether the mobile contract will accept an
 * email is an open question in BR-001, so the type does not presume it.
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
