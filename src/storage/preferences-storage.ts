import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Non-sensitive, user-visible preferences.
 *
 * AsyncStorage is unencrypted. That is fine for a theme choice and actively
 * WRONG for a token — anything secret belongs in `secure-storage.ts`. The two
 * modules are kept apart so that the wrong choice requires the wrong import.
 */
export type PreferenceKey = 'bds.pref.theme' | 'bds.pref.haptics' | `bds.cart.${string}`;

export const preferenceKeys = {
  themePreference: 'bds.pref.theme',
  hapticsEnabled: 'bds.pref.haptics',
} as const satisfies Record<string, PreferenceKey>;

/**
 * The shopping basket of one tenant.
 *
 * AsyncStorage, NOT SecureStore, and the distinction is the point. SecureStore
 * is the Keychain: it is for secrets, it is slower, and putting a shopping list
 * in it would dilute what "this app keeps something secure" means. A basket
 * holds no credential, no authorization and no authoritative price — only what
 * someone was thinking of buying.
 *
 * Keyed by tenant so two storefronts can never see each other's basket.
 */
export function cartKey(tenantSlug: string): PreferenceKey {
  return `bds.cart.${tenantSlug}`;
}

/**
 * Reads never throw.
 *
 * A corrupted or unavailable preference store must not stop the app from
 * launching — the caller falls back to its default and the user loses a
 * preference, not the session.
 */
export async function getPreference(key: PreferenceKey): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function setPreference(key: PreferenceKey, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    // Losing a preference write is not worth surfacing to the user.
  }
}

export async function removePreference(key: PreferenceKey): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // Same rationale as setPreference.
  }
}
