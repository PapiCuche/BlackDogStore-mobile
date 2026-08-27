import { CredentialStorageError, RefreshNetworkError } from '@/auth/auth-errors';
import { createRefreshCoordinator } from '@/auth/refresh-coordinator';
import { createMemoryAccessTokenStore } from '@/auth/tokens/access-token-store';
import type { CredentialVault } from '@/auth/tokens/credential-vault';
import { FakeAuthTransport } from '@/auth/transport/fake-auth-transport';

/**
 * M1 — the token lifecycle, exercised without a backend.
 *
 * `origin/master` sets `ROTATE_REFRESH_TOKENS = True` and
 * `BLACKLIST_AFTER_ROTATION = True`, so every one of these behaviours is load
 * bearing: a second concurrent refresh presents a token the server has already
 * blacklisted, and the session dies.
 */

/**
 * Let pending microtasks settle.
 *
 * `refresh()` reads the vault before it ever calls the transport, so the
 * transport counter is still 0 on the turn the callers are created. Without
 * this, `releaseRefresh()` would also fire before anything was waiting.
 */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

/** An in-memory vault, so the tests are about the coordinator, not the Keychain. */
function makeVault(initial: string | null = 'refresh-0') {
  let stored = initial;
  const vault: CredentialVault & { readonly stored: string | null } = {
    getRefreshToken: jest.fn(async () => stored),
    setRefreshToken: jest.fn(async (token: string) => {
      stored = token;
    }),
    clearRefreshToken: jest.fn(async () => {
      stored = null;
    }),
    get stored() {
      return stored;
    },
  };
  return vault;
}

function makeCoordinator(options: { transport?: FakeAuthTransport; refresh?: string | null } = {}) {
  const transport = options.transport ?? new FakeAuthTransport();
  const vault = makeVault(options.refresh === undefined ? 'refresh-0' : options.refresh);
  const accessTokens = createMemoryAccessTokenStore();
  const coordinator = createRefreshCoordinator({ transport, vault, accessTokens });
  return { coordinator, transport, vault, accessTokens };
}

describe('single-flight refresh', () => {
  it('collapses ten concurrent callers into ONE refresh', async () => {
    const transport = new FakeAuthTransport({ manualRefresh: true });
    const { coordinator } = makeCoordinator({ transport });

    const callers = Array.from({ length: 10 }, () => coordinator.refresh());
    await flush();

    // All ten are now waiting; only one request should have been issued.
    expect(transport.refreshCallCount).toBe(1);

    transport.releaseRefresh();
    const outcomes = await Promise.all(callers);

    expect(transport.refreshCallCount).toBe(1);
    expect(outcomes).toHaveLength(10);
    for (const outcome of outcomes) {
      expect(outcome.status).toBe('refreshed');
    }
  });

  it('gives every caller the same new access token', async () => {
    const transport = new FakeAuthTransport({ manualRefresh: true });
    const { coordinator } = makeCoordinator({ transport });

    const callers = Array.from({ length: 5 }, () => coordinator.refresh());
    await flush();
    transport.releaseRefresh();
    const outcomes = await Promise.all(callers);

    const tokens = new Set(
      outcomes.map((o) => (o.status === 'refreshed' ? o.accessToken : 'x')),
    );
    expect(tokens.size).toBe(1);
  });

  it('allows a NEW refresh once the previous one settled', async () => {
    const { coordinator, transport } = makeCoordinator();

    await coordinator.refresh();
    await coordinator.refresh();

    // The latch must release, or the app could never refresh twice.
    expect(transport.refreshCallCount).toBe(2);
  });
});

describe('refresh rotation', () => {
  it('persists the NEW refresh token and stops using the old one', async () => {
    const { coordinator, vault, transport } = makeCoordinator();

    await coordinator.refresh();

    expect(transport.presentedRefreshTokens).toEqual(['refresh-0']);
    expect(vault.stored).toBe('refresh-1');
    expect(vault.stored).not.toBe('refresh-0');
  });

  it('presents the rotated token on the next refresh, never the old one', async () => {
    const { coordinator, transport } = makeCoordinator();

    await coordinator.refresh();
    await coordinator.refresh();

    // Re-presenting a rotated token would hit the blacklist and kill the session.
    expect(transport.presentedRefreshTokens).toEqual(['refresh-0', 'refresh-1']);
  });

  it('installs the new access token in memory', async () => {
    const { coordinator, accessTokens } = makeCoordinator();

    const outcome = await coordinator.refresh();

    expect(outcome.status).toBe('refreshed');
    expect(accessTokens.get()).toBe('access-1');
  });

  it('signs the user out when the rotated token cannot be persisted', async () => {
    // The dangerous case: the server has ALREADY blacklisted the old token, so
    // a client that cannot store the new one holds nothing usable. Pretending
    // otherwise would "work" until the access token expired, then fail in a way
    // nobody could reproduce.
    const { coordinator, vault, accessTokens } = makeCoordinator();
    (vault.setRefreshToken as jest.Mock).mockRejectedValueOnce(
      new CredentialStorageError('write'),
    );

    const outcome = await coordinator.refresh();

    expect(outcome.status).toBe('rejected');
    expect(accessTokens.get()).toBeNull();
    expect(vault.clearRefreshToken).toHaveBeenCalled();
  });
});

