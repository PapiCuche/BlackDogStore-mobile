import type { AuthStatus } from '@/auth/types';

import { parseDeepLink } from './parser';
import type { PendingIntentStore } from './pending-intent-store';
import {
  isPrivateIntent,
  routeForIntent,
  visibilityOf,
  type DeepLinkIntent,
  type DeepLinkRejectionReason,
} from './types';

/**
 * What the app should do about an incoming link.
 *
 * A DECISION, not an action. The coordinator computes it; a React component
 * performs the navigation. Keeping them apart is what makes every branch below
 * testable as a pure function, and what stops this from becoming a god object
 * that fetches, navigates and holds state.
 */
export type DeepLinkDecision =
  /** Go straight there. */
  | { action: 'navigate'; route: string; intent: DeepLinkIntent }
  /** Hold the destination and send the user to sign in first. */
  | { action: 'authenticate'; route: '/(auth)/login'; intent: DeepLinkIntent }
  /** Auth is not available in this build, so a private link cannot be honoured. */
  | { action: 'auth-unavailable'; intent: DeepLinkIntent }
  /** Recognised, but there is no backend contract behind it. */
  | { action: 'feature-unavailable'; intent: DeepLinkIntent }
  /** Wait: the session is still resolving. */
  | { action: 'wait'; intent: DeepLinkIntent }
  /** Refuse. */
  | { action: 'reject'; reason: DeepLinkRejectionReason };

/**
 * Decide what to do with an already-parsed intent.
 *
 * THE AUTHORIZATION BOUNDARY (DEC-MOBILE-004) lives here, and it is narrow on
 * purpose: this function decides *where to send the user*, never *what they may
 * see*. Reaching `/orders/1042` is not permission to read order 1042 — the
 * screen still asks the backend, and the backend still validates identity,
 * tenant and ownership. A link that names a resource proves nothing.
 */
export function decideForIntent(
  intent: DeepLinkIntent,
  context: { authStatus: AuthStatus },
): DeepLinkDecision {
  const visibility = visibilityOf(intent);

  // No backend contract exists for tokenised tracking (BR-008). Recognising the
  // link and then showing an honest unavailable state beats both alternatives:
  // pretending it worked, or losing it in "unknown route".
  if (visibility === 'secure-tracking-future') {
    return { action: 'feature-unavailable', intent };
  }

  const route = routeForIntent(intent);
  if (route === null) return { action: 'feature-unavailable', intent };

  if (!isPrivateIntent(intent)) {
    // Public destination: the catalogue needs no session. Whether the catalogue
    // itself is reachable is the screen's problem (M0.2 legacy gate), not the
    // link's — a deep link never unlocks a data source.
    return { action: 'navigate', route, intent };
  }

  switch (context.authStatus) {
    case 'authenticated':
      return { action: 'navigate', route, intent };

    case 'loading':
      // Cold start: the session is still being restored. Deciding now would
      // bounce an authenticated user through the login screen.
      return { action: 'wait', intent };

    case 'unavailable':
      // This build has no way to authenticate, so a private destination is
      // unreachable by construction. Sending the user to a login form that
      // cannot work would be worse than saying so.
      return { action: 'auth-unavailable', intent };

    case 'temporarily-unavailable':
      // Credentials exist but the server is unreachable. Treated as "not signed
      // in yet" rather than a hard failure: the destination is held and the
      // user lands on the auth screen, which explains itself.
      return { action: 'authenticate', route: '/(auth)/login', intent };

    case 'unauthenticated':
      return { action: 'authenticate', route: '/(auth)/login', intent };
  }
}

/**
 * Parse a raw URL and decide, in one step.
 *
 * The raw URL stops here: nothing downstream ever receives it.
 */
export function decideForUrl(
  rawUrl: unknown,
  context: { authStatus: AuthStatus },
): DeepLinkDecision {
  const parsed = parseDeepLink(rawUrl);
  if (!parsed.ok) return { action: 'reject', reason: parsed.reason };
  return decideForIntent(parsed.intent, context);
}

/**
 * Apply a decision to the pending-intent slot.
 *
 * Split out so the storing rule is one testable place: a destination is held
 * ONLY when the user is being sent to authenticate. Every other outcome —
 * navigate, reject, unavailable — leaves nothing behind, because a destination
 * that outlives its decision is a destination that reopens unexpectedly.
 */
export function applyDecisionToPending(
  decision: DeepLinkDecision,
  store: PendingIntentStore,
): void {
  if (decision.action === 'authenticate') {
    store.set(decision.intent);
    return;
  }
  // `wait` HOLDS the destination: the session is still resolving, and dropping
  // it would lose a link that arrived a few milliseconds before bootstrap
  // finished. The resume effect re-decides it once auth settles.
  if (decision.action === 'wait') {
    store.set(decision.intent);
    return;
  }

  store.clear();
}
