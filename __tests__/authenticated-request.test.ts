import { assertBearerAllowed, BearerScopeViolationError } from '@/api/api-scope';
import { authenticatedRequest } from '@/api/authenticated-request';
import { ApiError } from '@/api/errors';
import { AuthUnavailableError } from '@/auth/auth-errors';
import type { AuthRuntimePolicy } from '@/auth/auth-policy';
import { createRefreshCoordinator } from '@/auth/refresh-coordinator';
import { createMemoryAccessTokenStore } from '@/auth/tokens/access-token-store';
import type { CredentialVault } from '@/auth/tokens/credential-vault';
import { FakeAuthTransport } from '@/auth/transport/fake-auth-transport';

/**
 * M1 — the authenticated request pipeline.
 *
 * Exercised end to end with a fake sender and a fake transport, because there
 * is no `/api/v1/` to call. What is being proven is the retry ARITHMETIC —
 * exactly one refresh, exactly one retry, never a loop — and that a Bearer
 * token cannot reach an endpoint that never agreed to receive one.
 */

const BACKEND_READY: AuthRuntimePolicy = {
  mode: 'backend',
  decision: 'backend-contract-ready',
  reason: 'test',
};

function makeVault(initial: string | null = 'refresh-0'): CredentialVault {
  let stored = initial;
  return {
    getRefreshToken: async () => stored,
    setRefreshToken: async (token: string) => {
      stored = token;
    },
    clearRefreshToken: async () => {
      stored = null;
    },
  };
}

function harness(options: { refresh?: string | null } = {}) {
  const transport = new FakeAuthTransport();
  const vault = makeVault(options.refresh === undefined ? 'refresh-0' : options.refresh);
  const accessTokens = createMemoryAccessTokenStore();
  const refreshCoordinator = createRefreshCoordinator({ transport, vault, accessTokens });
  return { transport, vault, accessTokens, refreshCoordinator };
}

/** A sender that plays a scripted sequence of outcomes. */
function scriptedSender(outcomes: ('ok' | number | Error)[]) {
  const calls: { path: string; headers: Record<string, string> }[] = [];
  let index = 0;

  const send = jest.fn(async (path: string, options: { headers?: Record<string, string> } = {}) => {
    calls.push({ path, headers: options.headers ?? {} });
    const outcome = outcomes[Math.min(index, outcomes.length - 1)];
    index += 1;
    if (outcome === 'ok') return { ok: true } as unknown;
    if (outcome instanceof Error) throw outcome;
    throw new ApiError(outcome === 401 || outcome === 403 ? 'unauthorized' : 'server', 'no', {
      status: outcome,
    });
  });

  return { send: send as never, calls, get callCount() { return send.mock.calls.length; } };
}

describe('bearer scope guard', () => {
  it('allows only the proposed /api/v1/ surface', () => {
    expect(() => assertBearerAllowed('/api/v1/orders/', 'authenticated-v1')).not.toThrow();
  });

  it.each(['/api/auth/me/', '/api/admin/users/', '/api/me/memberships/', '/api/products/'])(
    'refuses a Bearer token for the legacy path %p',
    (path) => {
      // The web surface authenticates by HttpOnly cookie plus CSRF. A Bearer
      // token there is a credential handed to a contract that never agreed to
      // receive it.
      expect(() => assertBearerAllowed(path, 'authenticated-v1')).toThrow(
        BearerScopeViolationError,
      );
    },
  );

  it('refuses when the caller declared a non-authenticated scope', () => {
    expect(() => assertBearerAllowed('/api/v1/orders/', 'public')).toThrow(
      BearerScopeViolationError,
    );
    expect(() => assertBearerAllowed('/api/v1/orders/', 'legacy-web')).toThrow(
      BearerScopeViolationError,
    );
  });

  it('names the path but never carries a token value', () => {
    const error = new BearerScopeViolationError('/api/products/', 'authenticated-v1');

    // The path is what makes the error actionable; the credential is what must
    // never appear. A token-shaped run of characters is the thing to exclude —
    // the word "Bearer" itself is just prose.
    expect(error.message).toContain('/api/products/');
    expect(error.message).not.toMatch(/[A-Za-z0-9_-]{20,}/);
  });
});

