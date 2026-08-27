import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * The ONLY sanctioned way to persist a secret in this app.
 *
 * Backed by the iOS Keychain and Android Keystore via `expo-secure-store`.
 * Preferences and other non-sensitive state go to `preferences-storage.ts`
 * instead — mixing the two is how tokens end up in AsyncStorage.
 *
 * M1 — ONLY the refresh token is persisted here. The access token is
 * memory-only (`src/auth/tokens/access-token-store.ts`); see the decision
 * recorded there and in docs/MOBILE_AUTH.md.
 *
 * Callers should use `CredentialVault` rather than these primitives: it is the
 * one place that knows which key holds what, and it converts native failures
 * into `CredentialStorageError`.
 */

/**
 * Keys are an enum, not free strings. SecureStore silently accepts only
 * `[A-Za-z0-9._-]`, and a typo'd key reads back as `null` — which looks exactly
 * like "not logged in" and is miserable to debug.
 */
export type SecureStorageKey = 'bds.auth.access_token' | 'bds.auth.refresh_token';

export const secureStorageKeys = {
  /** The ONLY credential this app persists. */
  refreshToken: 'bds.auth.refresh_token',
} as const satisfies Record<string, SecureStorageKey>;

/**
 * RETIRED in M1: the access token is never persisted.
 *
 * M0 reserved this key in anticipation. M1 decided the access token lives in
 * memory only, so the key is kept solely so `clearSecureStorage()` can delete
 * anything a pre-M1 build might have left behind. Nothing writes it.
 */
const RETIRED_ACCESS_TOKEN_KEY: SecureStorageKey = 'bds.auth.access_token';

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

/**
 * Wipe every secret we own. Called on sign-out and when a refresh is rejected.
 *
 * Includes the retired access-token key so an upgrade from a build that had
 * persisted one cannot leave it sitting in the Keychain forever.
 */
export async function clearSecureStorage(): Promise<void> {
  const keys: SecureStorageKey[] = [
    ...Object.values(secureStorageKeys),
    RETIRED_ACCESS_TOKEN_KEY,
  ];
  await Promise.all(keys.map((key) => deleteSecureItem(key)));
}
