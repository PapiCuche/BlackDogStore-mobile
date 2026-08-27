import type { Customer } from '@/domain/customers/types';

/**
 * Mobile authentication types.
 *
 * ⚠️  MOBILE AUTHENTICATION IS NOT IMPLEMENTED. See docs/MOBILE_AUTH.md.
 *
 * The Django backend authenticates with a JWT in an HttpOnly cookie plus a CSRF
 * header (`store.authentication.CookieJWTAuthentication`). That is a correct
 * design FOR A BROWSER and it is not being changed. It is, however, not a
 * contract a native client can speak: the token is deliberately unreadable from
 * JavaScript, and the CSRF pairing assumes a same-site browser context.
 *
 * These types describe the shape M1 will need. They are wired to a mock so the
 * whole app can be navigated in development, and to nothing else.
 */

/**
 * How the current session was obtained.
 *
 * `mock` is a first-class value rather than a hidden flag: any screen that
 * shows account data can check it, and the app can refuse to do anything
 * destructive while the session is not real.
 */
export type AuthMode = 'mock' | 'backend';

export type AuthSession = {
  customer: Customer;
  mode: AuthMode;
  /**
   * ISO-8601 expiry, or null for a mock session that never expires.
   * The token itself is NOT here — it belongs in SecureStore, never in React
   * state that can end up in a crash report or a Redux-style devtools dump.
   */
  expiresAt: string | null;
};

export type AuthStatus =
  /** Restoring a persisted session; nothing has been decided yet. */
  | 'loading'
  | 'authenticated'
  | 'unauthenticated';

export type SignInCredentials = {
  email: string;
  password: string;
};

export type RegistrationDetails = {
  firstName: string;
  email: string;
  password: string;
};
