import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Runtime configuration.
 *
 * SECURITY: every `EXPO_PUBLIC_*` variable is inlined into the JavaScript
 * bundle at build time and is therefore PUBLIC. Anyone with the .ipa/.apk can
 * read it. Nothing secret may be added to this file — no Stripe secret key, no
 * Django SECRET_KEY, no signing credential. See docs/MOBILE_AUTH.md.
 *
 * FAIL-SAFE PRINCIPLE (M0.1): a release build must never acquire a permissive
 * behaviour because a variable was FORGOTTEN. Missing configuration in a
 * release resolves to the strict answer — no mocks, no tenant — and the app
 * reports an invalid configuration instead of inventing a plausible one.
 *
 * The resolution rules are pure functions, exported so they can be tested
 * directly. The module-level constants below are just those functions applied
 * to the real environment once, at import time.
 */

export type AppEnvironment = 'development' | 'staging' | 'production';

// ─── Environment ────────────────────────────────────────────────────────────

/**
 * `__DEV__` is the honest signal for a Metro/dev-client build. Staging and
 * production are both release builds, so only an explicit variable separates
 * them — and an UNSET variable resolves to `production`, the strictest of the
 * two, on purpose.
 */
export function resolveAppEnvironment(input: {
  isDev: boolean;
  appEnv: string | undefined;
}): AppEnvironment {
  if (input.isDev) return 'development';
  return input.appEnv?.trim() === 'staging' ? 'staging' : 'production';
}

export const appEnvironment: AppEnvironment = resolveAppEnvironment({
  isDev: __DEV__,
  appEnv: process.env.EXPO_PUBLIC_APP_ENV,
});

/** True for any build that is not a local development build. */
export const isReleaseBuild: boolean = appEnvironment !== 'development';

// ─── Mock data ──────────────────────────────────────────────────────────────

export type MockDataPolicy = {
  enabled: boolean;
  /**
   * Why the app is (or is not) on mocks. Surfaced in Profile so nobody has to
   * guess whether a screen is showing real data.
   */
  reason:
    | 'development-default'
    | 'development-opt-out'
    | 'staging-explicit-opt-in'
    | 'release-default-off'
    | 'production-forbidden';
};

/**
 * Whether this build may serve fixtures instead of the backend.
 *
 * | Environment | Variable unset | `=true`            | `=false` |
 * |-------------|----------------|--------------------|----------|
 * | development | MOCKS          | mocks              | API      |
 * | staging     | **API**        | mocks (opt-in)     | API      |
 * | production  | **API**        | **API** (refused)  | API      |
 *
 * Two rules matter here, and both exist because of the same failure mode — a
 * release shipping fake data because somebody forgot a variable:
 *
 *  1. In a release, the DEFAULT is off. Silence means "use the real backend".
 *  2. In production, mocks are refused OUTRIGHT. There is no variable value
 *     that turns them on. A store build showing a fabricated repair or order to
 *     a customer is not a configuration mistake we are willing to make
 *     reachable — so it is not reachable.
 */
export function resolveMockDataPolicy(input: {
  environment: AppEnvironment;
  raw: string | undefined;
}): MockDataPolicy {
  const value = input.raw?.trim().toLowerCase();

  if (input.environment === 'production') {
    // Deliberately ignores `value` entirely.
    return { enabled: false, reason: 'production-forbidden' };
  }

  if (input.environment === 'staging') {
    return value === 'true'
      ? { enabled: true, reason: 'staging-explicit-opt-in' }
      : { enabled: false, reason: 'release-default-off' };
  }

  return value === 'false'
    ? { enabled: false, reason: 'development-opt-out' }
    : { enabled: true, reason: 'development-default' };
}

export const mockDataPolicy: MockDataPolicy = resolveMockDataPolicy({
  environment: appEnvironment,
  raw: process.env.EXPO_PUBLIC_USE_MOCK_DATA,
});

/** Whether the app is currently reading fixtures rather than the backend. */
export const useMockData: boolean = mockDataPolicy.enabled;

// ─── Tenant ─────────────────────────────────────────────────────────────────

/** The pilot tenant's slug. Only ever assumed in a development build. */
export const PILOT_COMPANY_SLUG = 'blackdog';

export type TenantConfig =
  | { status: 'resolved'; slug: string; source: 'environment' | 'development-pilot' }
  | { status: 'missing' };

/**
 * Which tenant this build is the storefront for.
 *
 * A SaaS app must not silently become Black Dog Store because a variable was
 * left blank. In a release, an unset slug is a CONFIGURATION ERROR, reported as
 * `{ status: 'missing' }` — never substituted with the pilot, and never guessed
 * from anything else.
 *
 * The pilot default survives only in development, where it is what makes the
 * app runnable straight after `git clone`.
 */
export function resolveTenant(input: {
  environment: AppEnvironment;
  raw: string | undefined;
}): TenantConfig {
  const slug = input.raw?.trim().toLowerCase();
  if (slug) return { status: 'resolved', slug, source: 'environment' };

  if (input.environment === 'development') {
    return { status: 'resolved', slug: PILOT_COMPANY_SLUG, source: 'development-pilot' };
  }
  return { status: 'missing' };
}

