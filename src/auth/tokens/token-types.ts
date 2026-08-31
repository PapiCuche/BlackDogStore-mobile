/**
 * Token types.
 *
 * ⚠️  TWO DIFFERENT THINGS LIVE HERE. Keeping them apart is the point.
 *
 * `TokenPair` and `AccessToken` are the MOBILE INTERNAL MODEL — camelCase,
 * milliseconds, whatever this app finds convenient.
 *
 * `ProposedAuthTokenWire` is a PROPOSED WIRE CONTRACT. It is Mobile's request
 * to the Backend team (BR-001) and it does NOT exist. Django's current auth
 * returns its tokens in HttpOnly cookies and nothing in the body, and while
 * `/api/v1/` exists on `origin/master` `b301637b`, it holds only the anonymous
 * storefront catalogue — no `/api/v1/auth/*` of any kind.
 *
 * Nothing here claims Django speaks camelCase. When the endpoint exists, a
 * mapper converts snake_case wire → this model, exactly like the catalogue
 * mappers already do.
 */

// ─── Mobile internal model ──────────────────────────────────────────────────

export type AccessToken = {
  value: string;
  /** Absolute expiry, epoch milliseconds. Absolute, not a duration, because a
   *  duration is only meaningful at the instant it was received. */
  expiresAtMs: number;
};

export type TokenPair = {
  access: AccessToken;
  /** Opaque to this app. Never inspected, never decoded, never logged. */
  refreshToken: string;
};

/**
 * Treat a token as expired slightly early.
 *
 * Without the skew, a token with 200 ms of life left passes the check, gets
 * attached to a request, and comes back 401 — turning a predictable refresh
 * into a retry. Thirty seconds also covers modest client/server clock drift.
 */
export const ACCESS_TOKEN_EXPIRY_SKEW_MS = 30_000;

export function isAccessTokenExpired(token: AccessToken, nowMs: number = Date.now()): boolean {
  return nowMs >= token.expiresAtMs - ACCESS_TOKEN_EXPIRY_SKEW_MS;
}

// ─── Proposed wire contract (BR-001) — DOES NOT EXIST YET ───────────────────

/**
 * What Mobile ASKS `/api/v1/auth/login/` and `/refresh/` to return.
 *
 * PROPUESTA. Not implemented anywhere, not called anywhere.
 * Field names here are the proposal's snake_case, as Django would render them.
 */
export type ProposedAuthTokenWire = {
  access: string;
  refresh: string;
  /** Seconds, matching how SimpleJWT expresses lifetimes. */
  expires_in: number;
};

/**
 * Wire → domain.
 *
 * Lives here so that the day the endpoint appears, the only thing to verify is
 * this function against the real payload. `expires_in` is resolved against the
 * receiving clock immediately, because a relative lifetime is worthless once it
 * has been sitting in a variable.
 */
export function toTokenPair(
  wire: ProposedAuthTokenWire,
  receivedAtMs: number = Date.now(),
): TokenPair {
  return {
    access: {
      value: wire.access,
      expiresAtMs: receivedAtMs + wire.expires_in * 1000,
    },
    refreshToken: wire.refresh,
  };
}
