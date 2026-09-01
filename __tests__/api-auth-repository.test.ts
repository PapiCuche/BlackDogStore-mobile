import { ApiAuthRepository } from '@/auth/api-auth-repository';
import {
  AuthUnavailableError,
  RefreshNetworkError,
  RefreshRejectedError,
} from '@/auth/auth-errors';
import { createRefreshCoordinator } from '@/auth/refresh-coordinator';
import { createMemoryAccessTokenStore } from '@/auth/tokens/access-token-store';
import type { CredentialVault } from '@/auth/tokens/credential-vault';
import type { AuthCompanyWire } from '@/api/endpoints/auth-v1';
import type { DjangoAuthTransport, SessionSnapshot } from '@/auth/transport/django-auth-transport';
import type { Customer } from '@/domain/customers/types';

/**
 * M3 — credential ORDERING, which is where the real failures live.
 *
 * The pieces were built and tested in M1. What this file pins down is the
 * sequence in which they are touched, and what happens when a step fails.
 */

const USER: Customer = {
  id: 42,
  username: 'carlos',
  email: 'carlos@example.com',
  firstName: 'Carlos',
  lastName: 'Mau',
  role: 'customer',
  isEmailVerified: true,
};

function tokens(access = 'a1', refresh = 'r1') {
  return { access: { value: access, expiresAtMs: Date.now() + 1_800_000 }, refreshToken: refresh };
}

/** An in-memory vault that records the ORDER of every operation. */
function makeVault(log: string[]): CredentialVault & { stored: string | null } {
  const vault = {
    stored: null as string | null,
    async getRefreshToken() {
      log.push('vault.get');
      return vault.stored;
    },
    async setRefreshToken(token: string) {
      log.push('vault.set');
      vault.stored = token;
    },
    async clearRefreshToken() {
      log.push('vault.clear');
      vault.stored = null;
    },
  };
  return vault;
}

function makeTransport(
  log: string[],
  overrides: Partial<DjangoAuthTransport> = {},
): DjangoAuthTransport {
  return {
    async signIn() {
      log.push('transport.signIn');
      return { tokens: tokens(), user: USER };
    },
    async refresh() {
      log.push('transport.refresh');
      return tokens('a2', 'r2');
    },
    async signOut() {
      log.push('transport.signOut');
    },
    async getCurrentSession(): Promise<SessionSnapshot> {
      log.push('transport.getCurrentSession');
      return { user: USER, companies: [], accessContexts: [], platform: { isMaster: false } };
    },
    ...overrides,
  };
}

function build(
  log: string[],
  options: {
    transport?: Partial<DjangoAuthTransport>;
    tenantSlug?: string | null;
    storedRefresh?: string | null;
  } = {},
) {
  const vault = makeVault(log);
  vault.stored = options.storedRefresh ?? null;
  const transport = makeTransport(log, options.transport);
  const accessTokens = createMemoryAccessTokenStore();
  const coordinator = createRefreshCoordinator({ transport, vault, accessTokens });
  const repository = new ApiAuthRepository({
    transport,
    vault,
    accessTokens,
    coordinator,
    tenantSlug: options.tenantSlug ?? null,
  });
  return { repository, vault, accessTokens, coordinator };
}

const COMPANIES = (rows: AuthCompanyWire[]) => ({
  async getCurrentSession(): Promise<SessionSnapshot> {
    return { user: USER, companies: rows, accessContexts: [], platform: { isMaster: false } };
  },
});

