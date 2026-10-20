/**
 * «A REQUEST JUST SUCCEEDED» — the only connectivity evidence that cannot lie.
 *
 * WHY THIS EXISTS. `expo-network` answers once on mount and then only when it
 * decides something CHANGED. If that change event never arrives — the host
 * machine slept, the radio flapped while the app stayed in the foreground, a
 * simulator — the app keeps the last answer it got. A stale `offline` is not a
 * cosmetic banner: `QueryOnlineBridge` pins TanStack Query's `onlineManager` to
 * false, and a pinned `onlineManager` PAUSES EVERY MUTATION. The till stops
 * being able to charge, and nothing on screen says why.
 *
 * The API client already knows the truth: a 2xx came back over the very
 * connection the OS says does not exist. This is how it says so.
 *
 * Deliberately a module-level emitter rather than a hook: `client.ts` is plain
 * TypeScript with no React in it, and it is going to stay that way.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

/**
 * Announce that the network demonstrably works.
 *
 * Cheap and idempotent: the provider decides whether anything changes. Called
 * on every successful response, so it must stay a set iteration and nothing
 * more.
 */
export function reportNetworkReachable(): void {
  for (const listener of listeners) listener();
}

export function onNetworkReachable(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test seam: drop every subscription. */
export function resetNetworkReachableListeners(): void {
  listeners.clear();
}
