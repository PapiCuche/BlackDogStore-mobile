/**
 * Colour tokens — THE PLATFORM'S, not a tenant's.
 *
 * UI7 CHANGED WHAT THIS FILE IS. It used to open by naming
 * `docs/black-dog-store-brand-master.md` as its SOURCE OF TRUTH and to carry
 * that company's palette — gold accent included — as the base of the design
 * system. That was correct for a single-store app and wrong for a SaaS: the
 * pilot tenant had become the default identity of every build, and a second
 * customer would have inherited a competitor's gold unless someone remembered
 * to overwrite it.
 *
 * So the base is now deliberately **achromatic**. Ink, paper and a graphite
 * ramp. The platform has no colour of its own to lend, and does not pretend
 * otherwise.
 *
 * WHERE COLOUR COMES FROM. The tenant, over BR-006
 * (`/api/v1/storefront/<slug>/config/` → `CompanyBrand.primaryColor`), applied
 * by `tenant-accent.ts` on top of these tokens. The pilot's gold lives in
 * `domain/company/pilot-brand.ts`, which is where a tenant's identity belongs.
 *
 * WHAT A TENANT MAY NOT REPAINT: the status ramp (success, warning, danger,
 * info), the text ramp and the borders. Those are meaning and legibility, not
 * decoration — a shop whose brand colour happens to be red must not end up with
 * a red "delivered" badge, and no brand colour may push body text below WCAG AA.
 */

/**
 * The achromatic base.
 *
 * Not "grey because grey is safe" — grey because it is the only palette a
 * multi-tenant platform can hold without borrowing someone's identity. Slightly
 * cool rather than pure neutral, so tenant accents of any hue sit on it without
 * looking muddy.
 */
export const platformPalette = {
  ink: '#0A0A0A',
  paper: '#FFFFFF',
  graphite: '#1A1A1D',
  ash: '#E5E5E7',
  slate: '#8A8F97',
} as const;

/**
 * Every colour the UI is allowed to name. A component that needs a colour picks
 * a key here; it never writes a hex literal of its own.
 */
export type ColorTokens = {
  /** Page background. */
  background: string;
  /** Background of a screen region that sits above the page (e.g. a sheet). */
  backgroundElevated: string;

  /** Default card / control fill. */
  surface: string;
  /** A surface that must read as raised against `surface`. */
  surfaceElevated: string;
  /** Pressed state of an interactive surface. */
  surfacePressed: string;
  /** Low-emphasis fill: chips, skeletons, inactive track. */
  surfaceSubtle: string;

  /** Hairline borders and card outlines. */
  border: string;
  /** Border that must remain visible against `surface` (inputs, focus). */
  borderStrong: string;

  textPrimary: string;
  textSecondary: string;
  /**
   * The quietest step of the scale — metadata, timestamps, helper copy.
   *
   * QUIET, NOT UNREADABLE. Every one of the three carries information somebody
   * is meant to read, so all three clear `AA_NORMAL` against every surface the
   * app paints them on, `surfacePressed` included. Tertiary used to sit at
   * 2.78:1 on the worst light surface and 3.58:1 on the worst dark one; it was
   * the least legible thing in the app and it was carrying dates, counts and
   * identifiers. `theme.test.ts` measures all of this rather than trusting it.
   *
   * The floor is what constrains this value. Making it dimmer to "feel more
   * tertiary" is not available — it collapses back through AA. Making it much
   * darker is not available either: it closes on `textSecondary` and the
   * hierarchy stops being one.
   */
  textTertiary: string;
  /** Text drawn on top of `actionBackground`. */
  textOnAction: string;

  /** Primary action fill — ink on light, white on dark. */
  actionBackground: string;
  actionBackgroundPressed: string;
  /** Fill for destructive actions. */
  danger: string;

  /**
   * The tenant's colour, or graphite when there is none.
   *
   * A FILL, never text: an accent is chosen for identity and identity has no
   * contrast requirement. Use `accentText` where it has to be read.
   */
  accent: string;
  /** The accent, corrected until it clears AA against `background`. */
  accentText: string;
  /** Very low-emphasis wash behind accent content. */
  accentSurface: string;
  /**
   * Foreground drawn ON TOP of an `accent` fill.
   *
   * Computed, never assumed. A tenant accent can be near-white or near-black,
   * and a hardcoded label colour turns one of those two cases invisible.
   */
  textOnAccent: string;

  /** Status foregrounds — used for text and icons on `*Surface` fills. */
  statusNeutral: string;
  statusInfo: string;
  statusProgress: string;
  statusWarning: string;
  statusSuccess: string;
  statusDanger: string;

  statusNeutralSurface: string;
  statusInfoSurface: string;
  statusProgressSurface: string;
  statusWarningSurface: string;
  statusSuccessSurface: string;
  statusDangerSurface: string;

  /** Scrim behind modals. */
  overlay: string;
  /** Base fill of a loading skeleton. */
  skeleton: string;
  /** Highlight that sweeps across a skeleton. */
  skeletonHighlight: string;
};

