import { act, renderHook, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ConnectivityProvider, useConnectivity } from '@/connectivity/connectivity-provider';
import { reportNetworkReachable } from '@/connectivity/connectivity-signal';
import { toConnectivityState } from '@/connectivity/connectivity-state';
import { OfflineBanner } from '@/design-system';

import { renderWithProviders } from './support/render';

/**
 * M1.1 — connectivity, and the one rule that governs it: never tell the user
 * they are offline until we actually know.
 */

const network = jest.requireMock('expo-network') as {
  getNetworkStateAsync: jest.Mock;
  addNetworkStateListener: jest.Mock;
};

/** Capture the listener the provider registers, so tests can drive it. */
function captureListener() {
  let emit: (event: unknown) => void = () => undefined;
  const remove = jest.fn();
  network.addNetworkStateListener.mockImplementation((listener: (e: unknown) => void) => {
    emit = listener;
    return { remove };
  });
  return { emit: (event: unknown) => emit(event), remove };
}

function wrapper({ children }: { children: ReactNode }) {
  return <ConnectivityProvider>{children}</ConnectivityProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
  network.getNetworkStateAsync.mockResolvedValue({
    isConnected: true,
    isInternetReachable: true,
  });
  network.addNetworkStateListener.mockImplementation(() => ({ remove: jest.fn() }));
});

describe('toConnectivityState', () => {
  it('reports online for a connected network', () => {
    expect(toConnectivityState({ isConnected: true, isInternetReachable: true })).toBe('online');
  });

  it('reports offline when disconnected', () => {
    expect(toConnectivityState({ isConnected: false })).toBe('offline');
  });

  it('treats an unreadable state as UNKNOWN, never offline', () => {
    // Claiming "sin conexión" before the OS has answered is a false alarm the
    // user will remember.
    expect(toConnectivityState(null)).toBe('unknown');
    expect(toConnectivityState({})).toBe('unknown');
    expect(toConnectivityState(undefined)).toBe('unknown');
  });

  it('honours a hard isInternetReachable=false — the captive-portal case', () => {
    // Android reports this for hotel wifi. On iOS it mirrors isConnected, so
    // this branch simply never fires there.
    expect(toConnectivityState({ isConnected: true, isInternetReachable: false })).toBe('offline');
  });

  it('ignores an UNREPORTED isInternetReachable', () => {
    // `undefined` means "not reported", not "no".
    expect(toConnectivityState({ isConnected: true })).toBe('online');
  });
});

describe('ConnectivityProvider', () => {
  it('asks the OS once on mount, because the listener only fires on change', async () => {
    await renderHook(() => useConnectivity(), { wrapper });

    await waitFor(() => expect(network.getNetworkStateAsync).toHaveBeenCalledTimes(1));
  });

  it('goes online → offline when the listener fires', async () => {
    const listener = captureListener();
    const { result } = await renderHook(() => useConnectivity(), { wrapper });

    await waitFor(() => expect(result.current.isOnline).toBe(true));

    await act(async () => {
      listener.emit({ isConnected: false });
    });

    expect(result.current.state).toBe('offline');
    expect(result.current.isOffline).toBe(true);
  });

  it('goes offline → online when the radio returns', async () => {
    const listener = captureListener();
    network.getNetworkStateAsync.mockResolvedValue({ isConnected: false });
    const { result } = await renderHook(() => useConnectivity(), { wrapper });

    await waitFor(() => expect(result.current.isOffline).toBe(true));

    await act(async () => {
      listener.emit({ isConnected: true, isInternetReachable: true });
    });

    expect(result.current.state).toBe('online');
  });

  it('removes its listener on unmount', async () => {
    const listener = captureListener();
    const { unmount } = await renderHook(() => useConnectivity(), { wrapper });

    await unmount();

    // One subscription per screen would mean N native listeners and N chances
    // to leak one.
    expect(listener.remove).toHaveBeenCalledTimes(1);
  });

  it('stays UNKNOWN when the OS query fails', async () => {
    network.getNetworkStateAsync.mockRejectedValue(new Error('nope'));
    const { result } = await renderHook(() => useConnectivity(), { wrapper });

    await waitFor(() => expect(network.getNetworkStateAsync).toHaveBeenCalled());

    // Unreadable is not offline: let the request go and let the API client
    // report the truth.
    expect(result.current.state).toBe('unknown');
    expect(result.current.isOffline).toBe(false);
  });
});

