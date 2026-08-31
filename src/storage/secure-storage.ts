import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * The ONLY sanctioned way to persist a secret in this app.
 *
 * Backed by the iOS Keychain and Android Keystore via `expo-secure-store`.
 * Preferences and other non-sensitive state go to `preferences-storage.ts`
 * instead — mixing the two is how tokens end up in AsyncStorage.
 *
 * Nothing here is used yet: mobile authentication is PENDIENTE (see
 * docs/MOBILE_AUTH.md). The wrapper exists so that when M1 lands there is one
 * audited place for token storage rather than a `SecureStore` call per feature.
 */

/**
 * Keys are an enum, not free strings. SecureStore silently accepts only
 * `[A-Za-z0-9._-]`, and a typo'd key reads back as `null` — which looks exactly
 * like "not logged in" and is miserable to debug.
 */
export type SecureStorageKey = 'bds.auth.access_token' | 'bds.auth.refresh_token';

export const secureStorageKeys = {
  /** Mobile access token. Written only by the future M1 auth implementation. */
  accessToken: 'bds.auth.access_token',
  /** Mobile refresh token. See docs/MOBILE_AUTH.md before using this. */
  refreshToken: 'bds.auth.refresh_token',
} as const satisfies Record<string, SecureStorageKey>;

/**
 * Keychain/Keystore service name. Setting it explicitly keeps our entries
 * namespaced and lets a future tenant switch clear only its own items.
 */
const KEYCHAIN_SERVICE = 'com.blackdogstore.app';

const options: SecureStore.SecureStoreOptions = {
  keychainService: KEYCHAIN_SERVICE,
  // Tokens must survive a device reboot before first unlock is NOT required,
  // but they must never leave the device in an unencrypted backup.
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

/**
 * SecureStore has no web implementation. Rather than silently falling back to
 * `localStorage` — which would put a token somewhere any script can read — the
 * wrapper reports unavailability and the caller decides.
 */
export function isSecureStorageAvailable(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

export async function setSecureItem(key: SecureStorageKey, value: string): Promise<void> {
  if (!isSecureStorageAvailable()) {
    throw new Error(
      `SecureStore is unavailable on ${Platform.OS}; refusing to persist "${key}" in the clear.`,
    );
  }
  await SecureStore.setItemAsync(key, value, options);
}

export async function getSecureItem(key: SecureStorageKey): Promise<string | null> {
  if (!isSecureStorageAvailable()) return null;
  return SecureStore.getItemAsync(key, options);
}

export async function deleteSecureItem(key: SecureStorageKey): Promise<void> {
  if (!isSecureStorageAvailable()) return;
  await SecureStore.deleteItemAsync(key, options);
}

/** Wipe every secret we own. Called on sign-out and on refresh failure. */
export async function clearSecureStorage(): Promise<void> {
  await Promise.all(Object.values(secureStorageKeys).map((key) => deleteSecureItem(key)));
}
