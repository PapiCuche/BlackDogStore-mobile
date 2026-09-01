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

import { useCompanyBrand } from '@/hooks/use-company-brand';
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
  /**
   * The tenant colour actually in effect, or null while the brand is unknown.
   *
   * Exposed so a screen can say "this is your company's colour" honestly, and
   * so a test can assert that a build with no brand renders achromatic rather
   * than borrowing the pilot's.
   */
  tenantAccent: string | null;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * The theme, resolved for the scheme AND for the tenant.
 *
 * UI7 added the second half. The brand arrives over BR-006 and can arrive after
 * the first frame, so the app opens in the platform's achromatic palette and
 * takes on the tenant's colour when it resolves. That order is deliberate: the
 * alternative is holding the whole UI hostage to a network request, or flashing
 * a colour that belongs to whoever shipped the fixture.
 *
 * Reading the brand here is possible because `useCompanyBrand` now uses the
 * PUBLIC query scope, which needs no session. The theme sits above
 * `AuthProvider` in the tree — auth renders using the theme — so a hook that
 * needed a session could not be called from here at all.
 */
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

  // Only a READY brand contributes a colour. `loading` and `unavailable` both
  // mean "we do not know this tenant's colour", and the honest render for that
  // is the platform's own — never a remembered one from another build.
  const brand = useCompanyBrand();
  const tenantAccent = brand.status === 'ready' ? brand.brand.primaryColor : null;

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: buildTheme(scheme, tenantAccent),
      scheme,
      preference,
      setPreference: updatePreference,
      isPreferenceLoaded,
      tenantAccent,
    }),
    [scheme, tenantAccent, preference, updatePreference, isPreferenceLoaded],
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