describe('authenticatedRequest — inert without a contract', () => {
  it('refuses to run at all while auth is unavailable', async () => {
    const { refreshCoordinator } = harness();
    const sender = scriptedSender(['ok']);

    const error = await authenticatedRequest('/api/v1/orders/', { scope: 'authenticated-v1' }, {
      refreshCoordinator,
      policy: { mode: 'unavailable', decision: 'unavailable-no-contract', reason: 'test' },
      send: sender.send,
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AuthUnavailableError);
    // Nothing may reach the network while BR-001 is unresolved.
    expect(sender.callCount).toBe(0);
  });
});

describe('authenticatedRequest — happy path', () => {
  it('refreshes first when there is no access token, then sends with Bearer', async () => {
    const { refreshCoordinator, transport, accessTokens } = harness();
    const sender = scriptedSender(['ok']);

    await authenticatedRequest('/api/v1/orders/', { scope: 'authenticated-v1' }, {
      refreshCoordinator,
      accessTokens,
      policy: BACKEND_READY,
      send: sender.send,
    });

    expect(transport.refreshCallCount).toBe(1);
    expect(sender.calls[0]!.headers.Authorization).toBe('Bearer access-1');
  });

  it('reuses the in-memory access token without refreshing again', async () => {
    const { refreshCoordinator, transport, accessTokens } = harness();
    accessTokens.set({ value: 'access-existing', expiresAtMs: Date.now() + 600_000 });
    const sender = scriptedSender(['ok']);

    await authenticatedRequest('/api/v1/orders/', { scope: 'authenticated-v1' }, {
      refreshCoordinator,
      accessTokens,
      policy: BACKEND_READY,
      send: sender.send,
    });

    expect(transport.refreshCallCount).toBe(0);
    expect(sender.calls[0]!.headers.Authorization).toBe('Bearer access-existing');
  });
});

describe('authenticatedRequest — retry arithmetic', () => {
  it('401 → refresh once → retry once', async () => {
    const { refreshCoordinator, transport, accessTokens } = harness();
    accessTokens.set({ value: 'stale', expiresAtMs: Date.now() + 600_000 });
    const sender = scriptedSender([401, 'ok']);

    await authenticatedRequest('/api/v1/orders/', { scope: 'authenticated-v1' }, {
      refreshCoordinator,
      accessTokens,
      policy: BACKEND_READY,
      send: sender.send,
    });

    expect(sender.callCount).toBe(2);
    expect(transport.refreshCallCount).toBe(1);
    expect(sender.calls[1]!.headers.Authorization).toBe('Bearer access-1');
  });

  it('a SECOND 401 is final — no loop', async () => {
    const { refreshCoordinator, transport, accessTokens } = harness();
    accessTokens.set({ value: 'stale', expiresAtMs: Date.now() + 600_000 });
    const sender = scriptedSender([401, 401]);

    const error = await authenticatedRequest('/api/v1/orders/', { scope: 'authenticated-v1' }, {
      refreshCoordinator,
      accessTokens,
      policy: BACKEND_READY,
      send: sender.send,
    }).catch((e: unknown) => e);

    // Exactly two sends and one refresh. The token is fresh, so a further
    // rejection is about authorisation, not staleness.
    expect(sender.callCount).toBe(2);
    expect(transport.refreshCallCount).toBe(1);
    expect((error as ApiError).status).toBe(401);
  });

  it('403 NEVER triggers a refresh', async () => {
    const { refreshCoordinator, transport, accessTokens } = harness();
    accessTokens.set({ value: 'valid', expiresAtMs: Date.now() + 600_000 });
    const sender = scriptedSender([403]);

    const error = await authenticatedRequest('/api/v1/orders/', { scope: 'authenticated-v1' }, {
      refreshCoordinator,
      accessTokens,
      policy: BACKEND_READY,
      send: sender.send,
    }).catch((e: unknown) => e);

    // Authenticated but not permitted. A refresh cannot grant permission, and
    // rotating on every denial would burn the refresh chain for nothing.
    expect(transport.refreshCallCount).toBe(0);
    expect(sender.callCount).toBe(1);
    expect((error as ApiError).status).toBe(403);
  });

  it('a network failure never triggers a refresh', async () => {
    const { refreshCoordinator, transport, accessTokens } = harness();
    accessTokens.set({ value: 'valid', expiresAtMs: Date.now() + 600_000 });
    const sender = scriptedSender([new ApiError('offline', 'sin red')]);

    await authenticatedRequest('/api/v1/orders/', { scope: 'authenticated-v1' }, {
      refreshCoordinator,
      accessTokens,
      policy: BACKEND_READY,
      send: sender.send,
    }).catch(() => undefined);

    expect(transport.refreshCallCount).toBe(0);
  });

  it('a caller abort never triggers a refresh', async () => {
    const { refreshCoordinator, transport, accessTokens } = harness();
    accessTokens.set({ value: 'valid', expiresAtMs: Date.now() + 600_000 });
    const controller = new AbortController();
    controller.abort();
    const sender = scriptedSender([401]);

    await authenticatedRequest(
      '/api/v1/orders/',
      { scope: 'authenticated-v1', signal: controller.signal },
      { refreshCoordinator, accessTokens, policy: BACKEND_READY, send: sender.send },
    ).catch(() => undefined);

    // A screen that navigated away must not rotate the session on its way out.
    expect(transport.refreshCallCount).toBe(0);
  });

  it('surfaces the rejection when the refresh itself is refused', async () => {
    const transport = new FakeAuthTransport({ refreshBehaviour: 'reject' });
    const vault = makeVault();
    const accessTokens = createMemoryAccessTokenStore();
    const refreshCoordinator = createRefreshCoordinator({ transport, vault, accessTokens });
    const sender = scriptedSender(['ok']);

    const error = await authenticatedRequest('/api/v1/orders/', { scope: 'authenticated-v1' }, {
      refreshCoordinator,
      accessTokens,
      policy: BACKEND_READY,
      send: sender.send,
    }).catch((e: unknown) => e);

    expect((error as Error).name).toBe('RefreshRejectedError');
    expect(sender.callCount).toBe(0);
  });

  it('collapses concurrent 401s into ONE refresh', async () => {
    const { refreshCoordinator, transport, accessTokens } = harness();
    accessTokens.set({ value: 'stale', expiresAtMs: Date.now() + 600_000 });

    let firstRound = 10;
    const send = jest.fn(async (_path: string, options: { headers?: Record<string, string> } = {}) => {
      if (firstRound > 0 && options.headers?.Authorization === 'Bearer stale') {
        firstRound -= 1;
        throw new ApiError('unauthorized', 'no', { status: 401 });
      }
      return { ok: true } as unknown;
    });

    await Promise.all(
      Array.from({ length: 10 }, () =>
        authenticatedRequest('/api/v1/orders/', { scope: 'authenticated-v1' }, {
          refreshCoordinator,
          accessTokens,
          policy: BACKEND_READY,
          send: send as never,
        }),
      ),
    );

    // Ten simultaneous 401s must not rotate the refresh token ten times: with
    // BLACKLIST_AFTER_ROTATION, nine of those would present a dead token.
    expect(transport.refreshCallCount).toBe(1);
  });
});
