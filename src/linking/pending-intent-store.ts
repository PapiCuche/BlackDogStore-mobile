import type { DeepLinkIntent } from './types';

/**
 * The one destination waiting for a session.
 *
 * MEMORY ONLY, and exactly one slot.
 *
 * Not persisted — not AsyncStorage, not SecureStore. A pending destination is
 * ephemeral navigation state; writing it to disk would let a link survive an app
 * kill and re-open for whoever picks up the device next.
 *
 * One slot because a second pending link supersedes the first: a user tapping
 * two links wants the second one, and a queue would eventually open a screen
 * they asked for minutes ago.
 *
 * What is stored is the PARSED, VALIDATED intent — never the raw URL. The raw
 * URL may carry a verification token, a reset token or a future tracking
 * credential; the intent carries a kind and an identifier and nothing else.
 */
export type PendingIntentStore = {
  /** Replace whatever was pending. */
  set(intent: DeepLinkIntent): void;
  /** Read without consuming. */
  peek(): DeepLinkIntent | null;
  /** Read AND clear, so a destination cannot be opened twice. */
  consume(): DeepLinkIntent | null;
  clear(): void;
};

export function createPendingIntentStore(): PendingIntentStore {
  let pending: DeepLinkIntent | null = null;

  return {
    set(intent) {
      pending = intent;
    },
    peek() {
      return pending;
    },
    consume() {
      // Read-and-clear in one step: leaving it set after navigation is how the
      // same screen reopens on the next auth state change.
      const current = pending;
      pending = null;
      return current;
    },
    clear() {
      pending = null;
    },
  };
}

/** App-wide instance. Dies with the JS context, which is the intended lifetime. */
export const pendingIntentStore: PendingIntentStore = createPendingIntentStore();
