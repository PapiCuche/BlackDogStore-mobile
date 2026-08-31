import { CredentialStorageError, RefreshNetworkError, RefreshRejectedError } from './auth-errors';
import type { AccessTokenStore } from './tokens/access-token-store';
import type { CredentialVault } from './tokens/credential-vault';
import type { AuthTransport } from './transport/auth-transport';

/**
 * What a refresh attempt concluded.
 *
 * A discriminated union rather than a boolean because the four outcomes demand
 * four different reactions, and collapsing any two of them causes a real bug:
 * treating `network` as `rejected` signs a user out for walking into a lift,
 * and treating `rejected` as `network` leaves a zombie session hammering a
 * blacklisted token.
 */
export type RefreshOutcome =
  /** New access token installed and any rotated refresh persisted. */
  | { status: 'refreshed'; accessToken: string }
  /** No refresh token stored. The user was never signed in, or was signed out. */
  | { status: 'no-credentials' }
  /** Server refused the token. TERMINAL — credentials cleared. */
  | { status: 'rejected'; error: RefreshRejectedError | CredentialStorageError }
  /** Could not reach the server. Credentials KEPT; try again later. */
  | { status: 'network'; error: RefreshNetworkError }
  /** A sign-out (or another epoch bump) happened while this was in flight. */
  | { status: 'superseded' };

export type RefreshCoordinator = {
  /**
   * Refresh the access token.
   *
   * SINGLE-FLIGHT: concurrent callers share one in-flight request and one
   * result. Ten requests hitting 401 at once must produce ONE refresh — ten
   * would rotate the refresh token ten times against a backend with
   * `ROTATE_REFRESH_TOKENS` + `BLACKLIST_AFTER_ROTATION`, so nine of them would
   * present an already-blacklisted token and the session would die.
   */
  refresh(): Promise<RefreshOutcome>;
  /**
   * Invalidate everything in flight.
   *
   * Called on sign-out. Any refresh that resolves afterwards reports
   * `superseded` and installs nothing — the fix for "user logs out, a slow
   * refresh lands, session comes back to life".
   */
  invalidate(): void;
  /** Current epoch. Diagnostics and tests. */
  readonly epoch: number;
};

export function createRefreshCoordinator(deps: {
  transport: AuthTransport;
  vault: CredentialVault;
  accessTokens: AccessTokenStore;
}): RefreshCoordinator {
  const { transport, vault, accessTokens } = deps;

  let inFlight: Promise<RefreshOutcome> | null = null;
  let epoch = 0;

  async function performRefresh(startedAtEpoch: number): Promise<RefreshOutcome> {
    let refreshToken: string | null;
    try {
      refreshToken = await vault.getRefreshToken();
    } catch (error) {
      // Cannot read the Keychain. Not a network problem and not something the
      // user can retry into success, so treat it as terminal rather than
      // looping.
      return { status: 'rejected', error: error as CredentialStorageError };
    }

    if (!refreshToken) return { status: 'no-credentials' };

    let pair;
    try {
      pair = await transport.refresh(refreshToken);
    } catch (error) {
      if (error instanceof RefreshNetworkError) {
        // Credentials are deliberately NOT cleared: the token is probably fine,
        // we just could not ask.
        return { status: 'network', error };
      }
      const rejection =
        error instanceof RefreshRejectedError ? error : new RefreshRejectedError('unknown');
      await clearCredentials();
      return { status: 'rejected', error: rejection };
    }

    // Sign-out won the race. The new credentials are dropped rather than
    // resurrecting a session the user ended.
    //
    // Credentials are also CLEARED here, not merely ignored: the server has
    // already rotated, so whatever is still in the vault is the token we just
    // sent — now blacklisted. Leaving it there would make the next cold start
    // present a dead token and look like a mysterious forced logout.
    if (startedAtEpoch !== epoch) {
      await clearCredentials();
      return { status: 'superseded' };
    }

    // ROTATION ORDER MATTERS. Persist the new refresh token FIRST.
    //
    // The server has already blacklisted the one we sent. If persistence fails
    // after we had installed the access token, the app would look authenticated
    // while holding a refresh token the server rejects — it would work until
    // the access token expired, then fail in a way nobody could reproduce.
    // Persisting first means a storage failure is caught while we can still
    // honestly sign the user out.
    try {
      await vault.setRefreshToken(pair.refreshToken);
    } catch (error) {
      await clearCredentials();
      return { status: 'rejected', error: error as CredentialStorageError };
    }

    // Re-check: persistence is async, so sign-out may have landed during it.
    if (startedAtEpoch !== epoch) {
      await clearCredentials();
      return { status: 'superseded' };
    }

    accessTokens.set(pair.access);
    return { status: 'refreshed', accessToken: pair.access.value };
  }

  async function clearCredentials(): Promise<void> {
    accessTokens.clear();
    // A failure to delete must not mask the failure that got us here.
    await vault.clearRefreshToken().catch(() => undefined);
  }

  return {
    refresh() {
      // The single-flight latch. Subsequent callers get the SAME promise, so
      // there is exactly one transport call no matter how many arrive.
      if (inFlight) return inFlight;

      const startedAtEpoch = epoch;
      inFlight = performRefresh(startedAtEpoch).finally(() => {
        inFlight = null;
      });
      return inFlight;
    },

    invalidate() {
      epoch += 1;
      // The in-flight promise is intentionally NOT cancelled: it may already be
      // mid-rotation server-side. It is neutralised by the epoch check instead,
      // which is the only part that matters — nothing it produces gets used.
      accessTokens.clear();
    },

    get epoch() {
      return epoch;
    },
  };
}
