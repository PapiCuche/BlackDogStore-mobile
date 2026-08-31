import { authRuntimePolicy, type AuthRuntimePolicy } from './auth-policy';
import type { AuthRepository } from './auth-repository';
import { MockAuthRepository } from './mock-auth-repository';

/**
 * Auth composition root.
 *
 * The ONE place that decides which authentication implementation exists, in the
 * same spirit as `src/repositories/index.ts` for data.
 *
 * M1 CHANGE — `AuthProvider` used to do `new MockAuthRepository()` as a default
 * parameter. That is a decision buried in a component's signature, and it meant
 * a release build shipped a working fake login: type anything, get in. Every
 * feature behind the door was already withheld by M0.1/M0.2, so nothing leaked
 * — but a distributable app must not accept credentials it cannot verify.
 *
 *     mock         → MockAuthRepository   (development, or staging opt-in)
 *     backend      → ApiAuthRepository    (DOES NOT EXIST — BR-001)
 *     unavailable  → null
 *
 * `null` is a real answer, not a failure. The UI renders an "acceso no
 * disponible" state instead of a form that cannot work.
 */
export function resolveAuthRepository(
  policy: AuthRuntimePolicy = authRuntimePolicy,
): AuthRepository | null {
  switch (policy.mode) {
    case 'mock':
      return new MockAuthRepository();
    case 'backend':
      // Intentionally unreachable today: `isBackendAuthAvailable` is a
      // source-level `false` and only flips in the commit that adds the
      // transport. Throwing rather than returning null makes the gap loud if
      // someone flips the flag without shipping the implementation.
      throw new Error(
        'ApiAuthRepository no existe todavía. Ver BR-001 en docs/BACKEND_REQUIREMENTS.md.',
      );
    case 'unavailable':
      return null;
  }
}
