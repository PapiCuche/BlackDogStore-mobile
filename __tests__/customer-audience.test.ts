import { assertBearerAllowed, BearerScopeViolationError } from '@/api/api-scope';
import type { AuthRuntimePolicy } from '@/auth/auth-policy';
import { privateActionState } from '@/features/auth/private-action-gate';
import { queryKeys, CUSTOMER_AUDIENCE, INTERNAL_AUDIENCE } from '@/providers/query-client';
import { makeQueryScope } from '@/providers/query-scope';
import { isPrivateQueryKey } from '@/providers/query-scope';
import type { AuthStatus } from '@/auth/types';

/**
 * M4 — the audience boundary, on the client side.
 *
 * DEC-MOBILE-007: customer and internal are separate audiences. The server
 * enforces it (they are separate URL spaces with separate permissions); these
 * tests pin down that the app does not blur it while drawing.
 */

/**
 * `privateActionState` is a pure function, but it lives beside the component
 * that renders its outcome — and importing that module pulls in `expo-router`,
 * which drags `standard-navigation` through a transform Jest is not configured
 * for. Nothing here navigates, so the router is stubbed at the boundary.
 */
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const MOCK_POLICY: AuthRuntimePolicy = {
  mode: 'mock',
  decision: 'mock-development',
  reason: 'test',
};
const BACKEND_POLICY: AuthRuntimePolicy = {
  mode: 'backend',
  decision: 'backend-contract-ready',
  reason: 'test',
};
const UNAVAILABLE_POLICY: AuthRuntimePolicy = {
  mode: 'unavailable',
  decision: 'unavailable-api-not-configured',
  reason: 'test',
};

function loadRepositories(policy: AuthRuntimePolicy, mocksEnabled: boolean) {
  let repositories!: typeof import('@/repositories').repositories;
  let MockOrderRepository!: new () => unknown;
  let V1CustomerOrderRepository!: new (deps: never) => unknown;

  jest.isolateModules(() => {
    jest.doMock('@/auth/auth-policy', () => ({
      ...jest.requireActual('@/auth/auth-policy'),
      authRuntimePolicy: policy,
    }));
    jest.doMock('@/config/env', () => ({
      ...jest.requireActual('@/config/env'),
      useMockData: mocksEnabled,
      isPilotTenant: true,
    }));
    ({ repositories } = require('@/repositories'));
    ({ MockOrderRepository } = require('@/repositories/mock/mock-order-repository'));
    ({ V1CustomerOrderRepository } = require(
      '@/repositories/api/v1-customer-order-repository'
    ));
  });

  return { repositories, MockOrderRepository, V1CustomerOrderRepository };
}

afterEach(() => {
  jest.resetModules();
  jest.dontMock('@/auth/auth-policy');
  jest.dontMock('@/config/env');
});

describe('composition — where a customer’s orders come from', () => {
  it('builds the REAL repository in backend mode', () => {
    const { repositories, V1CustomerOrderRepository } = loadRepositories(BACKEND_POLICY, false);

    expect(repositories.orders).toBeInstanceOf(V1CustomerOrderRepository);
  });

  it('keeps the mock repository in development with mocks on', () => {
    // The M4 fix in `resolveAuthRuntimePolicy`: shipping the contract must not
    // make a `git clone` require a running Django to see the demo.
    const { repositories, MockOrderRepository } = loadRepositories(MOCK_POLICY, true);

    expect(repositories.orders).toBeInstanceOf(MockOrderRepository);
  });

  it('builds NOTHING when this build cannot authenticate', () => {
    // A private record needs a session. No session mechanism, no repository —
    // not a screen that pretends otherwise.
    const { repositories } = loadRepositories(UNAVAILABLE_POLICY, true);

    expect(repositories.orders).toBeNull();
  });

  it('never falls back to MOCK orders in backend mode', () => {
    // Fabricated purchases in front of a real customer is the worst outcome
    // available here.
    const { repositories, MockOrderRepository } = loadRepositories(BACKEND_POLICY, true);

    expect(repositories.orders).not.toBeInstanceOf(MockOrderRepository);
  });
});

describe('cache keys keep the audiences apart', () => {
  const scope = makeQueryScope({ tenantSlug: 'blackdog', userId: 42 });

  it('namespaces orders under the CUSTOMER audience', () => {
    expect(queryKeys.orders(scope)).toContain(CUSTOMER_AUDIENCE);
  });

  it('never uses the internal audience for a customer query', () => {
    // The dangerous direction: internal data landing in a customer view because
    // both wrote the same key.
    for (const key of [
      queryKeys.orders(scope),
      queryKeys.order(scope, 1),
      queryKeys.repairs(scope),
      queryKeys.repair(scope, 'r-1'),
    ]) {
      expect(key).not.toContain(INTERNAL_AUDIENCE);
    }
  });

  it('keeps orders PRIVATE, so logout evicts them', () => {
    expect(isPrivateQueryKey(queryKeys.orders(scope))).toBe(true);
  });

  it('gives two users different keys', () => {
    const other = makeQueryScope({ tenantSlug: 'blackdog', userId: 77 });

    expect(queryKeys.orders(scope)).not.toEqual(queryKeys.orders(other));
  });

  it('gives two tenants different keys', () => {
    const other = makeQueryScope({ tenantSlug: 'otra', userId: 42 });

    expect(queryKeys.orders(scope)).not.toEqual(queryKeys.orders(other));
  });

  it('keeps the public catalogue out of the private namespace', () => {
    expect(isPrivateQueryKey(queryKeys.products(scope))).toBe(false);
    expect(queryKeys.products(scope)).not.toContain(CUSTOMER_AUDIENCE);
  });
});

describe('the private action gate', () => {
  it.each<[AuthStatus, string]>([
    ['authenticated', 'ready'],
    ['loading', 'pending'],
    ['unauthenticated', 'sign-in-required'],
    ['temporarily-unavailable', 'connection-required'],
    ['unavailable', 'unavailable'],
  ])('maps %s to %s', (status, expected) => {
    expect(privateActionState(status)).toBe(expected);
  });

  it('does NOT send a user with a live session to sign in again', () => {
    // `temporarily-unavailable` means the credentials are good and the server
    // is unreachable. A login form would ask for a password that was never the
    // problem.
    expect(privateActionState('temporarily-unavailable')).not.toBe('sign-in-required');
  });

  it('never reports ready without a session', () => {
    for (const status of [
      'loading', 'unauthenticated', 'temporarily-unavailable', 'unavailable',
    ] as AuthStatus[]) {
      expect(privateActionState(status)).not.toBe('ready');
    }
  });
});

describe('the Bearer token stays on the versioned surface', () => {
  it('allows the customer surface', () => {
    expect(() =>
      assertBearerAllowed('/api/v1/customer/blackdog/orders/', 'authenticated-v1'),
    ).not.toThrow();
  });

  it('refuses the LEGACY orders endpoint', () => {
    // `/api/orders/` authenticates by cookie + CSRF. Sending a Bearer there is
    // a credential handed to a contract that never agreed to receive it.
    expect(() => assertBearerAllowed('/api/orders/', 'authenticated-v1')).toThrow(
      BearerScopeViolationError,
    );
  });

  it('refuses the legacy admin orders endpoint', () => {
    expect(() => assertBearerAllowed('/api/admin/orders/', 'authenticated-v1')).toThrow(
      BearerScopeViolationError,
    );
  });

  it('refuses to send a Bearer to the PUBLIC catalogue', () => {
    expect(() =>
      assertBearerAllowed('/api/v1/storefront/blackdog/products/', 'public'),
    ).toThrow(BearerScopeViolationError);
  });
});
