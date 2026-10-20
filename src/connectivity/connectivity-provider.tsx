import * as Network from 'expo-network';
import { AppState } from 'react-native';
import {
  createContext,
  use,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { toConnectivityState, type ConnectivityState } from './connectivity-state';
import { onNetworkReachable } from './connectivity-signal';

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

    function ask() {
      // Ask the OS now. The listener only fires on CHANGE, so without this the
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
    }

    ask();

    const subscription = Network.addNetworkStateListener((event) => {
      if (!cancelled) setState(toConnectivityState(event));
    });

    // COMING BACK TO THE APP IS A REASON TO ASK AGAIN.
    //
    // A phone that slept through a change of network wakes up holding the
    // answer from before it slept, because the change event fired while
    // nothing was listening. Asking on `active` costs one call per return to
    // the foreground and is what stops the counter's phone insisting it is
    // offline for the rest of the shift.
    const appState: { remove?: () => void } | undefined = AppState.addEventListener(
      'change',
      (status) => {
        if (status === 'active') ask();
      },
    );

    // A SUCCESSFUL REQUEST IS PROOF, and it outranks the OS.
    //
    // `offline` is not merely a banner: it pins `onlineManager` to false and
    // TanStack Query then PAUSES EVERY MUTATION — the till cannot charge, and
    // the screen does not say why. So when a response comes back over the
    // connection the OS says does not exist, the app believes the response and
    // re-asks the OS rather than waiting for an event that may never arrive.
    const unsubscribe = onNetworkReachable(() => {
      if (cancelled) return;
      setState((current) => (current === 'offline' ? 'online' : current));
      ask();
    });

    return () => {
      cancelled = true;
      subscription.remove();
      // `addEventListener` hands back a subscription on every RN this project
      // ships; a host that hands back nothing must not take the cleanup — and
      // the app — down with it.
      appState?.remove?.();
      unsubscribe();
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
