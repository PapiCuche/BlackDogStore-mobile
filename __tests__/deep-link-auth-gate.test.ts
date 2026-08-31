import type { AuthStatus } from '@/auth/types';
import {
  applyDecisionToPending,
  decideForIntent,
  decideForUrl,
} from '@/linking/deep-link-coordinator';
import { APP_SCHEME } from '@/linking/parser';
import { createPendingIntentStore } from '@/linking/pending-intent-store';
import type { DeepLinkIntent } from '@/linking/types';

/**
 * M1.2 — DEC-MOBILE-004: a deep link is a navigation intent, never authorization.
 *
 * The boundary under test: reaching `/orders/1042` is not permission to READ
 * order 1042. The coordinator decides where to send someone; the backend decides
 * what they may see. These tests pin down that the gate cannot be talked past.
 */

const link = (path: string) => `${APP_SCHEME}://${path}`;

const PRODUCT: DeepLinkIntent = { kind: 'product', slug: 'iphone-15' };
const ORDER: DeepLinkIntent = { kind: 'order', orderId: '1042' };
const REPAIR: DeepLinkIntent = { kind: 'repair', repairId: 'r-1042' };
const TRACKING: DeepLinkIntent = { kind: 'tracking' };

describe('public destinations', () => {
  it.each<AuthStatus>([
    'authenticated',
    'unauthenticated',
    'loading',
    'unavailable',
    'temporarily-unavailable',
  ])('opens a product link regardless of auth status (%s)', (authStatus) => {
    // The catalogue is public by nature. Gating it behind a session would make
    // a shared product link useless to the person who received it.
    const decision = decideForIntent(PRODUCT, { authStatus });
    expect(decision).toEqual({ action: 'navigate', route: '/products/iphone-15', intent: PRODUCT });
  });
});

describe('private destinations', () => {
  it.each([
    ['order', ORDER, '/orders/1042'],
    ['repair', REPAIR, '/repairs/r-1042'],
  ])('opens a %s link for an authenticated user', (_label, intent, route) => {
    expect(decideForIntent(intent, { authStatus: 'authenticated' })).toEqual({
      action: 'navigate',
      route,
      intent,
    });
  });

  it.each([
    ['order', ORDER],
    ['repair', REPAIR],
  ])('sends an anonymous user to sign in for a %s link', (_label, intent) => {
    expect(decideForIntent(intent, { authStatus: 'unauthenticated' })).toEqual({
      action: 'authenticate',
      route: '/(auth)/login',
      intent,
    });
  });

  it('WAITS while the session is still being restored', () => {
    // Cold start: deciding now would bounce an already-authenticated user
    // through the login screen for no reason.
    expect(decideForIntent(ORDER, { authStatus: 'loading' })).toEqual({
      action: 'wait',
      intent: ORDER,
    });
  });

  it('reports auth-unavailable rather than showing a useless login form', () => {
    // A release build with no auth contract cannot honour a private link.
    expect(decideForIntent(ORDER, { authStatus: 'unavailable' })).toEqual({
      action: 'auth-unavailable',
      intent: ORDER,
    });
  });

  it('treats a temporarily unreachable server as "not signed in yet"', () => {
    // Credentials may still be valid; the auth screen explains itself.
    expect(decideForIntent(REPAIR, { authStatus: 'temporarily-unavailable' })).toEqual({
      action: 'authenticate',
      route: '/(auth)/login',
      intent: REPAIR,
    });
  });

  it('NEVER navigates straight to a private route without a session', () => {
    // The core of DEC-MOBILE-004. A link naming a resource proves nothing.
    for (const status of ['unauthenticated', 'unavailable', 'loading'] as AuthStatus[]) {
      const decision = decideForIntent(ORDER, { authStatus: status });
      expect(decision.action).not.toBe('navigate');
    }
  });
});

