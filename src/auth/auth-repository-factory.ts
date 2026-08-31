import { ApiAuthRepository } from './api-auth-repository';
import { authRuntimePolicy, type AuthRuntimePolicy } from './auth-policy';
import type { AuthRepository } from './auth-repository';
import { getAuthRuntime } from './auth-runtime';
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
 *     backend      → ApiAuthRepository    (M3 — /api/v1/auth/, origin/master 7c55ebc)
 *     unavailable  → null
 *
 * `null` is a real answer, not a failure. The UI renders an "acceso no
 * disponible" state instead of a form that cannot work — including the case
 * where the contract EXISTS but this build has no API url to send it to.
 *
 * M3 — the backend branch became real. The whole token machine is assembled
 * here, once, so that exactly one object graph owns the vault and the access
 * store: two coordinators over the same Keychain entry would rotate the refresh
 * token against each other.
 */
export function resolveAuthRepository(
  policy: AuthRuntimePolicy = authRuntimePolicy,
): AuthRepository | null {
  switch (policy.mode) {
    case 'mock':
      return new MockAuthRepository();
    case 'backend':
      return buildApiAuthRepository();
    case 'unavailable':
      return null;
  }
}

/**
 * The real repository, over the SHARED token graph.
 *
 * M4 FIX — this used to build its own access token store while
 * `authenticatedRequest` read the module-level singleton. Sign-in installed a
 * token into one and every private request looked in the other. Nothing called
 * an authenticated endpoint in M3, so the two-stores bug was invisible until
 * there was something to fetch. See `auth-runtime.ts`.
 */
function buildApiAuthRepository(): AuthRepository {
  const { transport, vault, accessTokens, coordinator } = getAuthRuntime();
  return new ApiAuthRepository({ transport, vault, accessTokens, coordinator });
}
