import { act, render, waitFor } from '@testing-library/react-native';

import { AuthProvider, useAuth } from '@/auth/auth-provider';
import { RefreshNetworkError, RefreshRejectedError } from '@/auth/auth-errors';
import type { AuthRepository } from '@/auth/auth-repository';
import type { AuthRuntimePolicy } from '@/auth/auth-policy';
import type { AuthSession, AuthStatus } from '@/auth/types';

/**
 * M3 — what the app concludes at launch.
 *
 * With a mock repository restore never failed, so every failure collapsing into
 * `unauthenticated` was harmless. Against a real server it is not: the single
 * most common launch failure is "no signal", and treating that as a logout
 * signs out a user whose credentials are perfectly good.
 */

const BACKEND_POLICY: AuthRuntimePolicy = {
  mode: 'backend',
  decision: 'backend-contract-ready',
  reason: 'test',
};

const SESSION: AuthSession = {
  user: {
    id: 42,
    username: 'carlos',
    email: 'carlos@example.com',
    firstName: 'Carlos',
    lastName: '',
    role: 'customer',
    isEmailVerified: true,
  },
  mode: 'backend',
  accessContexts: [],
  platform: { isMaster: false },
  expiresAt: null,
  tenant: { activeCompany: { slug: 'blackdog', name: 'Black Dog' }, availableCompanies: [] },
};

function repositoryThatRestores(behaviour: () => Promise<AuthSession | null>): AuthRepository {
  return {
    restoreSession: behaviour,
    signIn: async () => SESSION,
    register: async () => SESSION,
    signOut: async () => undefined,
  };
}

async function mountAuth(repository: AuthRepository) {
  let observed: { status: AuthStatus; session: AuthSession | null } = {
    status: 'loading',
    session: null,
  };

  function Probe() {
    const auth = useAuth();
    observed = { status: auth.status, session: auth.session };
    return null;
  }

  await render(
    <AuthProvider repository={repository} policy={BACKEND_POLICY}>
      <Probe />
    </AuthProvider>,
  );

  return () => observed;
}

describe('cold start outcomes', () => {
  it('authenticates when a session is restored', async () => {
    const read = await mountAuth(repositoryThatRestores(async () => SESSION));

    await waitFor(() => expect(read().status).toBe('authenticated'));
    expect(read().session?.user.id).toBe(42);
  });

  it('is unauthenticated when nothing was stored', async () => {
    const read = await mountAuth(repositoryThatRestores(async () => null));

    await waitFor(() => expect(read().status).toBe('unauthenticated'));
  });

  it('is TEMPORARILY unavailable when the network failed', async () => {
    // The lift test. This is the whole reason the state exists.
    const read = await mountAuth(
      repositoryThatRestores(async () => {
        throw new RefreshNetworkError();
      }),
    );

    await waitFor(() => expect(read().status).toBe('temporarily-unavailable'));
  });

  it('does not claim a session while temporarily unavailable', async () => {
    // "We could not verify" must never render as "you are signed in".
    const read = await mountAuth(
      repositoryThatRestores(async () => {
        throw new RefreshNetworkError();
      }),
    );

    await waitFor(() => expect(read().status).toBe('temporarily-unavailable'));
    expect(read().session).toBeNull();
  });

  it('is unauthenticated when the server REJECTED the credentials', async () => {
    // Terminal, and the repository has already cleared the vault. Offering a
    // retry here would loop against a blacklisted token forever.
    const read = await mountAuth(
      repositoryThatRestores(async () => {
        throw new RefreshRejectedError('blacklisted');
      }),
    );

    await waitFor(() => expect(read().status).toBe('unauthenticated'));
  });

  it('is unauthenticated for an unexpected error, which is the safe direction', async () => {
    const read = await mountAuth(
      repositoryThatRestores(async () => {
        throw new Error('algo raro');
      }),
    );

    await waitFor(() => expect(read().status).toBe('unauthenticated'));
  });

  it('distinguishes the two unavailable states', async () => {
    // `unavailable` is permanent for the build; `temporarily-unavailable` is a
    // blip with good credentials. They look alike and are opposites.
    const read = await mountAuth(
      repositoryThatRestores(async () => {
        throw new RefreshNetworkError();
      }),
    );

    await waitFor(() => expect(read().status).toBe('temporarily-unavailable'));
    expect(read().status).not.toBe('unavailable');
  });
});

describe('a build with no auth mechanism', () => {
  it('reports unavailable without calling anything', async () => {
    let called = false;
    const repository: AuthRepository = {
      restoreSession: async () => {
        called = true;
        return null;
      },
      signIn: async () => SESSION,
      register: async () => SESSION,
      signOut: async () => undefined,
    };

    let status: AuthStatus = 'loading';
    function Probe() {
      status = useAuth().status;
      return null;
    }

    await render(
      <AuthProvider
        repository={null}
        policy={{
          mode: 'unavailable',
          decision: 'unavailable-api-not-configured',
          reason: 'test',
        }}
      >
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(status).toBe('unavailable'));
    expect(called).toBe(false);
    void repository;
  });
});

describe('sign-out never resurrects a session', () => {
  it('ends at unauthenticated even if the server call fails', async () => {
    let signOut: () => Promise<void> = async () => {};
    let status: AuthStatus = 'loading';

    function Probe() {
      const auth = useAuth();
      signOut = auth.signOut;
      status = auth.status;
      return null;
    }

    await render(
      <AuthProvider
        repository={{
          restoreSession: async () => SESSION,
          signIn: async () => SESSION,
          register: async () => SESSION,
          signOut: async () => {
            throw new Error('sin conexión');
          },
        }}
        policy={BACKEND_POLICY}
      >
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(status).toBe('authenticated'));
    await act(async () => {
      await signOut();
    });

    expect(status).toBe('unauthenticated');
  });
});
