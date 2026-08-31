/**
 * The design token barrel. Components import from here, never from the
 * individual token files, so the token surface stays reviewable in one place.
 */

import { colorSchemes, type ColorSchemeName, type ColorTokens } from './colors';
import { radius } from './radius';
import { elevation, type ElevationLevel } from './shadows';
import { sizes } from './sizes';
import { spacing } from './spacing';
import { typography } from './typography';

export {
  brandPalette,
  colorSchemes,
  darkColors,
  lightColors,
  type ColorSchemeName,
  type ColorTokens,
} from './colors';
export { radius, cardRadius, controlRadius, type RadiusToken } from './radius';
export { elevation, type ElevationLevel } from './shadows';
export { sizes, type SizeToken } from './sizes';
export { screenGutter, spacing, type SpacingToken } from './spacing';
export { fontFamilies, typography, type TypographyToken } from './typography';

/** Everything a component needs, resolved for one colour scheme. */
export type Theme = {
  scheme: ColorSchemeName;
  colors: ColorTokens;
  spacing: typeof spacing;
  radius: typeof radius;
  sizes: typeof sizes;
  typography: typeof typography;
  elevation: (level: ElevationLevel) => ReturnType<typeof elevation>;
};

const themeCache: Partial<Record<ColorSchemeName, Theme>> = {};

/**
 * Build (and memoise) the resolved theme for `scheme`.
 *
 * Memoised because the object identity is a dependency of every `useMemo` that
 * builds a StyleSheet downstream; a fresh object each render would defeat them.
 */
export function buildTheme(scheme: ColorSchemeName): Theme {
  const cached = themeCache[scheme];
  if (cached) return cached;

  const theme: Theme = {
    scheme,
    colors: colorSchemes[scheme],
    spacing,
    radius,
    sizes,
    typography,
    elevation: (level) => elevation(level, scheme),
  };
  themeCache[scheme] = theme;
  return theme;
}