/**
 * Light scheme.
 *
 * Deliberately warm-neutral rather than pure grey: a flat #F5F5F5 surface on a
 * #FFFFFF page reads as unfinished on an OLED iPhone.
 */
export const lightColors: ColorTokens = {
  background: '#FFFFFF',
  backgroundElevated: '#FFFFFF',

  surface: '#F7F7F8',
  surfaceElevated: '#FFFFFF',
  surfacePressed: '#EDEDEF',
  surfaceSubtle: '#F1F1F3',

  border: '#E5E5E5',
  borderStrong: '#D2D2D6',

  textPrimary: '#0A0A0A',
  textSecondary: '#5B5F66',
  textTertiary: '#686B71',
  textOnAction: '#FFFFFF',

  actionBackground: '#0A0A0A',
  actionBackgroundPressed: '#2A2A2A',
  danger: '#B3261E',

  // Achromatic by default. A tenant accent replaces these three (plus
  // `textOnAccent`) at theme-build time; nothing else in the ramp moves.
  accent: '#2E2E33',
  accentText: '#2E2E33',
  accentSurface: '#F1F1F3',
  textOnAccent: '#FFFFFF',

  statusNeutral: '#5B5F66',
  statusInfo: '#1A4E8A',
  statusProgress: '#5B4B8A',
  statusWarning: '#8A5A00',
  statusSuccess: '#137333',
  statusDanger: '#B3261E',

  statusNeutralSurface: '#F1F1F3',
  statusInfoSurface: '#E8F0FB',
  statusProgressSurface: '#EEEBF7',
  statusWarningSurface: '#FDF1DF',
  statusSuccessSurface: '#E4F4E9',
  statusDangerSurface: '#FBEAE9',

  overlay: 'rgba(10, 10, 10, 0.45)',
  skeleton: '#ECECEE',
  skeletonHighlight: '#F6F6F7',
};

/**
 * Dark scheme.
 *
 * Anchored at #080808 rather than pure black: an OLED true-black page makes
 * every translucent material above it read as a grey rectangle, because there
 * is nothing behind them to show through.
 */
export const darkColors: ColorTokens = {
  background: '#080808',
  backgroundElevated: '#111113',

  surface: '#141416',
  surfaceElevated: '#1C1C1F',
  surfacePressed: '#232327',
  surfaceSubtle: '#1A1A1D',

  border: '#272727',
  borderStrong: '#3A3A3E',

  textPrimary: '#FFFFFF',
  textSecondary: '#A1A6AE',
  textTertiary: '#8A8D92',
  textOnAction: '#0A0A0A',

  actionBackground: '#FFFFFF',
  actionBackgroundPressed: '#D9D9DC',
  danger: '#F2837E',

  accent: '#D4D4D8',
  accentText: '#D4D4D8',
  accentSurface: '#1E1E21',
  textOnAccent: '#0A0A0A',

  statusNeutral: '#A1A6AE',
  statusInfo: '#7FB3F0',
  statusProgress: '#B3A5E0',
  statusWarning: '#E3B341',
  statusSuccess: '#4CC38A',
  statusDanger: '#F2837E',

  statusNeutralSurface: '#1E1E21',
  statusInfoSurface: '#12213A',
  statusProgressSurface: '#1B172B',
  statusWarningSurface: '#2A2009',
  statusSuccessSurface: '#0E2A1C',
  statusDangerSurface: '#2E1413',

  overlay: 'rgba(0, 0, 0, 0.62)',
  skeleton: '#1C1C1F',
  skeletonHighlight: '#26262A',
};

export type ColorSchemeName = 'light' | 'dark';

export const colorSchemes: Record<ColorSchemeName, ColorTokens> = {
  light: lightColors,
  dark: darkColors,
};
