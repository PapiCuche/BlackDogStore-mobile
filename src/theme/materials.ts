import { Platform } from 'react-native';

import type { ColorSchemeName, ColorTokens } from './colors';
import { mix, parseColor, toRgba } from './contrast';

/**
 * MATERIALS — what a surface is made of, not what colour it is.
 *
 * The design language UI7 adopts is layered and translucent: panes of frosted
 * material floating over the content, picking up what is behind them. A colour
 * token cannot express that, because the answer depends on the platform, on the
 * accessibility settings, and on whether there is anything behind the pane at
 * all. So the system names MATERIALS, and each material carries every value a
 * component needs to render it in any of those situations.
 *
 * WHY EVERY MATERIAL HAS AN OPAQUE FALLBACK. Three real situations turn the
 * blur off, and none of them is an edge case:
 *
 *   1. Android. Efficient blur needs RenderNode (SDK 31+) and, in expo-blur,
 *      a `BlurTargetView` wrapping the content behind every pane. That is an
 *      architectural change to every screen in exchange for an effect Material
 *      Design does not ask for. Android gets the solid material instead.
 *   2. "Reduce Transparency". A person who turned it on is telling the OS that
 *      translucency costs them legibility. Ignoring that is not a style choice.
 *   3. Lists. A blurred pane per row is a compositing pass per row; the effect
 *      belongs to chrome that floats over scrolling content, not to the
 *      content itself.
 *
 * The fallback is therefore the DEFAULT and the blur is the enhancement — not
 * the other way round. A material must look finished with the blur removed.
 */

/** The named materials. Adding one is a design decision, not a colour choice. */
export type MaterialKey =
  /** Bars and floating chrome that sit OVER scrolling content. */
  | 'chrome'
  /** A resting pane: cards, grouped rows, sheets at rest. */
  | 'card'
  /** A pane that must read as lifted above `card`. */
  | 'raised'
  /** Modal and sheet backdrops. */
  | 'overlay';

export type Material = {
  /** `expo-blur` tint. */
  blurTint: 'light' | 'dark';
  /** `expo-blur` intensity, 1–100. */
  intensity: number;
  /** Painted OVER the blur, to keep the tone stable over any wallpaper. */
  tintColor: string;
  /** Painted INSTEAD of the blur. Opaque enough to stand alone. */
  fallbackColor: string;
  /** The pane's edge. A material without one dissolves into the page. */
  borderColor: string;
  /**
   * A brighter hairline along the top edge.
   *
   * What makes a pane read as glass rather than as a grey rectangle: real
   * glass catches light on the edge nearest the source. One hairline, not a
   * gradient — a gradient per pane is a texture upload per pane.
   */
  highlightColor: string;
};

export type Materials = Record<MaterialKey, Material>;

/**
 * Whether this platform gets the blur at all.
 *
 * A build-time constant, deliberately: it is a property of the platform, and
 * making it a runtime decision would invite a component to toggle it per render.
 * The accessibility setting is separate and IS per render — see
 * `useReducedTransparency`.
 */
export const supportsBlurMaterials = Platform.OS === 'ios';

/**
 * Resolve the materials for a scheme.
 *
 * Derived from the same `ColorTokens` everything else uses, so a tenant accent
 * or a token change flows through without a second palette to maintain.
 */
export function buildMaterials(colors: ColorTokens, scheme: ColorSchemeName): Materials {
  const isDark = scheme === 'dark';
  const surface = parseColor(colors.surface);
  const elevated = parseColor(colors.surfaceElevated);
  const background = parseColor(colors.background);
  const border = parseColor(colors.border);

  // A tint painted over the blur. Light schemes need white to stay paper-like;
  // dark schemes need the page colour, or the pane glows.
  const tintBase = isDark ? background : parseColor('#FFFFFF');
  const tint = (alpha: number) =>
    tintBase ? toRgba(tintBase, alpha) : (colors.surface as string);

  // The specular edge. White in both schemes — a dark highlight is a shadow,
  // and this is meant to read as light landing on an edge.
  const highlight = (alpha: number) => `rgba(255, 255, 255, ${alpha})`;

  const hairline = (alpha: number) =>
    border ? toRgba(border, alpha) : (colors.border as string);

  return {
    chrome: {
      blurTint: isDark ? 'dark' : 'light',
      intensity: isDark ? 55 : 70,
      tintColor: tint(isDark ? 0.55 : 0.62),
      // Opaque: chrome sits over scrolling content, and a translucent bar with
      // no blur behind it is just an unreadable bar.
      fallbackColor: colors.backgroundElevated,
      borderColor: hairline(isDark ? 0.9 : 1),
      highlightColor: highlight(isDark ? 0.1 : 0.55),
    },
    card: {
      blurTint: isDark ? 'dark' : 'light',
      intensity: isDark ? 40 : 55,
      tintColor: tint(isDark ? 0.5 : 0.7),
      fallbackColor: colors.surface,
      borderColor: hairline(1),
      highlightColor: highlight(isDark ? 0.07 : 0.45),
    },
    raised: {
      blurTint: isDark ? 'dark' : 'light',
      intensity: isDark ? 50 : 65,
      tintColor: tint(isDark ? 0.62 : 0.8),
      fallbackColor: colors.surfaceElevated,
      borderColor: hairline(1),
      highlightColor: highlight(isDark ? 0.12 : 0.6),
    },
    overlay: {
      blurTint: isDark ? 'dark' : 'light',
      intensity: isDark ? 60 : 75,
      tintColor: tint(isDark ? 0.72 : 0.86),
      fallbackColor:
        elevated && surface
          ? // A hair away from `surfaceElevated`, so a sheet without blur still
            // separates from the page behind it.
            toRgba(mix(elevated, surface, isDark ? 0.2 : 0.1), 1)
          : colors.surfaceElevated,
      borderColor: hairline(1),
      highlightColor: highlight(isDark ? 0.14 : 0.7),
    },
  };
}
