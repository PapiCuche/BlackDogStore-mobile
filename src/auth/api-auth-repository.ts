import { companySlug } from '@/config/env';

import { AuthUnavailableError, RefreshNetworkError, RefreshRejectedError } from './auth-errors';
import type { AuthRepository } from './auth-repository';
import type { RefreshCoordinator } from './refresh-coordinator';
import type { AccessTokenStore } from './tokens/access-token-store';
import type { CredentialVault } from './tokens/credential-vault';
import type { DjangoAuthTransport, SessionSnapshot } from './transport/django-auth-transport';
import type { AuthCompanyRef, AuthSession, AuthTenantContext, SignInCredentials } from './types';

/**
 * The real authentication repository — `/api/v1/auth/`.
 *
 * Everything below is credential ORDERING. The individual pieces (vault, access
 * store, refresh coordinator) were built and tested in M1; what this class adds
 * is the sequence in which they are touched, which is where the interesting
 * failures live.
 *
 * THE ORDER THAT MATTERS: persist the refresh token BEFORE installing the
 * access token. The server has `ROTATE_REFRESH_TOKENS` with
 * `BLACKLIST_AFTER_ROTATION`, so by the time a response arrives the OLD refresh
 * token is already dead. A crash between "install access" and "persist refresh"
 * would leave the app authenticated for thirty minutes and then permanently
 * signed out, with no way to tell why. Persisting first turns that window into
 * "we have credentials we have not started using yet", which is recoverable.
 */

/** Account lifecycle is BR-001B: not implemented on the server, not faked here. */
const REGISTRATION_UNAVAILABLE =
  'El registro desde la app todavía no está disponible. Crea tu cuenta en la web.';

export class ApiAuthRepository implements AuthRepository {
  constructor(
    private readonly deps: {
      transport: DjangoAuthTransport;
      vault: CredentialVault;
      accessTokens: AccessTokenStore;
      coordinator: RefreshCoordinator;
      /** Injectable so tests do not need a rebuilt module graph. */
      tenantSlug?: string | null;
    },
  ) {}

  private get tenantSlug(): string | null {
    return this.deps.tenantSlug !== undefined ? this.deps.tenantSlug : companySlug;
  }

  async signIn(credentials: SignInCredentials): Promise<AuthSession> {
    const { transport, vault, accessTokens } = this.deps;

    const result = await transport.signIn(credentials);

    // Persist FIRST. See the class comment.
    await vault.setRefreshToken(result.tokens.refreshToken);
    accessTokens.set(result.tokens.access);

    // The login response already carries the identity, so no second round trip.
    const snapshot = await transport.getCurrentSession(result.tokens.access.value);
    return this.buildSession(snapshot);
  }

  /**
   * Cold start.
   *
   * Reads the stored refresh token, exchanges it, and asks the server who that
   * is. The profile is deliberately NOT persisted: a cached profile is a second
   * source of truth that goes stale silently, and the one thing worse than an
   * extra request at launch is showing the wrong person's name.
   *
   * `null` means "no session". A network failure is NOT null — it throws
   * `RefreshNetworkError`, so the provider can render
   * `temporarily-unavailable` and KEEP the credentials. Returning null there
   * would sign out anyone who launched the app on a train.
   */
  async restoreSession(): Promise<AuthSession | null> {
    const { transport, coordinator, accessTokens } = this.deps;

    const outcome = await coordinator.refresh();

    switch (outcome.status) {
      case 'no-credentials':
        return null;
      case 'rejected':
        // The coordinator has already cleared the vault. Terminal.
        return null;
      case 'superseded':
        // A sign-out landed while this was in flight. Whatever it would have
        // restored is no longer wanted.
        return null;
      case 'network':
        throw outcome.error;
      case 'refreshed':
        break;
    }

    const accessToken = accessTokens.get() ?? outcome.accessToken;
    return this.buildSession(await transport.getCurrentSession(accessToken));
  }

  /**
   * Sign out — LOCAL FIRST.
   *
   * The local credentials are gone before the server is told, and a failure to
   * tell it never restores the session. A user who taps "cerrar sesión" on a
   * train is signed out; the refresh token they were holding is discarded and
   * the server expires it on its own schedule.
   */
  async signOut(): Promise<void> {
    const { transport, vault, accessTokens, coordinator } = this.deps;

    // Read before clearing, so there is still something to revoke.
    const refreshToken = await vault.getRefreshToken().catch(() => null);

    coordinator.invalidate();
    accessTokens.clear();
    await vault.clearRefreshToken().catch(() => undefined);

    if (refreshToken) {
      await transport.signOut(refreshToken).catch(() => undefined);
    }
  }

  /**
   * BR-001B. The server has no native registration endpoint, and the legacy web
   * one speaks cookies and CSRF — calling it from here would be pretending to
   * integrate a flow that cannot work.
   */
  async register(): Promise<AuthSession> {
    throw new AuthUnavailableError(REGISTRATION_UNAVAILABLE);
  }

  /**
   * Turn a server snapshot into a session.
   *
   * THE TENANT RULE: `EXPO_PUBLIC_COMPANY_SLUG` selects, it does not authorise.
   * The active company is the build's slug IF the server listed it among the
   * user's verified relations — and null otherwise. No fallback to the pilot, no
   * "first company in the list", no inventing a membership from a build
   * constant. A null active company is a correct, safe answer.
   */
  private buildSession(snapshot: SessionSnapshot): AuthSession {
    const available: AuthCompanyRef[] = snapshot.companies.map((company) => ({
      slug: company.slug,
      name: company.name,
    }));

    const slug = this.tenantSlug?.trim().toLowerCase() ?? null;
    const activeCompany = slug
      ? available.find((company) => company.slug.toLowerCase() === slug) ?? null
      : null;

    const tenant: AuthTenantContext = { activeCompany, availableCompanies: available };

    return {
      user: snapshot.user,
      mode: 'backend',
      // The SESSION has no expiry of its own: it lives as long as the refresh
      // token can be exchanged. The access token's expiry is a transport detail
      // and stays with the token, in memory.
      expiresAt: null,
      tenant,
    };
  }
}

export { RefreshNetworkError, RefreshRejectedError };
