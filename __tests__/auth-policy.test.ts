import { resolveAuthRuntimePolicy } from '@/auth/auth-policy';
import { resolveAuthRepository } from '@/auth/auth-repository-factory';
import { MockAuthRepository } from '@/auth/mock-auth-repository';
import type { AppEnvironment } from '@/config/env';

/**
 * M1 — a distributable build must never accept fictitious credentials.
 *
 * The risk closed here: `AuthProvider` used to default to
 * `new MockAuthRepository()`. In a release that meant "type anything, get in".
 * Nothing behind the door leaked (M0.1/M0.2 already withheld it), but an app
 * that accepts a password it cannot verify teaches users the login works and is
 * one refactor away from being the real front door.
 */

const NO_BACKEND = { backendAuthAvailable: false };

describe('resolveAuthRuntimePolicy — production', () => {
  it.each([true, false])('NEVER uses mock auth, mocksEnabled=%p', (mocksEnabled) => {
    const policy = resolveAuthRuntimePolicy({
      environment: 'production',
      ...NO_BACKEND,
      mocksEnabled,
    });
    expect(policy.mode).toBe('unavailable');
    expect(policy.decision).toBe('unavailable-production-mock-forbidden');
  });

  it('uses the real backend once a contract exists', () => {
    const policy = resolveAuthRuntimePolicy({
      environment: 'production',
      backendAuthAvailable: true,
      mocksEnabled: false,
    });
    expect(policy.mode).toBe('backend');
  });
});

describe('resolveAuthRuntimePolicy — staging', () => {
  it('is unavailable by default', () => {
    const policy = resolveAuthRuntimePolicy({
      environment: 'staging',
      ...NO_BACKEND,
      mocksEnabled: false,
    });
    expect(policy.mode).toBe('unavailable');
    expect(policy.decision).toBe('unavailable-mock-not-authorised');
  });

  it('allows mock auth only through the explicit staging opt-in', () => {
    // `mocksEnabled` is already an explicit `=true` in staging (M0.1), so no
    // second variable is invented here.
    const policy = resolveAuthRuntimePolicy({
      environment: 'staging',
      ...NO_BACKEND,
      mocksEnabled: true,
    });
    expect(policy.mode).toBe('mock');
    expect(policy.decision).toBe('mock-staging-explicit');
  });
});

describe('resolveAuthRuntimePolicy — development', () => {
  it('uses mock auth so the app is navigable after a clone', () => {
    const policy = resolveAuthRuntimePolicy({
      environment: 'development',
      ...NO_BACKEND,
      mocksEnabled: true,
    });
    expect(policy.mode).toBe('mock');
    expect(policy.decision).toBe('mock-development');
  });

  it('is unavailable when real auth is wanted but no contract exists', () => {
    // Turning mocks off must not silently fall through to something fake.
    const policy = resolveAuthRuntimePolicy({
      environment: 'development',
      ...NO_BACKEND,
      mocksEnabled: false,
    });
    expect(policy.mode).toBe('unavailable');
    expect(policy.decision).toBe('unavailable-no-contract');
  });
});

describe('resolveAuthRepository — composition root', () => {
  const policy = (environment: AppEnvironment, mocksEnabled: boolean) =>
    resolveAuthRuntimePolicy({ environment, ...NO_BACKEND, mocksEnabled });

  it('builds the mock repository in development', () => {
    expect(resolveAuthRepository(policy('development', true))).toBeInstanceOf(MockAuthRepository);
  });

  it('builds NO repository in production', () => {
    // The M1 fix, at the composition root.
    expect(resolveAuthRepository(policy('production', true))).toBeNull();
  });

  it('builds NO repository in staging without the opt-in', () => {
    expect(resolveAuthRepository(policy('staging', false))).toBeNull();
  });

  it('never returns a MockAuthRepository for a release environment', () => {
    for (const environment of ['staging', 'production'] as const) {
      for (const mocksEnabled of [true, false]) {
        const repository = resolveAuthRepository(policy(environment, mocksEnabled));
        if (environment === 'production') {
          expect(repository).toBeNull();
        }
        expect(repository).not.toBe(undefined);
      }
    }
  });

  it('refuses to pretend a backend repository exists', () => {
    // Flipping the readiness flag without shipping the transport must fail
    // loudly rather than returning null and looking like a policy decision.
    expect(() =>
      resolveAuthRepository({
        mode: 'backend',
        decision: 'backend-contract-ready',
        reason: 'test',
      }),
    ).toThrow(/ApiAuthRepository no existe/);
  });
});

describe('MockAuthRepository', () => {
  it('accepts any well-formed credentials and marks the session as mock', async () => {
    const session = await new MockAuthRepository().signIn({
      identifier: 'carlos@example.com',
      password: 'cualquier-cosa',
    });
    expect(session.mode).toBe('mock');
    expect(session.user.email).toBe('carlos@example.com');
  });

  it('never restores a session on cold start', async () => {
    // A fake session must not survive a relaunch and be mistaken for a real one.
    await expect(new MockAuthRepository().restoreSession()).resolves.toBeNull();
  });

  it('produces no tenant context', async () => {
    // A mock has no server-validated company. Inventing one would be the
    // "slug equals authority" mistake the tenant model exists to prevent.
    const session = await new MockAuthRepository().signIn({
      identifier: 'carlos@example.com',
      password: 'x',
    });
    expect(session.tenant).toBeNull();
  });

  it('keeps no credential anywhere on the session', async () => {
    const session = await new MockAuthRepository().signIn({
      identifier: 'carlos@example.com',
      password: 'unaClaveSecreta',
    });
    const serialized = JSON.stringify(session);
    expect(serialized).not.toContain('unaClaveSecreta');
    expect(serialized).not.toMatch(/token/i);
  });
});
