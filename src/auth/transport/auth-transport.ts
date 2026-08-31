import type { Customer } from '@/domain/customers/types';

import type { TokenPair } from '../tokens/token-types';

/**
 * The seam where a real network implementation will eventually plug in.
 *
 * ⚠️  NO IMPLEMENTATION AGAINST DJANGO EXISTS, and none may be written until
 * BR-001 is accepted. `/api/v1/` exists on `origin/master` `b301637b` — but
 * only the anonymous catalogue, with backend tests asserting that
 * `/api/v1/auth/login|refresh|logout` all 404. Writing a `DjangoAuthTransport`
 * today would be code that calls a 404 and pretends to be integration.
 *
 * The interface exists anyway because it is what makes the rest of M1 real: the
 * refresh coordinator, the rotation handling and the retry pipeline are all
 * exercised against `FakeAuthTransport` in tests. When the endpoint appears,
 * the work is one class, not a redesign.
 *
 * NOTE ON SHAPE: `signIn` takes an identifier, not necessarily an email.
 * Verified on `origin/master`: `LoginView` builds a `TokenObtainPairSerializer`
 * over the stock `auth.User`, whose `USERNAME_FIELD` is `username`. Whether the
 * mobile contract accepts an email is an open question in BR-001, so the
 * interface does not presume the answer.
 */
export type AuthTransport = {
  signIn(input: { identifier: string; password: string }): Promise<AuthTransportResult>;
  /**
   * Exchange a refresh token for a new pair.
   *
   * MUST assume rotation: `origin/master` sets `ROTATE_REFRESH_TOKENS = True`
   * and `BLACKLIST_AFTER_ROTATION = True`, so a successful refresh invalidates
   * the token that was sent.
   */
  refresh(refreshToken: string): Promise<TokenPair>;
  /** Best-effort server-side revocation. May legitimately fail offline. */
  signOut(refreshToken: string): Promise<void>;
};

export type AuthTransportResult = {
  tokens: TokenPair;
  /**
   * The profile the server reports.
   *
   * Kept separate from the tokens because they have different lifetimes and
   * different sensitivity: the profile is displayable product state, the tokens
   * are credentials. See docs/MOBILE_AUTH.md > "Session ≠ tokens".
   */
  user: Customer;
};
