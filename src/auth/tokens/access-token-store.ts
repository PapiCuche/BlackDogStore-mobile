import { isAccessTokenExpired, type AccessToken } from './token-types';

/**
 * The access token. IN MEMORY ONLY.
 *
 * DECISION (M1): the access token is never persisted — not to SecureStore, not
 * to AsyncStorage, not to React state.
 *
 *  - It is short-lived by design (SimpleJWT's `ACCESS_TOKEN_LIFETIME` is 30
 *    minutes on `origin/master`), so persisting it buys almost nothing.
 *  - Anything written to the Keychain survives process death and device backup
 *    windows. A credential that does not need to survive should not.
 *  - Killing the app should end the ability to make authenticated calls. The
 *    refresh token, which IS persisted, is what re-establishes a session.
 *
 * NOT React state, either. State ends up in devtools dumps, in Fast Refresh
 * snapshots and in crash reports, and a re-render is not a security boundary.
 * The store is a plain closure that React never sees.
 */
export type AccessTokenStore = {
  /** The token if present and not (near-)expired, otherwise null. */
  get(nowMs?: number): string | null;
  /** The raw entry, expiry included. For diagnostics that must not leak it. */
  peek(): AccessToken | null;
  set(token: AccessToken): void;
  clear(): void;
  /** True when there is an entry but it is at or near expiry. */
  isExpired(nowMs?: number): boolean;
};

export function createMemoryAccessTokenStore(): AccessTokenStore {
  // The entire persistence story of the access token: one closure variable.
  let current: AccessToken | null = null;

  return {
    get(nowMs = Date.now()) {
      if (!current) return null;
      // An expired token is treated as absent so callers cannot accidentally
      // attach one and turn a refresh into a 401.
      return isAccessTokenExpired(current, nowMs) ? null : current.value;
    },
    peek() {
      return current;
    },
    set(token) {
      current = token;
    },
    clear() {
      current = null;
    },
    isExpired(nowMs = Date.now()) {
      return current === null || isAccessTokenExpired(current, nowMs);
    },
  };
}

/**
 * The app-wide instance.
 *
 * A module singleton, so it dies with the JS context — which is exactly the
 * lifetime we want. Tests build their own with `createMemoryAccessTokenStore()`
 * rather than resetting a shared one.
 */
export const accessTokenStore: AccessTokenStore = createMemoryAccessTokenStore();
