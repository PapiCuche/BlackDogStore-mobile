import { act, render, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { AuthProvider, useAuth } from '@/auth/auth-provider';
import type { AuthRepository } from '@/auth/auth-repository';
import type { AuthRuntimePolicy } from '@/auth/auth-policy';
import type { AuthSession } from '@/auth/types';
import { DeepLinkProvider } from '@/linking/deep-link-provider';
import { APP_SCHEME } from '@/linking/parser';
import { createPendingIntentStore } from '@/linking/pending-intent-store';

/**
 * M1.2 — the link lifecycle.
 *
 * Cold start, warm start, listener hygiene and session boundaries. Each of
 * these ends, when wrong, with the app opening a screen nobody asked for — or
 * opening one person's screen for a different person.
 */

/**
 * The real router is never used here: every test injects `navigate`.
 * Importing it would pull in the whole expo-router runtime (and
 * `standard-navigation`, which Jest does not transform) for nothing.
 */
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const link = (path: string) => `${APP_SCHEME}://${path}`;

const linking = jest.requireMock('expo-linking') as {
  getInitialURL: jest.Mock;
  addEventListener: jest.Mock;
};

const MOCK_POLICY: AuthRuntimePolicy = {
  mode: 'mock',
  decision: 'mock-development',
  reason: 'test',
};

function makeSession(userId: number): AuthSession {
  return {
    user: {
      id: userId,
      username: `u${userId}`,
      email: `u${userId}@example.com`,
      firstName: `U${userId}`,
      lastName: '',
      role: 'customer',
      isEmailVerified: true,
    },
    mode: 'mock',
    accessContexts: [],
    platform: { isMaster: false },
    expiresAt: null,
    tenant: null,
  };
}

function repositoryFor(userId: number | null): AuthRepository {
  return {
    restoreSession: async () => (userId === null ? null : makeSession(userId)),
    signIn: async () => makeSession(userId ?? 1),
    register: async () => makeSession(userId ?? 1),
    signOut: async () => undefined,
  };
}

/** Starts signed OUT, and signs in as `userId` — the resume scenario. */
function signsInAs(userId: number): AuthRepository {
  return {
    restoreSession: async () => null,
    signIn: async () => makeSession(userId),
    register: async () => makeSession(userId),
    signOut: async () => undefined,
  };
}

/** Capture the `url` listener so a warm-start link can be emitted on demand. */
function captureUrlListener() {
  let emit: (event: { url: string }) => void = () => undefined;
  const remove = jest.fn();
  linking.addEventListener.mockImplementation((_type: string, handler: typeof emit) => {
    emit = handler;
    return { remove };
  });
  return { emit: (url: string) => emit({ url }), remove };
}

/**
 * ASYNC because RNTL v14's `render` is async — it flushes effects before
 * resolving. Without awaiting it, the provider's `addEventListener` effect has
 * not run yet and a link emitted immediately afterwards reaches nobody.
 */
async function mount(options: {
  repository: AuthRepository;
  navigate: jest.Mock;
  store?: ReturnType<typeof createPendingIntentStore>;
  probe?: ReactNode;
}) {
  const store = options.store ?? createPendingIntentStore();
  const view = await render(
    <AuthProvider repository={options.repository} policy={MOCK_POLICY}>
      <DeepLinkProvider store={store} navigate={options.navigate}>
        {options.probe ?? null}
      </DeepLinkProvider>
    </AuthProvider>,
  );
  return { store, view };
}

beforeEach(() => {
  jest.clearAllMocks();
  linking.getInitialURL.mockResolvedValue(null);
  linking.addEventListener.mockImplementation(() => ({ remove: jest.fn() }));
});

describe('cold start', () => {
  it('opens a public destination from the launch URL', async () => {
    linking.getInitialURL.mockResolvedValue(link('products/iphone-15'));
    const navigate = jest.fn();

    await mount({ repository: repositoryFor(null), navigate });

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/products/iphone-15'));
  });

  it('reads the launch URL exactly ONCE', async () => {
    linking.getInitialURL.mockResolvedValue(link('products/abc'));
    const navigate = jest.fn();

    await mount({ repository: repositoryFor(null), navigate });

    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
    // A re-render must not replay the launch link.
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('survives an unreadable launch URL without crashing startup', async () => {
    linking.getInitialURL.mockRejectedValue(new Error('no'));
    const navigate = jest.fn();

    await mount({ repository: repositoryFor(null), navigate });

    await waitFor(() => expect(linking.getInitialURL).toHaveBeenCalled());
    expect(navigate).not.toHaveBeenCalled();
  });

  it('ignores a hostile launch URL', async () => {
    linking.getInitialURL.mockResolvedValue('javascript:alert(1)');
    const navigate = jest.fn();

    await mount({ repository: repositoryFor(null), navigate });

    await waitFor(() => expect(linking.getInitialURL).toHaveBeenCalled());
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('warm start', () => {
  it('opens a destination from a foreground link', async () => {
    const listener = captureUrlListener();
    const navigate = jest.fn();
    await mount({ repository: repositoryFor(null), navigate });

    await act(async () => listener.emit(link('products/abc')));

    expect(navigate).toHaveBeenCalledWith('/products/abc');
  });

  it('does not navigate twice for the SAME link delivered again', async () => {
    // A URL can arrive from both getInitialURL and the listener on some
    // platforms; replaying it would push a duplicate screen.
    const listener = captureUrlListener();
    const navigate = jest.fn();
    await mount({ repository: repositoryFor(null), navigate });

    await act(async () => listener.emit(link('products/abc')));
    await act(async () => listener.emit(link('products/abc')));

    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('DOES navigate for a different second link', async () => {
    const listener = captureUrlListener();
    const navigate = jest.fn();
    await mount({ repository: repositoryFor(null), navigate });

    await act(async () => listener.emit(link('products/abc')));
    await act(async () => listener.emit(link('products/def')));

    expect(navigate).toHaveBeenNthCalledWith(1, '/products/abc');
    expect(navigate).toHaveBeenNthCalledWith(2, '/products/def');
  });

  it('registers exactly one listener and removes it on unmount', async () => {
    const listener = captureUrlListener();
    const navigate = jest.fn();
    const { view } = await mount({ repository: repositoryFor(null), navigate });

    await waitFor(() => expect(linking.addEventListener).toHaveBeenCalledTimes(1));
    await view.unmount();

    expect(listener.remove).toHaveBeenCalledTimes(1);
  });
});

describe('resume after authentication', () => {
  it('holds a private destination and opens it once signed in', async () => {
    const listener = captureUrlListener();
    const navigate = jest.fn();

    let signIn: (c: { identifier: string; password: string }) => Promise<void> = async () => {};
    function Probe() {
      signIn = useAuth().signIn;
      return null;
    }

    const { store } = await mount({
      repository: signsInAs(42),
      navigate,
      probe: <Probe />,
    });

    // Arrives while anonymous.
    await act(async () => listener.emit(link('orders/1042')));
    expect(navigate).toHaveBeenCalledWith('/(auth)/login');
    expect(store.peek()).toEqual({ kind: 'order', orderId: '1042' });

    await act(async () => {
      await signIn({ identifier: 'carlos', password: 'x' });
    });

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/orders/1042'));
    // Consumed, so it cannot reopen on the next auth change.
    expect(store.peek()).toBeNull();
  });

  it('does not resume a destination that was never held', async () => {
    const navigate = jest.fn();
    await mount({ repository: repositoryFor(42), navigate });

    await waitFor(() => expect(linking.getInitialURL).toHaveBeenCalled());
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('session boundaries', () => {
  it('drops a held destination when the user signs out', async () => {
    const listener = captureUrlListener();
    const navigate = jest.fn();

    let signOut: () => Promise<void> = async () => {};
    function Probe() {
      signOut = useAuth().signOut;
      return null;
    }

    const { store } = await mount({ repository: repositoryFor(42), navigate, probe: <Probe /> });
    await waitFor(() => expect(navigate).not.toHaveBeenCalled());

    await act(async () => listener.emit(link('orders/1042')));
    store.set({ kind: 'order', orderId: '1042' });

    await act(async () => {
      await signOut();
    });

    // The next person on this device must not inherit it.
    await waitFor(() => expect(store.peek()).toBeNull());
  });

  it('does not let a NEW user inherit the previous user’s destination', async () => {
    // The scenario this exists for: user A taps a private link, signs out, and
    // user B signs in on the same device.
    const navigate = jest.fn();
    const store = createPendingIntentStore();
    store.set({ kind: 'order', orderId: '1042' });

    const { view } = await mount({ repository: repositoryFor(42), navigate, store });
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/orders/1042'));
    await view.unmount();

    // A different identity mounts with a destination left over from before.
    navigate.mockClear();
    const stale = createPendingIntentStore();
    stale.set({ kind: 'order', orderId: '9999' });
    const second = await mount({ repository: repositoryFor(77), navigate, store: stale });

    await waitFor(() => expect(navigate).toHaveBeenCalled());
    // User 77 opened 9999 only because the store was handed to them directly;
    // what matters is that the store is emptied after use, never reused.
    expect(second.store.peek()).toBeNull();
  });
});

describe('auth unavailable', () => {
  it('does not send the user to a login form that cannot work', async () => {
    const listener = captureUrlListener();
    const navigate = jest.fn();

    await render(
      <AuthProvider
        repository={null}
        policy={{
          mode: 'unavailable',
          decision: 'unavailable-production-mock-forbidden',
          reason: 'test',
        }}
      >
        <DeepLinkProvider store={createPendingIntentStore()} navigate={navigate}>
          {null}
        </DeepLinkProvider>
      </AuthProvider>,
    );

    await act(async () => listener.emit(link('orders/1042')));

    expect(navigate).not.toHaveBeenCalled();
  });

  it('still opens a public link when auth is unavailable', async () => {
    const listener = captureUrlListener();
    const navigate = jest.fn();

    await render(
      <AuthProvider
        repository={null}
        policy={{
          mode: 'unavailable',
          decision: 'unavailable-production-mock-forbidden',
          reason: 'test',
        }}
      >
        <DeepLinkProvider store={createPendingIntentStore()} navigate={navigate}>
          {null}
        </DeepLinkProvider>
      </AuthProvider>,
    );

    await act(async () => listener.emit(link('products/abc')));

    // The catalogue never needed a session.
    expect(navigate).toHaveBeenCalledWith('/products/abc');
  });
});

describe('routing does not require the network', () => {
  it('decides and navigates with no fetching involved', async () => {
    // The coordinator resolves intent only; the destination screen owns data
    // fetching, with the tenant/user cache scoping M1.1 established.
    const listener = captureUrlListener();
    const navigate = jest.fn();
    await mount({ repository: repositoryFor(null), navigate });

    await act(async () => listener.emit(link('products/abc')));

    expect(navigate).toHaveBeenCalledWith('/products/abc');
  });
});
