import { focusManager, onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';

import { AuthProvider, useAuth } from '@/auth/auth-provider';
import type { AuthRepository } from '@/auth/auth-repository';
import type { AuthRuntimePolicy } from '@/auth/auth-policy';
import type { AuthSession } from '@/auth/types';
import { ConnectivityProvider } from '@/connectivity/connectivity-provider';
import type { ConnectivityState } from '@/connectivity/connectivity-state';
import {
  QueryFocusBridge,
  QueryOnlineBridge,
  SessionCacheCoordinator,
} from '@/providers/query-lifecycle';
import { queryKeys } from '@/providers/query-client';
import { makeQueryScope } from '@/providers/query-scope';

/**
 * M1.1 — wiring TanStack Query to the signals React Native actually has.
 *
 * Without these bridges, `refetchOnWindowFocus` and `refetchOnReconnect` are
 * dead configuration: there is no `window.focus` on a phone, and TanStack
 * cannot see the radio.
 */

const MOCK_POLICY: AuthRuntimePolicy = {
  mode: 'mock',
  decision: 'mock-development',
  reason: 'test',
};

function session(userId: number): AuthSession {
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
    restoreSession: async () => (userId === null ? null : session(userId)),
    signIn: async () => session(userId ?? 1),
    register: async () => session(userId ?? 1),
    signOut: async () => undefined,
  };
}

const clients: QueryClient[] = [];
function makeClient() {
  const client = new QueryClient();
  clients.push(client);
  return client;
}

afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
  jest.restoreAllMocks();
});

describe('QueryOnlineBridge', () => {
  function mount(connectivity: ConnectivityState) {
    return render(
      <ConnectivityProvider initialState={connectivity}>
        <QueryOnlineBridge />
      </ConnectivityProvider>,
    );
  }

  it('tells onlineManager the device is offline', async () => {
    const setOnline = jest.spyOn(onlineManager, 'setOnline');

    await mount('offline');

    await waitFor(() => expect(setOnline).toHaveBeenCalledWith(false));
  });

  it('tells onlineManager the device is online', async () => {
    const setOnline = jest.spyOn(onlineManager, 'setOnline');

    await mount('online');

    await waitFor(() => expect(setOnline).toHaveBeenCalledWith(true));
  });

  it('treats UNKNOWN as online, so the first screen is not stalled', async () => {
    const setOnline = jest.spyOn(onlineManager, 'setOnline');

    await mount('unknown');

    // Refusing to fetch because we have not finished asking the OS would break
    // every cold start.
    await waitFor(() => expect(setOnline).toHaveBeenCalledWith(true));
  });
});

describe('QueryFocusBridge', () => {
  it('marks the app focused when AppState is active', async () => {
    const setFocused = jest.spyOn(focusManager, 'setFocused');
    let emit: (status: string) => void = () => undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_e: string, handler: (s: string) => void) => {
      emit = handler;
      return { remove: jest.fn() };
    }) as never);

    await render(<QueryFocusBridge />);
    await act(async () => emit('active'));

    expect(setFocused).toHaveBeenCalledWith(true);
  });

  it('marks it blurred in the background, so nothing refetches there', async () => {
    const setFocused = jest.spyOn(focusManager, 'setFocused');
    let emit: (status: string) => void = () => undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_e: string, handler: (s: string) => void) => {
      emit = handler;
      return { remove: jest.fn() };
    }) as never);

    await render(<QueryFocusBridge />);
    await act(async () => emit('background'));

    expect(setFocused).toHaveBeenCalledWith(false);
  });

  it('treats iOS `inactive` as blurred rather than flickering', async () => {
    const setFocused = jest.spyOn(focusManager, 'setFocused');
    let emit: (status: string) => void = () => undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_e: string, handler: (s: string) => void) => {
      emit = handler;
      return { remove: jest.fn() };
    }) as never);

    await render(<QueryFocusBridge />);
    await act(async () => emit('inactive'));

    // Only `active` counts as focused; the app switcher must not cause a
    // focus/blur storm.
    expect(setFocused).toHaveBeenLastCalledWith(false);
  });

  it('removes its AppState listener on unmount', async () => {
    const remove = jest.fn();
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((() => ({ remove })) as never));

    const view = await render(<QueryFocusBridge />);
    await view.unmount();

    expect(remove).toHaveBeenCalledTimes(1);
  });
});

describe('SessionCacheCoordinator', () => {
  function mount(client: QueryClient, repository: AuthRepository, children?: ReactNode) {
    return render(
      <ConnectivityProvider initialState="online">
        <QueryClientProvider client={client}>
          <AuthProvider repository={repository} policy={MOCK_POLICY}>
            <SessionCacheCoordinator />
            {children}
          </AuthProvider>
        </QueryClientProvider>
      </ConnectivityProvider>,
    );
  }

  it('does not evict on first render, when there is nothing to evict', async () => {
    const client = makeClient();
    const scope = makeQueryScope({ tenantSlug: 'blackdog', userId: 42 });
    client.setQueryData(queryKeys.orders(scope), [{ id: 1 }]);

    await mount(client, repositoryFor(42));

    // Clearing on mount would throw away a cache warmed during bootstrap.
    await waitFor(() => expect(client.getQueryData(queryKeys.orders(scope))).toBeDefined());
  });

  it('evicts private cache when the user signs out', async () => {
    const client = makeClient();
    const userA = makeQueryScope({ tenantSlug: 'blackdog', userId: 42 });

    // A child that hands the test the signOut action.
    let signOut: () => Promise<void> = async () => undefined;
    function Probe() {
      signOut = useAuth().signOut;
      return null;
    }

    const view = await mount(client, repositoryFor(42), <Probe />);

    // Wait until the session is established, THEN seed the cache — mirroring a
    // real session that fetched its own data.
    await waitFor(() => expect(signOut).not.toBe(undefined));
    client.setQueryData(queryKeys.orders(userA), [{ id: 1042 }]);
    client.setQueryData(queryKeys.products(userA), [{ id: 101 }]);

    await act(async () => {
      await signOut();
    });

    await waitFor(() => {
      // The whole point: the next person on this device must not read them.
      expect(client.getQueryData(queryKeys.orders(userA))).toBeUndefined();
    });
    // Public tenant data survives — nothing personal in the catalogue.
    expect(client.getQueryData(queryKeys.products(userA))).toBeDefined();

    await view.unmount();
  });

  it('leaves the cache alone while the identity is unchanged', async () => {
    const client = makeClient();
    const userA = makeQueryScope({ tenantSlug: 'blackdog', userId: 42 });

    const view = await mount(client, repositoryFor(42));
    client.setQueryData(queryKeys.orders(userA), [{ id: 1042 }]);

    // No identity change: evicting here would make every re-render a cache wipe.
    await waitFor(() => expect(client.getQueryData(queryKeys.orders(userA))).toBeDefined());

    await view.unmount();
  });
});
