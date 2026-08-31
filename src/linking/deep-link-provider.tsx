import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useRef, type ReactNode } from 'react';

import { useAuth } from '@/auth/auth-provider';
import { companySlug } from '@/config/env';

import {
  applyDecisionToPending,
  decideForIntent,
  decideForUrl,
  type DeepLinkDecision,
} from './deep-link-coordinator';
import { pendingIntentStore, type PendingIntentStore } from './pending-intent-store';

/**
 * Wires incoming links to navigation.
 *
 * Renders nothing. It owns three things and nothing else:
 *
 *  1. the cold-start URL (`getInitialURL`),
 *  2. the warm-start listener (`addEventListener('url')`),
 *  3. resuming a held destination once a session appears.
 *
 * It never fetches. The destination screen does that, through its repository
 * and hooks, with the tenant and user cache scoping M1.1 established — which is
 * exactly why a deep link cannot become a side door into data (§34).
 */
export function DeepLinkProvider({
  children,
  store = pendingIntentStore,
  /** Injected by tests. Production navigates for real. */
  navigate = defaultNavigate,
}: {
  children: ReactNode;
  store?: PendingIntentStore;
  navigate?: (route: string) => void;
}) {
  const { status, session } = useAuth();

  /**
   * Links already handled, so the same event cannot navigate twice.
   *
   * A URL can arrive from BOTH `getInitialURL()` and the `url` listener on some
   * platforms, and a re-render must not replay it. Keyed on the raw URL but
   * never exposing it: this ref is read and compared, never logged.
   */
  const lastHandledUrl = useRef<string | null>(null);

  /**
   * Current auth status, readable from inside the link handler.
   *
   * The handler must NOT close over `status`: the subscription is created once
   * (re-subscribing on every auth transition would re-read the launch URL and
   * navigate again), so a captured `status` would be frozen at `loading` for
   * the life of the app and every link would be decided against it.
   */
  const statusRef = useRef(status);

  /**
   * Whether the signed-in user has a server-verified relation with THIS
   * build's company (M3). `undefined` while there is no session, which is the
   * state the coordinator treats as "not known", exactly as before.
   */
  const hasActiveCompany = session?.tenant
    ? session.tenant.activeCompany !== null
    : undefined;
  const tenantRef = useRef(hasActiveCompany);

  // Written in an effect, never during render: React forbids touching a ref
  // while rendering, and an effect runs long before any link can arrive.
  useEffect(() => {
    statusRef.current = status;
    tenantRef.current = hasActiveCompany;
  }, [status, hasActiveCompany]);

  /** Session identity, so a change can invalidate a held destination. */
  const identity = session ? `${companySlug ?? 'unconfigured'}::${session.user.id}` : null;
  const previousIdentity = useRef<string | null | undefined>(undefined);

  // ── Cold start + warm start ───────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const handle = (url: string | null) => {
      if (cancelled || !url) return;
      if (lastHandledUrl.current === url) return;
      lastHandledUrl.current = url;

      const decision = decideForUrl(url, {
        authStatus: statusRef.current,
        hasActiveCompany: tenantRef.current,
      });
      applyDecisionToPending(decision, store);
      performDecision(decision, navigate);
    };

    // Cold start: the app was launched BY the link.
    Linking.getInitialURL()
      .then(handle)
      .catch(() => {
        // An unreadable initial URL is not actionable and must not crash
        // startup. The app simply opens normally.
      });

    // Warm start: the app was already running.
    const subscription = Linking.addEventListener('url', (event) => handle(event.url));

    return () => {
      cancelled = true;
      // One listener, always removed. Subscribing per render would replay every
      // link once per mount.
      subscription.remove();
    };
    // `status` is deliberately absent from the dependencies — the handler reads
    // it from `statusRef` instead. Re-subscribing on every auth transition
    // would re-read the launch URL and navigate a second time.
  }, [store, navigate]);

  // ── Resume after authentication, and clear on session boundaries ──────────
  useEffect(() => {
    // Wait until auth has actually decided. During `loading` the identity is
    // null, and letting that count as a value would make the FIRST restored
    // session look like a user switch — clearing a destination that was held
    // moments earlier, on every cold start.
    if (status === 'loading') return;

    const previous = previousIdentity.current;
    previousIdentity.current = identity;

    // A held destination must not survive a change of PERSON.
    //
    // The distinction that matters: `null -> 42` is somebody signing IN, which
    // is precisely when a held link should resume. `42 -> null` (sign-out) and
    // `42 -> 77` (a different user) are boundaries, and a destination that
    // crossed one would open user A's screen for user B.
    const hadSession = previous !== undefined && previous !== null;
    if (hadSession && previous !== identity) {
      store.clear();
      return;
    }

    const pending = store.peek();
    if (!pending) return;

    // Re-decide rather than trusting the earlier decision: auth and tenant are
    // re-evaluated against the session that actually arrived.
    const decision = decideForIntent(pending, { authStatus: status, hasActiveCompany });

    if (decision.action === 'navigate') {
      // Consume FIRST so the destination opens exactly once, even if a
      // re-render lands before navigation completes.
      store.consume();
      performDecision(decision, navigate);
      return;
    }

    // Still not signed in: send them to authenticate and KEEP the destination,
    // which is what makes the resume work after they do.
    if (decision.action === 'authenticate') {
      performDecision(decision, navigate);
    }
  }, [status, identity, hasActiveCompany, store, navigate]);

  return <>{children}</>;
}

/**
 * Carry out a decision.
 *
 * Only ever receives a route built by `routeForIntent`, which emits one of
 * three literals with an encoded identifier. A raw URL never reaches `router`.
 */
function performDecision(decision: DeepLinkDecision, navigate: (route: string) => void): void {
  switch (decision.action) {
    case 'navigate':
      navigate(decision.route);
      return;
    case 'authenticate':
      navigate(decision.route);
      return;
    case 'wait':
    case 'reject':
    case 'auth-unavailable':
    case 'feature-unavailable':
      // Nothing to navigate to. The user stays where they are; the app does not
      // announce a rejected link, because doing so would confirm to whoever
      // crafted it that the app received it.
      return;
  }
}

function defaultNavigate(route: string): void {
  router.push(route as Parameters<typeof router.push>[0]);
}
