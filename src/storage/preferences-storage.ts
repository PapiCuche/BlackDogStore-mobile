import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Non-sensitive, user-visible preferences.
 *
 * AsyncStorage is unencrypted. That is fine for a theme choice and actively
 * WRONG for a token — anything secret belongs in `secure-storage.ts`. The two
 * modules are kept apart so that the wrong choice requires the wrong import.
 */
export type PreferenceKey = 'bds.pref.theme' | 'bds.pref.haptics';

export const preferenceKeys = {
  themePreference: 'bds.pref.theme',
  hapticsEnabled: 'bds.pref.haptics',
} as const satisfies Record<string, PreferenceKey>;

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