describe('signIn — credential ordering', () => {
  it('persists the refresh token BEFORE installing the access token', async () => {
    // The server rotates and blacklists, so the old refresh is dead on arrival.
    // A crash after installing access but before persisting refresh would leave
    // the app authenticated for 30 minutes and then permanently signed out.
    const log: string[] = [];
    const { repository } = build(log);

    await repository.signIn({ identifier: 'carlos@example.com', password: 'p' });

    expect(log.indexOf('vault.set')).toBeLessThan(log.indexOf('transport.getCurrentSession'));
    expect(log[0]).toBe('transport.signIn');
    expect(log[1]).toBe('vault.set');
  });

  it('stores the refresh token in the vault', async () => {
    const log: string[] = [];
    const { repository, vault } = build(log);

    await repository.signIn({ identifier: 'x@y.z', password: 'p' });

    expect(vault.stored).toBe('r1');
  });

  it('installs the access token in MEMORY only', async () => {
    const log: string[] = [];
    const { repository, accessTokens } = build(log);

    await repository.signIn({ identifier: 'x@y.z', password: 'p' });

    expect(accessTokens.get()).toBe('a1');
    // Never written anywhere durable.
    expect(log).not.toContain('vault.setAccess');
  });

  it('keeps NO credential on the session it returns', async () => {
    const log: string[] = [];
    const { repository } = build(log);

    const session = await repository.signIn({ identifier: 'x@y.z', password: 'secreta' });
    const serialized = JSON.stringify(session);

    expect(serialized).not.toContain('secreta');
    expect(serialized).not.toContain('a1');
    expect(serialized).not.toContain('r1');
  });

  it('marks the session as a real backend session', async () => {
    const log: string[] = [];
    const { repository } = build(log);

    const session = await repository.signIn({ identifier: 'x@y.z', password: 'p' });

    expect(session.mode).toBe('backend');
  });

  it('does not swallow a failed sign-in', async () => {
    const log: string[] = [];
    const { repository, vault } = build(log, {
      transport: {
        async signIn() {
          throw new Error('401');
        },
      },
    });

    await expect(repository.signIn({ identifier: 'x@y.z', password: 'p' })).rejects.toThrow();
    expect(vault.stored).toBeNull();
  });
});

describe('tenant context — selector, never authority', () => {
  const BLACKDOG: AuthCompanyWire = {
    slug: 'blackdog', name: 'Black Dog Store', relation: 'customer',
  };
  const OTRA: AuthCompanyWire = { slug: 'otra', name: 'Otra Empresa', relation: 'member' };

  it('activates the build company when the SERVER listed it', async () => {
    const log: string[] = [];
    const { repository } = build(log, {
      tenantSlug: 'blackdog',
      transport: COMPANIES([BLACKDOG]),
    });

    const session = await repository.signIn({ identifier: 'x@y.z', password: 'p' });

    expect(session.tenant?.activeCompany).toEqual({ slug: 'blackdog', name: 'Black Dog Store' });
  });

  it('leaves the active company NULL when the server did not list it', async () => {
    // The account is real; it just has nothing to do with this storefront.
    // Inventing a membership from a build constant is the exact mistake the
    // whole tenant design exists to prevent.
    const log: string[] = [];
    const { repository } = build(log, { tenantSlug: 'blackdog', transport: COMPANIES([OTRA]) });

    const session = await repository.signIn({ identifier: 'x@y.z', password: 'p' });

    expect(session.tenant?.activeCompany).toBeNull();
    expect(session.tenant?.availableCompanies).toHaveLength(1);
  });

  it('never falls back to the FIRST company in the list', async () => {
    const log: string[] = [];
    const { repository } = build(log, {
      tenantSlug: 'blackdog',
      transport: COMPANIES([OTRA, { slug: 'tercera', name: 'Tercera', relation: 'member' }]),
    });

    const session = await repository.signIn({ identifier: 'x@y.z', password: 'p' });

    expect(session.tenant?.activeCompany).toBeNull();
  });

  it('has no active company when the build has no tenant configured', async () => {
    const log: string[] = [];
    const { repository } = build(log, { tenantSlug: null, transport: COMPANIES([BLACKDOG]) });

    const session = await repository.signIn({ identifier: 'x@y.z', password: 'p' });

    expect(session.tenant?.activeCompany).toBeNull();
  });

  it('matches the slug case-insensitively', async () => {
    const log: string[] = [];
    const { repository } = build(log, {
      tenantSlug: 'BLACKDOG',
      transport: COMPANIES([BLACKDOG]),
    });

    const session = await repository.signIn({ identifier: 'x@y.z', password: 'p' });

    expect(session.tenant?.activeCompany?.slug).toBe('blackdog');
  });

  it('reports an empty context when the user has no relations at all', async () => {
    const log: string[] = [];
    const { repository } = build(log, { tenantSlug: 'blackdog', transport: COMPANIES([]) });

    const session = await repository.signIn({ identifier: 'x@y.z', password: 'p' });

    expect(session.tenant).toEqual({ activeCompany: null, availableCompanies: [] });
  });

  it('does not expose the relation kind on the session', async () => {
    // `member` vs `customer` is a server-side fact the app has no rule for yet.
    // Surfacing it would invite a screen to branch on it as if it were a permission.
    const log: string[] = [];
    const { repository } = build(log, {
      tenantSlug: 'blackdog',
      transport: COMPANIES([BLACKDOG]),
    });

    const session = await repository.signIn({ identifier: 'x@y.z', password: 'p' });

    expect(session.tenant?.availableCompanies[0]).toEqual({
      slug: 'blackdog',
      name: 'Black Dog Store',
    });
  });
});

