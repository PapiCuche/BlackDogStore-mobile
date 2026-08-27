import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';

import { getPreference, preferenceKeys, setPreference } from '@/storage/preferences-storage';

import { buildTheme, type ColorSchemeName, type Theme } from './index';

/**
 * What the USER chose. `system` means "follow the OS", which is the default and
 * is not the same value as the scheme that ends up being rendered.
 */
export type ThemePreference = 'light' | 'dark' | 'system';

export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'] as const;

function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

type ThemeContextValue = {
  /** Tokens resolved for the scheme actually being rendered. */
  theme: Theme;
  /** The rendered scheme, after `system` has been resolved against the OS. */
  scheme: ColorSchemeName;
  /** The user's stored choice. */
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => void;
  /** False until the stored preference has been read back from disk. */
  isPreferenceLoaded: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [isPreferenceLoaded, setIsPreferenceLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPreference(preferenceKeys.themePreference).then((stored) => {
      if (cancelled) return;
      if (isThemePreference(stored)) setPreferenceState(stored);
      setIsPreferenceLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const updatePreference = useCallback((next: ThemePreference) => {
    // Applied optimistically: the UI must not wait on a disk write to repaint.
    setPreferenceState(next);
    void setPreference(preferenceKeys.themePreference, next);
  }, []);

  // `useColorScheme()` returns null before the OS reports one. Treating null as
  // light (rather than as "unknown") avoids a flash of the wrong theme on the
  // very first frame, which is far more visible than being briefly wrong on a
  // device that is actually in dark mode.
  const scheme: ColorSchemeName =
    preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: buildTheme(scheme),
      scheme,
      preference,
      setPreference: updatePreference,
      isPreferenceLoaded,
    }),
    [scheme, preference, updatePreference, isPreferenceLoaded],
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}

/**
 * Resolved tokens for the current scheme.
 *
 * Throws outside the provider rather than falling back to a default theme: a
 * silent fallback renders a light-mode screen inside a dark app and the cause
 * is invisible.
 */
export function useAppTheme(): ThemeContextValue {
  const context = use(ThemeContext);
  if (!context) {
    throw new Error('useAppTheme must be used inside <AppThemeProvider>.');
  }
  return context;
}

/** Shorthand for the common case of needing only the tokens. */
export function useTheme(): Theme {
  return useAppTheme().theme;
}