export const tenant: TenantConfig = resolveTenant({
  environment: appEnvironment,
  raw: process.env.EXPO_PUBLIC_COMPANY_SLUG,
});

/**
 * The tenant slug, or null when unresolved.
 *
 * Nullable on purpose: a caller has to decide what to do without a tenant
 * rather than receive a plausible-looking wrong one.
 */
export const companySlug: string | null = tenant.status === 'resolved' ? tenant.slug : null;

/** True when this build is the pilot tenant running on bundled pilot data. */
export const isPilotTenant: boolean =
  tenant.status === 'resolved' && tenant.slug === PILOT_COMPANY_SLUG;

// ─── Legacy catalog gate ────────────────────────────────────────────────────

/**
 * Where the catalogue may come from in this build.
 *
 * M0.2 added this because "not mock" did NOT mean "safe". The composition root
 * used to read `useMockData ? Mock : Api`, so a single
 * `EXPO_PUBLIC_USE_MOCK_DATA=false` was enough to point a RELEASE build at the
 * legacy Django catalogue.
 *
 * That endpoint is public and works — and it is NOT tenant-safe. Verified on
 * `PapiCuche/BlackDogStore-web` @ `origin/master` `2624d478`:
 *
 *   ProductViewSet.get_queryset  →  Product.objects…filter(is_active=True)
 *   CategoryViewSet.queryset     →  Category.objects.all()
 *
 * Neither `Product` nor `Category` has a `company` field there, and the
 * backend's own docstring says of its host-based resolver: "DESIGNED, not yet
 * wired up … no public view calls it yet". So a multi-tenant mobile client
 * pointed at it would receive EVERY company's products — a cross-tenant leak,
 * even though the endpoint is public.
 *
 * The gate therefore FAILS CLOSED: the legacy catalogue is reachable only from
 * a development build that asks for it by name.
 */
export type CatalogSource =
  /** Bundled fixtures. */
  | 'mock'
  /** The real, legacy, NOT tenant-safe Django catalogue. */
  | 'legacy-api'
  /** No catalogue at all in this build. */
  | 'none';

export type LegacyCatalogDecision =
  /** Mocks are on; the legacy flag is irrelevant. */
  | 'mock-active'
  /** Development build that explicitly opted in. */
  | 'legacy-development-explicit'
  /** Development build that did not opt in. */
  | 'legacy-disabled'
  /** Release build. Refused regardless of the flag. */
  | 'legacy-forbidden-release';

export type LegacyCatalogPolicy = {
  source: CatalogSource;
  decision: LegacyCatalogDecision;
  /** Diagnostic sentence for Profile. Not shown to customers. */
  reason: string;
};

/**
 * Decide where the catalogue comes from.
 *
 * | Environment | mocks | `ENABLE_LEGACY_CATALOG` | Result |
 * |---|---|---|---|
 * | development | on   | any    | `mock` |
 * | development | off  | unset  | `none` |
 * | development | off  | `true` | `legacy-api` |
 * | staging     | off  | `true` | **`none`** |
 * | production  | off  | `true` | **`none`** |
 *
 * The release rows are the point: the flag is not a switch a release can flip.
 * It is ignored there, and `collectConfigurationIssues` reports the attempt.
 */
export function resolveLegacyCatalogPolicy(input: {
  environment: AppEnvironment;
  mocksEnabled: boolean;
  legacyFlag: string | undefined;
}): LegacyCatalogPolicy {
  if (input.mocksEnabled) {
    return {
      source: 'mock',
      decision: 'mock-active',
      reason: 'El catálogo usa datos de ejemplo.',
    };
  }

  // Checked BEFORE the flag, so no value of the flag can reach the legacy
  // branch in a release.
  if (input.environment !== 'development') {
    return {
      source: 'none',
      decision: 'legacy-forbidden-release',
      reason:
        'El catálogo legacy no está aislado por empresa y está bloqueado fuera de desarrollo.',
    };
  }

  if (input.legacyFlag?.trim().toLowerCase() === 'true') {
    return {
      source: 'legacy-api',
      decision: 'legacy-development-explicit',
      reason:
        'Catálogo legacy habilitado explícitamente para desarrollo. NO está aislado por empresa.',
    };
  }

  return {
    source: 'none',
    decision: 'legacy-disabled',
    reason:
      'El catálogo real está desactivado. Actívalo con EXPO_PUBLIC_ENABLE_LEGACY_CATALOG=true (solo desarrollo).',
  };
}

export const legacyCatalogPolicy: LegacyCatalogPolicy = resolveLegacyCatalogPolicy({
  environment: appEnvironment,
  mocksEnabled: mockDataPolicy.enabled,
  legacyFlag: process.env.EXPO_PUBLIC_ENABLE_LEGACY_CATALOG,
});

/** Whether this build may call the legacy, non-tenant-safe catalogue. */
export const isLegacyCatalogAllowed: boolean = legacyCatalogPolicy.source === 'legacy-api';

