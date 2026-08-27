import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Runtime configuration.
 *
 * SECURITY: every `EXPO_PUBLIC_*` variable is inlined into the JavaScript
 * bundle at build time and is therefore PUBLIC. Anyone with the .ipa/.apk can
 * read it. Nothing secret may be added to this file — no Stripe secret key, no
 * Django SECRET_KEY, no signing credential. See docs/MOBILE_AUTH.md.
 */

export type AppEnvironment = 'development' | 'staging' | 'production';

/**
 * Which backend this build talks to.
 *
 * `__DEV__` is the honest signal for a Metro/dev-client build. Staging and
 * production are distinguished by an explicit variable, because both are
 * release builds and nothing else tells them apart.
 */
export const appEnvironment: AppEnvironment = __DEV__
  ? 'development'
  : process.env.EXPO_PUBLIC_APP_ENV === 'staging'
    ? 'staging'
    : 'production';

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
function inferLocalDevHost(): string | null {
  const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost;
  const host = hostUri?.split(':')[0];
  if (!host) {
    return Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
  }
  return host;
}

function resolveApiBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');

  if (__DEV__) {
    const host = inferLocalDevHost();
    if (host) return `http://${host}:8000`;
  }

  // Empty rather than a guessed production URL: an unconfigured release build
  // must fail loudly at the first request, not quietly call the wrong server.
  return '';
}

/** Django REST API root, with no trailing slash. May be '' when unconfigured. */
export const apiBaseUrl: string = resolveApiBaseUrl();

export const isApiConfigured: boolean = apiBaseUrl.length > 0;

/**
 * Which tenant this build is the storefront for.
 *
 * The Django backend resolves the public tenant from the request HOST
 * (`store.tenancy.resolve_storefront_company`). A mobile client has no
 * meaningful host of its own, so this value exists to be sent explicitly once
 * the backend accepts it. See BR-002 in docs/BACKEND_REQUIREMENTS.md — until
 * that lands, this is carried but not honoured by the server.
 */
export const companySlug: string = process.env.EXPO_PUBLIC_COMPANY_SLUG?.trim() || 'blackdog';

/**
 * Master switch for mock data.
 *
 * Defaults to ON, because as of M0 the only screens with a real backend are the
 * catalogue ones and even those are blocked on BR-002. Set
 * `EXPO_PUBLIC_USE_MOCK_DATA=false` to exercise the live API client.
 */
export const useMockData: boolean = process.env.EXPO_PUBLIC_USE_MOCK_DATA !== 'false';

/** Request timeout in milliseconds. Mobile networks stall; they rarely fail fast. */
export const apiTimeoutMs = 15_000;
