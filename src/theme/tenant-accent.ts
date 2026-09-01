import type { ColorSchemeName, ColorTokens } from './colors';
import {
  AA_LARGE,
  AA_NORMAL,
  contrastRatio,
  ensureContrast,
  mix,
  parseColor,
  readableOn,
  toHex,
  toRgba,
  type Rgb,
} from './contrast';

/**
 * Apply a TENANT's colour to the platform's achromatic tokens.
 *
 * THE RULE THIS FILE ENFORCES. A tenant owns its identity and nothing else.
 * Four tokens move — `accent`, `accentText`, `accentSurface`, `textOnAccent` —
 * and the rest of the ramp is untouchable:
 *
 *   · The STATUS ramp stays platform-owned. A shop whose brand colour is red
 *     must not end up with a red "entregado" badge; status colour is meaning,
 *     and meaning is not for sale.
 *   · TEXT and BORDERS stay platform-owned, because they are the legibility
 *     floor. A tenant may be unreadable in its own marketing; it may not make
 *     this app unreadable.
 *   · `actionBackground` stays ink/white. The primary button is the most
 *     contrast-critical surface in the app, and a mid-tone brand fill is where
 *     "make the button our colour" quietly costs someone their reading.
 *
 * WHAT IS DERIVED, NOT ASSUMED. `accentText` is the tenant colour walked toward
 * black or white until it clears AA against the page. `textOnAccent` is whichever
 * of ink/paper reads better on the fill. Both are computed here, once, at
 * theme-build time — so no component has to know, and no component can forget.
 *
 * A colour this file cannot parse returns the base tokens unchanged. A tenant
 * saving `azul` in a settings form is not a crash and not a blank screen; it is
 * simply a build with no accent, which is exactly what the platform looks like
 * on its own.
 */

export type TenantAccentReport = {
  /** The colour as the tenant supplied it, or null when unusable. */
  requested: string | null;
  /** Whether it was applied at all. */
  applied: boolean;
  /** Contrast of the raw colour against the page, before correction. */
  rawContrastOnBackground: number;
  /** Contrast of the DERIVED `accentText` against the page. */
  textContrastOnBackground: number;
  /** Contrast of `accentText` against the accent wash — where badges land. */
  textContrastOnAccentSurface: number;
  /** Contrast of `textOnAccent` against the accent fill. */
  onAccentContrast: number;
  /** True when the raw colour had to be corrected to be readable. */
  corrected: boolean;
};

const INK: Rgb = { r: 10, g: 10, b: 10, a: 1 };
const PAPER: Rgb = { r: 255, g: 255, b: 255, a: 1 };

export type TenantThemedColors = {
  colors: ColorTokens;
  report: TenantAccentReport;
};

/**
 * Build the tenant-tinted colour tokens for one scheme.
 *
 * Pure, so a test can assert the contrast of any brand colour without mounting
 * anything, and so the result can be memoised per (scheme, colour).
 */
export function applyTenantAccent(
  base: ColorTokens,
  brandColor: string | null | undefined,
  scheme: ColorSchemeName,
): TenantThemedColors {
  const requested = brandColor?.trim() || null;
  const parsed = parseColor(requested);
  const background = parseColor(base.background) ?? (scheme === 'dark' ? INK : PAPER);

  if (!parsed) {
    // No colour, or one we cannot read. The platform's own achromatic accent
    // stands, and the report says why rather than leaving a silent no-op.
    return {
      colors: base,
      report: {
        requested,
        applied: false,
        rawContrastOnBackground: 0,
        textContrastOnBackground: contrastRatio(
          parseColor(base.accentText) ?? INK,
          background,
        ),
        textContrastOnAccentSurface: contrastRatio(
          parseColor(base.accentText) ?? INK,
          parseColor(base.accentSurface) ?? background,
        ),
        onAccentContrast: contrastRatio(
          parseColor(base.textOnAccent) ?? PAPER,
          parseColor(base.accent) ?? INK,
        ),
        corrected: false,
      },
    };
  }

  // The fill keeps the tenant's colour exactly. This is the one place their
  // identity survives untouched, which is the whole point of the exercise.
  const accent = toHex(parsed);

  const rawContrast = contrastRatio(parsed, background);

  // A wash, not a tint of the brand at full strength: 8% in light, 14% in dark,
  // because a dark page swallows a low-alpha overlay.
  const surfaceBase = parseColor(base.surfaceSubtle) ?? background;
  const accentSurfaceRgb = mix(surfaceBase, parsed, scheme === 'dark' ? 0.14 : 0.08);
  const accentSurface = toHex(accentSurfaceRgb);

  // Corrected against BOTH grounds it can land on: the page, and the accent
  // wash behind an accent badge. Correcting against the page alone is a real
  // gap — the wash is tinted toward the brand colour, so it is always the
  // harder of the two, and a badge is exactly where an accent is read.
  const readable = ensureContrast(
    ensureContrast(parsed, background, AA_NORMAL),
    accentSurfaceRgb,
    AA_NORMAL,
  );
  const accentText = toHex(readable);

  // Ink or paper, whichever survives on the fill. Never a fixed white: a
  // pastel brand colour with white text is the classic unreadable button.
  const textOnAccent = toHex(readableOn(parsed, PAPER, INK));

  return {
    colors: { ...base, accent, accentText, accentSurface, textOnAccent },
    report: {
      requested,
      applied: true,
      rawContrastOnBackground: rawContrast,
      textContrastOnBackground: contrastRatio(readable, background),
      textContrastOnAccentSurface: contrastRatio(readable, accentSurfaceRgb),
      onAccentContrast: contrastRatio(parseColor(textOnAccent) ?? INK, parsed),
      corrected: toHex(parsed) !== accentText,
    },
  };
}

/**
 * A translucent version of the accent, for a material's tint.
 *
 * Kept here rather than in `materials.ts` so every use of the tenant's colour
 * goes through one file — the file that also knows what a tenant may not do.
 */
export function accentTint(colors: ColorTokens, alpha: number): string {
  const parsed = parseColor(colors.accent);
  if (!parsed) return 'transparent';
  return toRgba(parsed, alpha);
}

/** Whether a colour clears the bar for large text / UI components on the page. */
export function meetsLargeTextContrast(color: string, background: string): boolean {
  const fg = parseColor(color);
  const bg = parseColor(background);
  if (!fg || !bg) return false;
  return contrastRatio(fg, bg) >= AA_LARGE;
}
