import type { NetworkState } from 'expo-network';

/**
 * Connectivity, reduced to what the UI can honestly act on.
 *
 * DELIBERATELY THREE STATES. `expo-network` also reports a connection type and
 * an `isInternetReachable` flag, and neither survives contact with reality:
 *
 *  - On iOS the docs state `isInternetReachable` "will always be the same as
 *    `isConnected`". Modelling a separate "connected but no internet" state
 *    would therefore be a lie on half our devices.
 *  - Connection type (wifi/cellular) changes nothing about what the app does.
 *
 * `unknown` is a real state, not a placeholder: on the first frame we have not
 * asked the OS yet, and telling the user they are offline before we know is a
 * false alarm they will remember.
 */
export type ConnectivityState = 'unknown' | 'online' | 'offline';

/**
 * Map a raw `NetworkState` onto our model.
 *
 * `isInternetReachable === false` is honoured because on ANDROID it genuinely
 * means "attached to a network with no usable internet" — a captive portal, the
 * classic hotel wifi. On iOS it mirrors `isConnected`, so this branch simply
 * never fires there and costs nothing.
 *
 * Anything we cannot read is `unknown`, never `offline`.
 */
export function toConnectivityState(state: NetworkState | null | undefined): ConnectivityState {
  if (!state || state.isConnected === undefined || state.isConnected === null) {
    return 'unknown';
  }
  if (!state.isConnected) return 'offline';
  // Only a hard `false` counts. `undefined` means "not reported", not "no".
  if (state.isInternetReachable === false) return 'offline';
  return 'online';
}

/**
 * Whether it is worth attempting a request.
 *
 * `unknown` counts as online on purpose: refusing to try because we have not
 * finished asking the OS would break the very first screen load. The API client
 * remains the authority on whether a request actually succeeded — connectivity
 * is a UX hint, not a verdict.
 */
export function isWorthAttempting(state: ConnectivityState): boolean {
  return state !== 'offline';
}
