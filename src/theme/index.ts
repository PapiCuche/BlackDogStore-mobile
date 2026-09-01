/**
 * The design token barrel. Components import from here, never from the
 * individual token files, so the token surface stays reviewable in one place.
 */

import { colorSchemes, type ColorSchemeName, type ColorTokens } from './colors';
import { buildMaterials, type Materials } from './materials';
import { radius } from './radius';
import { elevation, type ElevationLevel } from './shadows';
import { sizes } from './sizes';
import { spacing } from './spacing';
import { applyTenantAccent, type TenantAccentReport } from './tenant-accent';
import { typography } from './typography';

export {
  colorSchemes,
  darkColors,
  lightColors,
  platformPalette,
  type ColorSchemeName,
  type ColorTokens,
} from './colors';
export {
  AA_LARGE,
  AA_NORMAL,
  contrastRatio,
  ensureContrast,
  parseColor,
  readableOn,
  type Rgb,
} from './contrast';
export {
  buildMaterials,
  supportsBlurMaterials,
  type Material,
  type MaterialKey,
  type Materials,
} from './materials';
export { radius, cardRadius, controlRadius, type RadiusToken } from './radius';
export { elevation, type ElevationLevel } from './shadows';
export { sizes, type SizeToken } from './sizes';
export { screenGutter, spacing, type SpacingToken } from './spacing';
export {
  accentTint,
  applyTenantAccent,
  meetsLargeTextContrast,
  type TenantAccentReport,
} from './tenant-accent';
export { fontFamilies, typography, type TypographyToken } from './typography';

/** Everything a component needs, resolved for one colour scheme. */
export type Theme = {
  scheme: ColorSchemeName;
  colors: ColorTokens;
  /** What surfaces are made of. See `materials.ts`. */
  materials: Materials;
  spacing: typeof spacing;
  radius: typeof radius;
  sizes: typeof sizes;
  typography: typeof typography;
  elevation: (level: ElevationLevel) => ReturnType<typeof elevation>;
  /**
   * How the tenant's colour was resolved.
   *
   * Carried on the theme rather than kept private so a test — and the developer
   * screen — can assert that a given brand colour ended up readable, instead of
   * everyone taking it on trust.
   */
  accent: TenantAccentReport;
};

const themeCache = new Map<string, Theme>();

/**
 * Build (and memoise) the resolved theme.
 *
 * `tenantAccent` is the tenant's colour from BR-006, or null. It is part of the
 * cache key because two tenants must not share a theme object, and because the
 * accent can arrive AFTER the first frame — the app opens achromatic and takes
 * on the tenant's colour when the brand resolves, which is the honest order.
 *
 * Memoised because the object identity is a dependency of every `useMemo` that
 * builds a StyleSheet downstream; a fresh object each render would defeat them.
 */
export function buildTheme(scheme: ColorSchemeName, tenantAccent: string | null = null): Theme {
  const key = `${scheme}:${tenantAccent ?? ''}`;
  const cached = themeCache.get(key);
  if (cached) return cached;

  const { colors, report } = applyTenantAccent(colorSchemes[scheme], tenantAccent, scheme);

  const theme: Theme = {
    scheme,
    colors,
    materials: buildMaterials(colors, scheme),
    spacing,
    radius,
    sizes,
    typography,
    elevation: (level) => elevation(level, scheme),
    accent: report,
  };
  themeCache.set(key, theme);
  return theme;
}