describe('secure tracking', () => {
  it.each<AuthStatus>(['authenticated', 'unauthenticated', 'unavailable'])(
    'reports feature-unavailable for a tracking link (%s)',
    (authStatus) => {
      // No backend contract exists (BR-008). Fabricating a screen would be
      // presenting invented data as a customer's real repair.
      expect(decideForIntent(TRACKING, { authStatus })).toEqual({
        action: 'feature-unavailable',
        intent: TRACKING,
      });
    },
  );
});

describe('decideForUrl', () => {
  it('parses and decides in one step', () => {
    expect(decideForUrl(link('products/abc'), { authStatus: 'unauthenticated' })).toEqual({
      action: 'navigate',
      route: '/products/abc',
      intent: { kind: 'product', slug: 'abc' },
    });
  });

  it('rejects a hostile URL before any auth reasoning happens', () => {
    expect(decideForUrl('javascript:alert(1)', { authStatus: 'authenticated' })).toEqual({
      action: 'reject',
      reason: 'unsupported-scheme',
    });
  });

  it('rejects a cross-tenant link even for an authenticated user', () => {
    // Being signed in to company A grants nothing in company B.
    const decision = decideForUrl(link('orders/1?company=otra-empresa'), {
      authStatus: 'authenticated',
    });
    expect(decision).toEqual({ action: 'reject', reason: 'tenant-mismatch' });
  });

  it('never leaks the raw URL into the decision', () => {
    const decision = decideForUrl(link('track/secretCredential123'), {
      authStatus: 'authenticated',
    });
    expect(JSON.stringify(decision)).not.toContain('secretCredential123');
  });
});

describe('pending destination', () => {
  it('holds the destination ONLY when sending the user to authenticate', () => {
    const store = createPendingIntentStore();

    applyDecisionToPending(
      { action: 'authenticate', route: '/(auth)/login', intent: ORDER },
      store,
    );

    expect(store.peek()).toEqual(ORDER);
  });

  it('holds nothing after a straight navigation', () => {
    const store = createPendingIntentStore();
    store.set(ORDER);

    applyDecisionToPending(
      { action: 'navigate', route: '/products/x', intent: PRODUCT },
      store,
    );

    // A destination that outlives its decision is one that reopens unexpectedly.
    expect(store.peek()).toBeNull();
  });

  it('holds nothing after a rejection', () => {
    const store = createPendingIntentStore();
    store.set(ORDER);

    applyDecisionToPending({ action: 'reject', reason: 'malformed' }, store);

    expect(store.peek()).toBeNull();
  });

  it('leaves the slot untouched while waiting for auth to settle', () => {
    const store = createPendingIntentStore();
    store.set(ORDER);

    applyDecisionToPending({ action: 'wait', intent: ORDER }, store);

    // The same link will be decided again once the session resolves.
    expect(store.peek()).toEqual(ORDER);
  });

  it('can be consumed exactly once', () => {
    const store = createPendingIntentStore();
    store.set(REPAIR);

    expect(store.consume()).toEqual(REPAIR);
    // Read-and-clear: otherwise the same screen reopens on the next auth change.
    expect(store.consume()).toBeNull();
  });

  it('keeps only ONE destination — a newer link supersedes the older', () => {
    const store = createPendingIntentStore();
    store.set(ORDER);
    store.set(REPAIR);

    // A queue would eventually open a screen the user asked for minutes ago.
    expect(store.consume()).toEqual(REPAIR);
    expect(store.peek()).toBeNull();
  });

  it('stores the parsed intent, never a raw URL or credential', () => {
    const store = createPendingIntentStore();
    const decision = decideForUrl(link('orders/1042?utm=abc'), {
      authStatus: 'unauthenticated',
    });
    applyDecisionToPending(decision, store);

    const serialized = JSON.stringify(store.peek());
    expect(serialized).not.toContain('://');
    expect(serialized).not.toContain('utm');
    expect(serialized).toContain('1042');
  });
});
