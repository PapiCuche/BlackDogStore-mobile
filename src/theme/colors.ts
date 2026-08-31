/**
 * Colour tokens.
 *
 * SOURCE OF TRUTH: `docs/black-dog-store-brand-master.md` in the Web repository,
 * section 19 "Identidad visual recomendada". The raw palette below is copied
 * verbatim from it and must not be re-invented here.
 *
 * The brand rule that shapes this file: "Usar negro, blanco y gris como sistema
 * principal. Reservar el dorado para detalles, sellos o llamadas puntuales."
 * So the PRIMARY ACTION colour is ink (light) / white (dark), and gold is an
 * accent only. Gold is also unusable as text on white (#D4AF37 on #FFFFFF is
 * ~1.9:1), which is why `accentText` carries a darkened variant per scheme.
 */

/** Raw brand palette — verbatim from the brand master document. */
export const brandPalette = {
  black: '#0A0A0A',
  white: '#FFFFFF',
  grayDark: '#1A1A1A',
  grayLight: '#E5E5E5',
  silver: '#C0C0C0',
  gold: '#D4AF37',
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
  textTertiary: string;
  /** Text drawn on top of `actionBackground`. */
  textOnAction: string;

  /** Primary action fill — ink on light, white on dark. */
  actionBackground: string;
  actionBackgroundPressed: string;
  /** Fill for destructive actions. */
  danger: string;

  /** Decorative gold. Never used for text or for anything load-bearing. */
  accent: string;
  /** Readable gold, for text and icons that must carry the accent. */
  accentText: string;
  /** Very low-emphasis gold wash behind accent content. */
  accentSurface: string;

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
  textTertiary: '#8A8F97',
  textOnAction: '#FFFFFF',

  actionBackground: '#0A0A0A',
  actionBackgroundPressed: '#2A2A2A',
  danger: '#B3261E',

  accent: '#D4AF37',
  accentText: '#7A5F12',
  accentSurface: '#FBF4DF',

  statusNeutral: '#5B5F66',
  statusInfo: '#1A4E8A',
  statusProgress: '#7A5F12',
  statusWarning: '#8A5A00',
  statusSuccess: '#137333',
  statusDanger: '#B3261E',

  statusNeutralSurface: '#F1F1F3',
  statusInfoSurface: '#E8F0FB',
  statusProgressSurface: '#FBF4DF',
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
 * Anchored on the Web storefront's real background (#080808) rather than pure
 * black, so the two products look like the same brand side by side.
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
  textTertiary: '#75797F',
  textOnAction: '#0A0A0A',

  actionBackground: '#FFFFFF',
  actionBackgroundPressed: '#D9D9DC',
  danger: '#F2837E',

  accent: '#D4AF37',
  accentText: '#E3C766',
  accentSurface: '#241E0C',

  statusNeutral: '#A1A6AE',
  statusInfo: '#7FB3F0',
  statusProgress: '#E3C766',
  statusWarning: '#E3B341',
  statusSuccess: '#4CC38A',
  statusDanger: '#F2837E',

  statusNeutralSurface: '#1E1E21',
  statusInfoSurface: '#12213A',
  statusProgressSurface: '#241E0C',
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