/**
 * Whether the build ASKED for the legacy catalogue, regardless of the answer.
 * Used only to report a refused request as a configuration issue.
 */
export const legacyCatalogRequested: boolean =
  process.env.EXPO_PUBLIC_ENABLE_LEGACY_CATALOG?.trim().toLowerCase() === 'true';

// ─── API base URL ───────────────────────────────────────────────────────────

/**
 * Host that a device/emulator can actually reach for a locally running Django.
 *
 * `localhost` means three different machines depending on where the JS runs:
 *   - iOS Simulator  → the Mac. `localhost` works.
 *   - Android emulator → the emulated device. The host Mac is `10.0.2.2`.
 *   - Physical device → itself. Neither works; you need the Mac's LAN IP.
 *
 * The Metro dev server already knows the address the client used to reach it,
 * so we reuse it instead of asking the developer to hardcode an IP.
 */
function inferLocalDevHost(): string {
  const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost;
  const host = hostUri?.split(':')[0];
  if (host) return host;
  return Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
}

function resolveApiBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');

  // Inferred ONLY in development. A release with no configured URL must fail
  // loudly at the first request, not quietly call a guessed server.
  if (appEnvironment === 'development') return `http://${inferLocalDevHost()}:8000`;

  return '';
}

/** Django REST API root, with no trailing slash. May be '' when unconfigured. */
export const apiBaseUrl: string = resolveApiBaseUrl();

export const isApiConfigured: boolean = apiBaseUrl.length > 0;

/** Request timeout in milliseconds. Mobile networks stall; they rarely fail fast. */
export const apiTimeoutMs = 15_000;

// ─── Mobile auth contract availability ──────────────────────────────────────

/**
 * Whether a NATIVE mobile authentication contract exists and is implemented.
 *
 * This is a SOURCE-LEVEL CONSTANT, deliberately not an environment variable.
 *
 * An env var would let a build claim the contract is ready when no code exists
 * to speak it — exactly the class of mistake M0.1 and M0.2 closed for mocks and
 * for the legacy catalogue. This flag may only flip to `true` in the same
 * commit that ships an `ApiAuthRepository` and its transport, because that is
 * the only moment the claim becomes true.
 *
 * Verified on `PapiCuche/BlackDogStore-web` @ `origin/master` `2624d478`:
 * `REST_FRAMEWORK.DEFAULT_AUTHENTICATION_CLASSES` contains only
 * `store.authentication.CookieJWTAuthentication`, `LoginView` returns the JWTs
 * in HttpOnly cookies and not in the body, and there is no `/api/v1/` route of
 * any kind. See BR-001 and docs/MOBILE_AUTH.md.
 */
export const isBackendAuthAvailable = false as boolean;

// ─── Configuration health ───────────────────────────────────────────────────

export type ConfigurationIssue = {
  code: 'missing-tenant' | 'missing-api-url' | 'mocks-in-release' | 'legacy-catalog-forbidden';
  message: string;
};

/**
 * Everything wrong with this build's configuration.
 *
 * Computed rather than thrown: crashing on launch would take down a store build
 * over a variable, which is worse than showing a clear diagnostic. Profile
 * renders these, and `isConfigurationValid` is what a future release gate would
 * assert in CI.
 */
export function collectConfigurationIssues(input: {
  environment: AppEnvironment;
  tenant: TenantConfig;
  apiConfigured: boolean;
  mockPolicy: MockDataPolicy;
  legacyCatalogRequested: boolean;
}): ConfigurationIssue[] {
  const issues: ConfigurationIssue[] = [];
  if (input.environment === 'development') return issues;

  if (input.legacyCatalogRequested) {
    // The request was already refused by resolveLegacyCatalogPolicy. Reporting
    // it matters because it means someone shipped a build believing the legacy
    // catalogue was on — and it is not.
    issues.push({
      code: 'legacy-catalog-forbidden',
      message:
        'EXPO_PUBLIC_ENABLE_LEGACY_CATALOG=true fue ignorado: el catálogo legacy no está aislado por empresa y no puede usarse en un release.',
    });
  }

  if (input.tenant.status === 'missing') {
    issues.push({
      code: 'missing-tenant',
      message:
        'EXPO_PUBLIC_COMPANY_SLUG no está definido. Un build de release no asume ninguna empresa.',
    });
  }
  if (!input.apiConfigured) {
    issues.push({
      code: 'missing-api-url',
      message: 'EXPO_PUBLIC_API_BASE_URL no está definido. Las peticiones fallarán.',
    });
  }
  if (input.mockPolicy.enabled) {
    issues.push({
      code: 'mocks-in-release',
      message: 'Este build de release está sirviendo datos de ejemplo. No debe distribuirse.',
    });
  }
  return issues;
}

export const configurationIssues: readonly ConfigurationIssue[] = collectConfigurationIssues({
  environment: appEnvironment,
  tenant,
  apiConfigured: isApiConfigured,
  mockPolicy: mockDataPolicy,
  legacyCatalogRequested,
});

export const isConfigurationValid: boolean = configurationIssues.length === 0;
