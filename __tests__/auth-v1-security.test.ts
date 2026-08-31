import { assertBearerAllowed, BearerScopeViolationError } from '@/api/api-scope';
import { decideForIntent } from '@/linking/deep-link-coordinator';
import type { DeepLinkIntent } from '@/linking/types';

/**
 * M3 — the security boundary now that a real token exists.
 *
 * Up to here a Bearer token was hypothetical, so the scope guard was a rule
 * about nothing. From this phase the app actually holds one.
 */

const ORDER: DeepLinkIntent = { kind: 'order', orderId: '1042' };
const PRODUCT: DeepLinkIntent = { kind: 'product', slug: 'iphone-15' };

describe('a Bearer token reaches ONLY the native contract', () => {
  it.each([
    '/api/v1/auth/me/',
    '/api/v1/orders/',
    '/api/v1/repairs/r-1/',
  ])('allows the versioned surface (%s)', (path) => {
    expect(() => assertBearerAllowed(path, 'authenticated-v1')).not.toThrow();
  });

  it.each([
    '/api/auth/me/',
    '/api/auth/login/',
    '/api/admin/users/',
    '/api/me/memberships/',
  ])('refuses the legacy web surface (%s)', (path) => {
    // The backend agrees — those endpoints authenticate by cookie and ignore a
    // Bearer header — but the client refuses to SEND it in the first place. A
    // credential handed to a contract that never agreed to receive it is a leak
    // whether or not that contract happens to look at it.
    expect(() => assertBearerAllowed(path, 'authenticated-v1')).toThrow(BearerScopeViolationError);
  });

  it('refuses the public catalogue, which is anonymous by design', () => {
    expect(() => assertBearerAllowed('/api/v1/storefront/blackdog/products/', 'public')).toThrow(
      BearerScopeViolationError,
    );
  });

  it('refuses a correctly scoped call whose PATH is wrong', () => {
    // Two independent conditions. A mislabelled call and a correctly labelled
    // call whose path later changed have both leaked credentials elsewhere.
    expect(() => assertBearerAllowed('/api/products/', 'authenticated-v1')).toThrow(
      BearerScopeViolationError,
    );
  });

  it('never includes the token in the violation message', () => {
    try {
      assertBearerAllowed('/api/auth/me/', 'authenticated-v1');
    } catch (error) {
      expect((error as Error).message).toContain('/api/auth/me/');
      expect((error as Error).message).not.toMatch(/eyJ/);
    }
  });
});

describe('being signed in is not the same as belonging here', () => {
  it('opens a private destination when the server verified this company', () => {
    const decision = decideForIntent(ORDER, {
      authStatus: 'authenticated',
      hasActiveCompany: true,
    });

    expect(decision.action).toBe('navigate');
  });

  it('does NOT open one when the server listed no relation with this company', () => {
    // The account is real and has nothing to do with this business. Every
    // private screen would come back empty or forbidden.
    const decision = decideForIntent(ORDER, {
      authStatus: 'authenticated',
      hasActiveCompany: false,
    });

    expect(decision.action).toBe('feature-unavailable');
  });

  it('still opens PUBLIC destinations without a company relation', () => {
    // The catalogue never needed a relation, let alone a session.
    const decision = decideForIntent(PRODUCT, {
      authStatus: 'authenticated',
      hasActiveCompany: false,
    });

    expect(decision.action).toBe('navigate');
  });

  it('behaves exactly as before when the context is unknown', () => {
    // Every caller predating M3 passes no tenant context, and must keep working.
    expect(decideForIntent(ORDER, { authStatus: 'authenticated' }).action).toBe('navigate');
  });

  it('is a LOCAL sanity check, not authorization', () => {
    // The decision carries no claim the app could present to a server as proof.
    const decision = decideForIntent(ORDER, {
      authStatus: 'authenticated',
      hasActiveCompany: true,
    });

    expect(JSON.stringify(decision)).not.toContain('hasActiveCompany');
    expect(JSON.stringify(decision)).not.toContain('company');
  });

  it('does not let a missing relation turn into a login loop', () => {
    // Sending them to sign in again would be absurd: they ARE signed in.
    const decision = decideForIntent(ORDER, {
      authStatus: 'authenticated',
      hasActiveCompany: false,
    });

    expect(decision.action).not.toBe('authenticate');
  });
});