describe('refresh failure modes', () => {
  it('reports no-credentials when nothing is stored', async () => {
    const { coordinator, transport } = makeCoordinator({ refresh: null });

    const outcome = await coordinator.refresh();

    expect(outcome.status).toBe('no-credentials');
    expect(transport.refreshCallCount).toBe(0);
  });

  it('CLEARS credentials when the server rejects the token', async () => {
    const transport = new FakeAuthTransport({ refreshBehaviour: 'reject' });
    const { coordinator, vault, accessTokens } = makeCoordinator({ transport });

    const outcome = await coordinator.refresh();

    expect(outcome.status).toBe('rejected');
    // No zombie session: a blacklisted token must not be retried forever.
    expect(vault.stored).toBeNull();
    expect(accessTokens.get()).toBeNull();
  });

  it('KEEPS credentials when the failure is the network', async () => {
    const transport = new FakeAuthTransport({ refreshBehaviour: 'network-error' });
    const { coordinator, vault } = makeCoordinator({ transport });

    const outcome = await coordinator.refresh();

    expect(outcome.status).toBe('network');
    // Signing someone out for walking into a lift is not acceptable.
    expect(vault.stored).toBe('refresh-0');
  });

  it('distinguishes a network failure from a rejection', async () => {
    const network = new FakeAuthTransport({ refreshBehaviour: 'network-error' });
    const rejected = new FakeAuthTransport({ refreshBehaviour: 'reject' });

    const a = await makeCoordinator({ transport: network }).coordinator.refresh();
    const b = await makeCoordinator({ transport: rejected }).coordinator.refresh();

    expect(a.status).toBe('network');
    expect(b.status).toBe('rejected');
    expect(a.status === 'network' && a.error).toBeInstanceOf(RefreshNetworkError);
  });

  it('treats an unreadable Keychain as terminal rather than looping', async () => {
    const { coordinator, vault } = makeCoordinator();
    (vault.getRefreshToken as jest.Mock).mockRejectedValueOnce(
      new CredentialStorageError('read'),
    );

    const outcome = await coordinator.refresh();

    expect(outcome.status).toBe('rejected');
  });
});

describe('race: logout during refresh', () => {
  it('does NOT install credentials from a refresh that finished after logout', async () => {
    const transport = new FakeAuthTransport({ manualRefresh: true });
    const { coordinator, accessTokens } = makeCoordinator({ transport });

    const pending = coordinator.refresh();
    await flush();

    // The user signs out while the refresh is in flight.
    coordinator.invalidate();
    transport.releaseRefresh();

    const outcome = await pending;

    expect(outcome.status).toBe('superseded');
    // The session must NOT come back to life.
    expect(accessTokens.get()).toBeNull();
  });

  it('clears any credential the superseded refresh managed to persist', async () => {
    const transport = new FakeAuthTransport({ manualRefresh: true });
    const { coordinator, vault } = makeCoordinator({ transport });

    const pending = coordinator.refresh();
    await flush();
    coordinator.invalidate();
    transport.releaseRefresh();
    await pending;

    // A rotated token left in the Keychain after sign-out would let the next
    // launch silently resume a session the user ended.
    expect(vault.stored).toBeNull();
  });

  it('clears the access token immediately on invalidate', async () => {
    const { coordinator, accessTokens } = makeCoordinator();
    await coordinator.refresh();
    expect(accessTokens.get()).not.toBeNull();

    coordinator.invalidate();

    expect(accessTokens.get()).toBeNull();
  });

  it('bumps the epoch so later refreshes are a new generation', async () => {
    const { coordinator } = makeCoordinator();
    const before = coordinator.epoch;

    coordinator.invalidate();

    expect(coordinator.epoch).toBe(before + 1);
  });

  it('lets a refresh started AFTER logout succeed normally', async () => {
    // The guard must not permanently disable refreshing.
    const { coordinator, accessTokens } = makeCoordinator();
    coordinator.invalidate();

    const outcome = await coordinator.refresh();

    expect(outcome.status).toBe('refreshed');
    expect(accessTokens.get()).not.toBeNull();
  });
});
