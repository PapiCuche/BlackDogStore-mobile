import * as Network from 'expo-network';
import {
  createContext,
  use,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { toConnectivityState, type ConnectivityState } from './connectivity-state';

type ConnectivityContextValue = {
  state: ConnectivityState;
  isOnline: boolean;
  isOffline: boolean;
  /** True until the OS has answered for the first time. */
  isUnknown: boolean;
};

const ConnectivityContext = createContext<ConnectivityContextValue | null>(null);

/**
 * One connectivity subscription for the whole app.
 *
 * A subscription per screen would mean N native listeners, N wake-ups on every
 * radio transition, and N chances to forget a cleanup. This owns exactly one,
 * and every consumer reads the same value — so the offline banner and a list
 * screen can never disagree about whether there is a network.
 *
 * It holds no UI and no fetching logic: connectivity is an input, and mixing it
 * with what to DO about connectivity is how a provider turns into a god object.
 */
export function ConnectivityProvider({
  children,
  /** Injected by tests. Production passes nothing. */
  initialState = 'unknown',
}: {
  children: ReactNode;
  initialState?: ConnectivityState;
}) {
  const [state, setState] = useState<ConnectivityState>(initialState);

  useEffect(() => {
    let cancelled = false;

    // Ask once up front. The listener only fires on CHANGE, so without this the
    // app would sit at `unknown` until the user walked into a lift.
    Network.getNetworkStateAsync()
      .then((network) => {
        if (!cancelled) setState(toConnectivityState(network));
      })
      .catch(() => {
        // Unreadable network state is not offline. Staying `unknown` lets
        // requests proceed and lets the API client report the truth.
        if (!cancelled) setState('unknown');
      });

    const subscription = Network.addNetworkStateListener((event) => {
      if (!cancelled) setState(toConnectivityState(event));
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  const value = useMemo<ConnectivityContextValue>(
    () => ({
      state,
      isOnline: state === 'online',
      isOffline: state === 'offline',
      isUnknown: state === 'unknown',
    }),
    [state],
  );

  return <ConnectivityContext value={value}>{children}</ConnectivityContext>;
}

/**
 * Current connectivity.
 *
 * Throws outside the provider rather than defaulting to `online`: a silent
 * default would make the offline banner simply never appear, and nothing would
 * point at the cause.
 */
export function useConnectivity(): ConnectivityContextValue {
  const context = use(ConnectivityContext);
  if (!context) {
    throw new Error('useConnectivity must be used inside <ConnectivityProvider>.');
  }
  return context;
}
