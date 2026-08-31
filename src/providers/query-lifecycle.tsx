import { focusManager, onlineManager, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { useConnectivity } from '@/connectivity/connectivity-provider';

import { clearPrivateQueries } from './query-client';
import { useQueryScope } from './use-query-scope';

/**
 * Wires TanStack Query to the things React Native actually has.
 *
 * Three separate concerns, three separate components, all rendering nothing.
 * Keeping them apart means each one's effect has a single dependency set — the
 * classic way this goes wrong is one mega-effect that re-subscribes to AppState
 * every time connectivity flickers.
 */

/**
 * Connectivity → `onlineManager`.
 *
 * TanStack Query already knows how to pause and resume around an offline
 * period; it just cannot see the radio. Feeding it real connectivity is what
 * stops the app firing requests that are guaranteed to fail, and what makes
 * `refetchOnReconnect` fire at the right moment.
 *
 * `unknown` counts as online. Refusing to fetch because we have not finished
 * asking the OS would stall the very first screen.
 */
export function QueryOnlineBridge() {
  const { state } = useConnectivity();

  useEffect(() => {
    onlineManager.setOnline(state !== 'offline');
  }, [state]);

  return null;
}

/**
 * AppState → `focusManager`.
 *
 * React Native has no `window.focus`, so without this `refetchOnWindowFocus` is
 * dead configuration. With it, returning from the background revalidates what
 * is STALE — not everything, because `staleTime` still applies. That distinction
 * is what keeps a foreground event from becoming a request storm.
 *
 * Subscribed once, with no dependencies: AppState does not change identity, and
 * re-subscribing on every render would leak listeners.
 */
export function QueryFocusBridge() {
  useEffect(() => {
    const onChange = (status: AppStateStatus) => {
      // `inactive` is the iOS transitional state — the app switcher, a phone
      // call banner. Treating it as blur would cause a focus/blur flicker every
      // time the user swiped up, so only a real background counts.
      focusManager.setFocused(status === 'active');
    };

    const subscription = AppState.addEventListener('change', onChange);
    return () => subscription.remove();
  }, []);

  return null;
}

/**
 * Identity changes → evict private cache.
 *
 * DEC-MOBILE-002. Covers three transitions with one rule, because all three are
 * the same problem — the cache outliving the person it belonged to:
 *
 *   sign-out          user 42 → anonymous
 *   different user    user 42 → user 77
 *   tenant switch     blackdog → otra-empresa   (future)
 *
 * Keyed on the identity STRING rather than on auth status, so a user swap that
 * never passes through `unauthenticated` is caught too.
 *
 * The first render only records the identity; there is nothing to evict yet,
 * and clearing then would throw away a cache warmed during bootstrap.
 */
export function SessionCacheCoordinator() {
  const client = useQueryClient();
  const scope = useQueryScope();
  const { status } = useAuth();

  const identity = `${scope.tenant}::${scope.user ?? 'anonymous'}`;
  const previousIdentity = useRef<string | null>(null);

  useEffect(() => {
    // Wait until auth has decided. During `loading` the scope is anonymous and
    // would otherwise register as a change the moment the session arrives.
    if (status === 'loading') return;

    const previous = previousIdentity.current;
    previousIdentity.current = identity;

    if (previous === null || previous === identity) return;

    // Cancel BEFORE removing: an in-flight request for the previous identity
    // would otherwise land afterwards and repopulate what was just cleared.
    void clearPrivateQueries(client);
  }, [identity, status, client]);

  return null;
}

/** All three bridges. Rendered once, inside the providers. */
export function QueryLifecycleBridges() {
  return (
    <>
      <QueryOnlineBridge />
      <QueryFocusBridge />
      <SessionCacheCoordinator />
    </>
  );
}
