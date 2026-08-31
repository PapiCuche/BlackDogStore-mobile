import {
  isApiConfigured,
  isBackendAuthAvailable,
  mockDataPolicy,
  type AppEnvironment,
} from '@/config/env';
import { appEnvironment } from '@/config/env';

/**
 * Which authentication mechanism this build is allowed to use.
 *
 * M1 applies to AUTH the same fail-safe rule M0.1 applied to mock data and M0.2
 * applied to the legacy catalogue: a MISSING or ambiguous configuration
 * resolves to the strict answer.
 *
 * The specific risk this closes: `AuthProvider` used to construct
 * `new MockAuthRepository()` unconditionally. In a release build that meant
 *
 *     the user types anything → the mock accepts → status = authenticated
 *
 * and the app opened. Every feature behind it was already withheld by M0.1/M0.2,
 * so no real data leaked — but a distributable app that accepts fictitious
 * credentials is not something to ship regardless of what lies behind the door.
 * It teaches users the login works, and it is one refactor away from being the
 * real front door.
 */

export type AuthMode =
  /** Fixtures. Accepts any well-formed credentials. Development only. */
  | 'mock'
  /** A real backend contract. Requires `isBackendAuthAvailable`. */
  | 'backend'
  /** No authentication mechanism at all in this build. */
  | 'unavailable';

export type AuthPolicyDecision =
  | 'backend-contract-ready'
  | 'mock-development'
  | 'mock-staging-explicit'
  | 'unavailable-no-contract'
  | 'unavailable-api-not-configured'
  | 'unavailable-mock-not-authorised'
  | 'unavailable-production-mock-forbidden';

export type AuthRuntimePolicy = {
  mode: AuthMode;
  decision: AuthPolicyDecision;
  /** Diagnostic sentence. Development surfaces only — never shown to a customer. */
  reason: string;
};

/**
 * Resolve the authentication mode.
 *
 * | Environment | contract | API url | mocks | Result |
 * |---|---|---|---|---|
 * | any         | yes | set    | any | `backend` |
 * | any         | yes | UNSET  | any | **`unavailable`** |
 * | production  | no  | any    | any | **`unavailable`** — never mock |
 * | staging     | no  | any    | explicit opt-in | `mock` |
 * | staging     | no  | any    | off | `unavailable` |
 * | development | no  | any    | on  | `mock` |
 * | development | no  | any    | off | `unavailable` |
 *
 * M3 ADDED THE API URL CONDITION. Shipping the transport made
 * `isBackendAuthAvailable` true, and true means "this build can SPEAK the
 * contract" — not "this build knows where the server is". Without those being
 * separate, a release missing `EXPO_PUBLIC_API_BASE_URL` would render a login
 * form whose submit button can only ever fail, which teaches the user their
 * password is wrong.
 *
 * Production is checked BEFORE the mock branch so that no combination of
 * variables can reach `mock` there. `mockDataPolicy` already refuses to enable
 * mocks in production at all (M0.1), which makes this a second, independent
 * barrier rather than a duplicate: two separate rules would both have to be
 * wrong for a store build to accept a fake login. A missing API url NEVER falls
 * back to mocks either — not being able to reach the server is not a licence to
 * fabricate a session.
 */
export function resolveAuthRuntimePolicy(input: {
  environment: AppEnvironment;
  backendAuthAvailable: boolean;
  apiConfigured: boolean;
  mocksEnabled: boolean;
}): AuthRuntimePolicy {
  if (input.backendAuthAvailable) {
    if (!input.apiConfigured) {
      return {
        mode: 'unavailable',
        decision: 'unavailable-api-not-configured',
        reason:
          'Hay contrato de autenticación nativo, pero EXPO_PUBLIC_API_BASE_URL no está definido: no hay servidor al que enviar las credenciales.',
      };
    }
    return {
      mode: 'backend',
      decision: 'backend-contract-ready',
      reason: 'Contrato de autenticación nativo disponible.',
    };
  }

  if (input.environment === 'production') {
    return {
      mode: 'unavailable',
      decision: 'unavailable-production-mock-forbidden',
      reason:
        'No hay contrato de autenticación nativo. Una build de producción nunca acepta autenticación simulada.',
    };
  }

  if (!input.mocksEnabled) {
    return {
      mode: 'unavailable',
      decision:
        input.environment === 'staging'
          ? 'unavailable-mock-not-authorised'
          : 'unavailable-no-contract',
      reason:
        'No hay contrato de autenticación nativo y los datos de ejemplo están desactivados.',
    };
  }

  return input.environment === 'staging'
    ? {
        mode: 'mock',
        decision: 'mock-staging-explicit',
        reason:
          'Autenticación simulada habilitada explícitamente en staging. No es una sesión real.',
      }
    : {
        mode: 'mock',
        decision: 'mock-development',
        reason: 'Autenticación simulada de desarrollo. No es una sesión real.',
      };
}

export const authRuntimePolicy: AuthRuntimePolicy = resolveAuthRuntimePolicy({
  environment: appEnvironment,
  backendAuthAvailable: isBackendAuthAvailable,
  apiConfigured: isApiConfigured,
  mocksEnabled: mockDataPolicy.enabled,
});

/** True when the app can attempt a real, credential-bearing request. */
export const isRealAuthEnabled: boolean = authRuntimePolicy.mode === 'backend';

/** True when the login form should be shown at all. */
export const isAuthInteractive: boolean = authRuntimePolicy.mode !== 'unavailable';
