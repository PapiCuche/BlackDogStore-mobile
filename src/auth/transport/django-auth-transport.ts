import {
  getIdentity,
  postLogin,
  postLogout,
  postRefresh,
  toCompanies,
  toCustomer,
  type AuthCompanyWire,
} from '@/api/endpoints/auth-v1';
import { ApiError } from '@/api/errors';

import { RefreshNetworkError, RefreshRejectedError } from '../auth-errors';
import { toTokenPair, type TokenPair } from '../tokens/token-types';
import type { AuthTransport, AuthTransportResult } from './auth-transport';

/**
 * `AuthTransport` over the native `/api/v1/auth/` contract.
 *
 * M1 built the whole session machine — vault, access store, refresh coordinator,
 * retry pipeline — against `FakeAuthTransport`, on the bet that when the
 * endpoint appeared the work would be one class rather than a redesign. This is
 * that class.
 *
 * ITS ONE REAL JOB beyond calling four endpoints: translating HTTP failures into
 * the two auth outcomes that behave OPPOSITELY.
 *
 *   401 / 403  → RefreshRejectedError  → terminal, credentials wiped
 *   network    → RefreshNetworkError   → keep credentials, retry later
 *
 * Collapsing them is the classic bug: treat a network blip as a rejection and
 * you sign out everyone who walked into a lift; treat a rejection as a blip and
 * you leave a zombie session hammering a blacklisted token forever.
 */
export type SessionSnapshot = {
  user: AuthTransportResult['user'];
  companies: readonly AuthCompanyWire[];
};

export type DjangoAuthTransport = AuthTransport & {
  /**
   * Who the current access token belongs to.
   *
   * Not part of `AuthTransport` because refresh coordination does not need it —
   * only cold start does. `restoreSession` refreshes, then asks this, because
   * the app deliberately does NOT persist the profile: one place says who is
   * signed in, and it is the server.
   */
  getCurrentSession(accessToken: string): Promise<SessionSnapshot>;
};

/**
 * Map a transport failure onto the auth outcome it actually is.
 *
 * A 401 or 403 from `/auth/refresh/` means the server looked at the token and
 * said no. Everything else — timeout, DNS, offline, 500, 502 — is "we could not
 * ask", and the credentials might still be perfectly good.
 */
function asRefreshFailure(error: unknown): RefreshRejectedError | RefreshNetworkError {
  if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
    return new RefreshRejectedError('unknown');
  }
  return new RefreshNetworkError();
}

export function createDjangoAuthTransport(): DjangoAuthTransport {
  return {
    async signIn({ identifier, password }): Promise<AuthTransportResult> {
      // `identifier` IS an email on this contract. The parameter keeps its
      // abstract name so the interface does not have to change if a future
      // contract accepts something else, but the mapping here is unambiguous
      // and the login screen collects an email address.
      const wire = await postLogin({ email: identifier, password });
      return {
        tokens: toTokenPair(wire),
        user: toCustomer(wire.user),
      };
    },

    async refresh(refreshToken: string): Promise<TokenPair> {
      try {
        return toTokenPair(await postRefresh(refreshToken));
      } catch (error) {
        throw asRefreshFailure(error);
      }
    },

    async signOut(refreshToken: string): Promise<void> {
      // Deliberately unguarded: the caller has already cleared the local
      // credentials and treats any failure here as "the server will expire it
      // on its own". Rethrowing would only give the caller something to ignore.
      await postLogout(refreshToken);
    },

    async getCurrentSession(accessToken: string): Promise<SessionSnapshot> {
      try {
        const wire = await getIdentity(accessToken);
        return { user: toCustomer(wire.user), companies: toCompanies(wire.available_companies) };
      } catch (error) {
        // Same distinction as refresh: a rejected token is terminal, an
        // unreachable server is not.
        throw asRefreshFailure(error);
      }
    },
  };
}