describe('restoreSession — cold start', () => {
  it('returns null when nothing is stored', async () => {
    const log: string[] = [];
    const { repository } = build(log, { storedRefresh: null });

    await expect(repository.restoreSession()).resolves.toBeNull();
  });

  it('refreshes and then asks the server WHO that is', async () => {
    const log: string[] = [];
    const { repository } = build(log, { storedRefresh: 'r0' });

    const session = await repository.restoreSession();

    expect(session?.user.id).toBe(42);
    expect(log).toContain('transport.refresh');
    expect(log).toContain('transport.getCurrentSession');
  });

  it('does NOT persist the profile — the server is the only source of truth', async () => {
    const log: string[] = [];
    const { repository } = build(log, { storedRefresh: 'r0' });

    await repository.restoreSession();
    await repository.restoreSession();

    // Asked again on the second cold start rather than reading a cache.
    expect(log.filter((entry) => entry === 'transport.getCurrentSession')).toHaveLength(2);
  });

  it('persists the ROTATED refresh token', async () => {
    const log: string[] = [];
    const { repository, vault } = build(log, { storedRefresh: 'r0' });

    await repository.restoreSession();

    expect(vault.stored).toBe('r2');
  });

  it('THROWS on a network failure instead of reporting "signed out"', async () => {
    // The lift test. Returning null here would sign out a user whose refresh
    // token in the Keychain is still perfectly good.
    const log: string[] = [];
    const { repository, vault } = build(log, {
      storedRefresh: 'r0',
      transport: {
        async refresh() {
          throw new RefreshNetworkError();
        },
      },
    });

    await expect(repository.restoreSession()).rejects.toBeInstanceOf(RefreshNetworkError);
    // And the credentials survive.
    expect(vault.stored).toBe('r0');
  });

  it('returns null and keeps nothing when the server REJECTS the token', async () => {
    const log: string[] = [];
    const { repository, vault } = build(log, {
      storedRefresh: 'r0',
      transport: {
        async refresh() {
          throw new RefreshRejectedError('blacklisted');
        },
      },
    });

    await expect(repository.restoreSession()).resolves.toBeNull();
    expect(vault.stored).toBeNull();
  });
});

describe('signOut — local first', () => {
  it('clears local credentials BEFORE telling the server', async () => {
    const log: string[] = [];
    const { repository } = build(log, { storedRefresh: 'r0' });

    await repository.signOut();

    expect(log.indexOf('vault.clear')).toBeLessThan(log.indexOf('transport.signOut'));
  });

  it('clears the access token from memory', async () => {
    const log: string[] = [];
    const { repository, accessTokens } = build(log);
    await repository.signIn({ identifier: 'x@y.z', password: 'p' });

    await repository.signOut();

    expect(accessTokens.get()).toBeNull();
  });

  it('signs out anyway when the server cannot be reached', async () => {
    const log: string[] = [];
    const { repository, vault } = build(log, {
      storedRefresh: 'r0',
      transport: {
        async signOut() {
          throw new Error('sin conexión');
        },
      },
    });

    await expect(repository.signOut()).resolves.toBeUndefined();
    expect(vault.stored).toBeNull();
  });

  it('invalidates the coordinator so a slow refresh cannot resurrect the session', async () => {
    const log: string[] = [];
    const { repository, coordinator } = build(log, { storedRefresh: 'r0' });
    const before = coordinator.epoch;

    await repository.signOut();

    expect(coordinator.epoch).toBeGreaterThan(before);
  });

  it('does not fail when there was nothing stored', async () => {
    const log: string[] = [];
    const { repository } = build(log, { storedRefresh: null });

    await expect(repository.signOut()).resolves.toBeUndefined();
  });
});

describe('register — BR-001B', () => {
  it('refuses rather than calling the legacy web endpoint', async () => {
    // The native contract has no registration endpoint, and the legacy one
    // speaks cookies and CSRF. Calling it would be pretending to integrate.
    const log: string[] = [];
    const { repository } = build(log);

    await expect(repository.register()).rejects.toBeInstanceOf(AuthUnavailableError);
    expect(log).toHaveLength(0);
  });
});