describe('OfflineBanner', () => {
  it('appears when offline', async () => {
    await renderWithProviders(<OfflineBanner />, { connectivity: 'offline' });

    expect(screen.getByText('Sin conexión')).toBeOnTheScreen();
    expect(screen.getByText('Mostrando la información disponible.')).toBeOnTheScreen();
  });

  it('is absent when online', async () => {
    await renderWithProviders(<OfflineBanner />, { connectivity: 'online' });

    expect(screen.queryByText('Sin conexión')).not.toBeOnTheScreen();
  });

  it('is absent while connectivity is still unknown', async () => {
    await renderWithProviders(<OfflineBanner />, { connectivity: 'unknown' });

    expect(screen.queryByText('Sin conexión')).not.toBeOnTheScreen();
  });

  it('announces itself once, and carries its meaning in text', async () => {
    await renderWithProviders(<OfflineBanner />, { connectivity: 'offline' });

    // Colour is reinforcement; the words are the signal.
    expect(
      screen.getByLabelText('Sin conexión. Mostrando la información disponible.'),
    ).toBeOnTheScreen();
  });
});

/**
 * THE LATCH — the bug this guards against.
 *
 * `expo-network` answers once on mount and then only when IT decides something
 * changed. A phone that slept through the change, or a machine whose host
 * network flapped, keeps the last answer forever. And `offline` is not a
 * banner: `QueryOnlineBridge` pins `onlineManager` to false, which PAUSES EVERY
 * MUTATION — the till silently stops being able to charge.
 *
 * Found in the simulator against the real backend: the strip said «Sin
 * conexión» while `curl` to the same API answered 200, and it stayed that way
 * until the app was reloaded.
 */
describe('recovering from a stale offline', () => {
  it('asks the OS again when the app comes back to the foreground', async () => {
    const { AppState } = jest.requireActual('react-native') as {
      AppState: { addEventListener: unknown };
    };
    const handlers: ((status: string) => void)[] = [];
    const spy = jest
      .spyOn(AppState as never, 'addEventListener')
      .mockImplementation(((_event: string, handler: (status: string) => void) => {
        handlers.push(handler);
        return { remove: jest.fn() };
      }) as never);

    network.getNetworkStateAsync.mockResolvedValue({ isConnected: false });
    const view = await renderHook(() => useConnectivity(), { wrapper });
    await waitFor(() => expect(view.result.current.isOffline).toBe(true));

    // The radio came back while the app was in the background: no change event
    // was ever delivered to this process.
    network.getNetworkStateAsync.mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
    });
    await act(async () => {
      for (const handler of handlers) handler('active');
    });

    await waitFor(() => expect(view.result.current.isOffline).toBe(false));
    spy.mockRestore();
  });

  it('believes a successful request over the OS', async () => {
    // Bytes came back over the connection the OS says does not exist. The
    // response is the proof, and it is what un-pauses the mutations.
    network.getNetworkStateAsync.mockResolvedValue({ isConnected: false });
    const view = await renderHook(() => useConnectivity(), { wrapper });
    await waitFor(() => expect(view.result.current.isOffline).toBe(true));

    network.getNetworkStateAsync.mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
    });
    await act(async () => {
      reportNetworkReachable();
    });

    await waitFor(() => expect(view.result.current.isOffline).toBe(false));
  });

  it('keeps saying offline while nothing has demonstrated otherwise', async () => {
    // The fix must not become "assume online": a real outage still reads as
    // one, or the banner would be decoration.
    network.getNetworkStateAsync.mockResolvedValue({ isConnected: false });
    const view = await renderHook(() => useConnectivity(), { wrapper });

    await waitFor(() => expect(view.result.current.isOffline).toBe(true));
    await act(async () => {
      await Promise.resolve();
    });
    expect(view.result.current.isOffline).toBe(true);
  });
});
