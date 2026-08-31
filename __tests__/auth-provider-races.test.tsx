import { act, renderHook, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { AuthProvider, useAuth } from '@/auth/auth-provider';
import type { AuthRepository } from '@/auth/auth-repository';
import type { AuthRuntimePolicy } from '@/auth/auth-policy';
import type { AuthSession } from '@/auth/types';

import { AuthScreenShell } from '@/features/auth/auth-screen-shell';

import { renderWithProviders } from './support/render';

/**
 * M1 — the races that only show up on a slow network.
 *
 * Each one ends with a session the user did not ask for, which is why they are
 * worth a test apiece rather than a comment.
 */

const MOCK_POLICY: AuthRuntimePolicy = {
  mode: 'mock',
  decision: 'mock-development',
  reason: 'test',
};
const UNAVAILABLE_POLICY: AuthRuntimePolicy = {
  mode: 'unavailable',
  decision: 'unavailable-production-mock-forbidden',
  reason: 'test',
};

function makeSession(name: string): AuthSession {
  return {
    user: {
      id: 1,
      username: name,
      email: `${name}@example.com`,
      firstName: name,
      lastName: '',
      role: 'customer',
      isEmailVerified: true,
    },
    mode: 'mock',
    expiresAt: null,
    tenant: null,
  };
}

/** A repository whose sign-in resolves only when the test says so. */
function deferredRepository() {
  const pending: { name: string; resolve: () => void }[] = [];
  const repository: AuthRepository = {
    restoreSession: async () => null,
    signIn: async (credentials) =>
      new Promise<AuthSession>((resolve) => {
        pending.push({
          name: credentials.identifier,
          resolve: () => resolve(makeSession(credentials.identifier)),
        });
      }),
    register: async (details) => makeSession(details.firstName),
    signOut: jest.fn(async () => undefined),
  };
  return { repository, pending };
}

function wrapper(repository: AuthRepository | null, policy = MOCK_POLICY) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <AuthProvider repository={repository} policy={policy}>
        {children}
      </AuthProvider>
    );
  };
}

describe('race: sign-out while sign-in is in flight', () => {
  it('does NOT authenticate when the sign-in lands after sign-out', async () => {
    const { repository, pending } = deferredRepository();
    const { result } = await renderHook(() => useAuth(), { wrapper: wrapper(repository) });

    await waitFor(() => expect(result.current.status).toBe('unauthenticated'));

    await act(async () => {
      void result.current.signIn({ identifier: 'carlos', password: 'x' });
    });
    await act(async () => {
      await result.current.signOut();
    });

    // The slow sign-in now completes.
    await act(async () => {
      pending[0]!.resolve();
      await Promise.resolve();
    });

    // It must NOT resurrect a session the user just ended.
    expect(result.current.status).toBe('unauthenticated');
    expect(result.current.session).toBeNull();
  });

  it('leaves no stale submitting state behind', async () => {
    const { repository, pending } = deferredRepository();
    const { result } = await renderHook(() => useAuth(), { wrapper: wrapper(repository) });
    await waitFor(() => expect(result.current.status).toBe('unauthenticated'));

    await act(async () => {
      void result.current.signIn({ identifier: 'carlos', password: 'x' });
    });
    await act(async () => {
      await result.current.signOut();
    });
    await act(async () => {
      pending[0]!.resolve();
      await Promise.resolve();
    });

    expect(result.current.isSubmitting).toBe(false);
  });
});

describe('race: two sign-ins out of order', () => {
  it('keeps the NEWER sign-in when the older one resolves last', async () => {
    const { repository, pending } = deferredRepository();
    const { result } = await renderHook(() => useAuth(), { wrapper: wrapper(repository) });
    await waitFor(() => expect(result.current.status).toBe('unauthenticated'));

    await act(async () => {
      void result.current.signIn({ identifier: 'ana', password: 'x' });
    });
    await act(async () => {
      void result.current.signIn({ identifier: 'bruno', password: 'x' });
    });

    // B finishes first, then the stale A arrives.
    await act(async () => {
      pending[1]!.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      pending[0]!.resolve();
      await Promise.resolve();
    });

    // A must not overwrite B just because it was slower.
    expect(result.current.session?.user.username).toBe('bruno');
  });
});

describe('sign-out is local-first', () => {
  it('clears the session even when server revocation fails', async () => {
    const repository: AuthRepository = {
      restoreSession: async () => makeSession('carlos'),
      signIn: async () => makeSession('carlos'),
      register: async () => makeSession('carlos'),
      signOut: jest.fn(async () => {
        throw new Error('network down');
      }),
    };

    const { result } = await renderHook(() => useAuth(), { wrapper: wrapper(repository) });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    await act(async () => {
      await result.current.signOut();
    });

    // A sign-out that silently does nothing because the request failed is a
    // real security problem.
    expect(result.current.status).toBe('unauthenticated');
    expect(result.current.session).toBeNull();
  });
});

describe('no repository — auth unavailable', () => {
  it('reports unavailable rather than unauthenticated', async () => {
    const { result } = await renderHook(() => useAuth(), {
      wrapper: wrapper(null, UNAVAILABLE_POLICY),
    });

    await waitFor(() => expect(result.current.status).toBe('unavailable'));
  });

  it('refuses to authenticate even when called programmatically', async () => {
    const { result } = await renderHook(() => useAuth(), {
      wrapper: wrapper(null, UNAVAILABLE_POLICY),
    });
    await waitFor(() => expect(result.current.status).toBe('unavailable'));

    await act(async () => {
      await result.current.signIn({ identifier: 'carlos', password: 'x' });
    });

    // The UI hides the form, but a programmatic caller must not talk itself in.
    expect(result.current.status).toBe('unavailable');
    expect(result.current.session).toBeNull();
  });
});

describe('session never carries credentials', () => {
  it('has no token field of any kind', async () => {
    const repository: AuthRepository = {
      restoreSession: async () => makeSession('carlos'),
      signIn: async () => makeSession('carlos'),
      register: async () => makeSession('carlos'),
      signOut: async () => undefined,
    };

    const { result } = await renderHook(() => useAuth(), { wrapper: wrapper(repository) });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    const serialized = JSON.stringify(result.current.session);
    // React state ends up in devtools dumps and crash reports.
    expect(serialized).not.toMatch(/accessToken|refreshToken|"token"|password/i);
  });
});

describe('mock session is visible in the UI', () => {
  it('renders the demo badge on the auth shell', async () => {
    // `AuthScreenShell` is imported at the TOP of this file, not lazily here.
    //
    // It used to be a `require()` inside this test body, which pulled in
    // BrandLockup → expo-image → the bundled 124 KB logo asset. On a cold Jest
    // transform cache — i.e. CI — that whole subtree was transformed INSIDE the
    // 5 s test timeout, so the test failed on CI and passed locally where the
    // cache is warm. It is also how a module ends up resolving after teardown
    // ("trying to import a file after the Jest environment has been torn
    // down"). A top-level import moves that cost to module load, which Jest
    // does not bound by the per-test timeout.
    const repository: AuthRepository = {
      restoreSession: async () => null,
      signIn: async () => makeSession('carlos'),
      register: async () => makeSession('carlos'),
      signOut: async () => undefined,
    };

    await renderWithProviders(
      <AuthProvider repository={repository} policy={MOCK_POLICY}>
        <AuthScreenShell title="Inicia sesión">{null}</AuthScreenShell>
      </AuthProvider>,
    );

    // Nobody should mistake a demo session for a real one.
    expect(screen.getByText('Modo demo')).toBeOnTheScreen();
  });
});
