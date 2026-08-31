import { Platform, type TextStyle } from 'react-native';

/**
 * Typography.
 *
 * DECISION: the app uses the PLATFORM system face (San Francisco on iOS, Roboto
 * on Android) rather than the Web storefront's Inter + Unbounded pairing.
 *
 * Reason: the system face is the only one that ships every optical size and
 * weight the OS needs for Dynamic Type, and it is what makes an iPhone app read
 * as an iPhone app rather than as a web page in a phone. Bundling Unbounded for
 * display headings is a deliberate follow-up, tracked as PENDIENTE BRANDING in
 * docs/DESIGN_SYSTEM.md — it is a branding upgrade, not a foundation gap.
 *
 * `fontFamily` is left undefined for sans on purpose: that is how you get the
 * real system face on both platforms.
 */
export const fontFamilies = {
  sans: undefined,
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
} as const;

/**
 * The type scale, named after the iOS text styles it mirrors so that anyone
 * reading a screen file knows the intended hierarchy at a glance.
 *
 * Sizes are the UNSCALED baseline. Dynamic Type is applied by React Native on
 * top of these; nothing here sets `allowFontScaling={false}`.
 */
export const typography = {
  display: { fontSize: 34, lineHeight: 41, fontWeight: '700', letterSpacing: 0.37 },
  title1: { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: 0.36 },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: 0.35 },
  title3: { fontSize: 20, lineHeight: 25, fontWeight: '600', letterSpacing: 0.38 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.41 },
  body: { fontSize: 17, lineHeight: 24, fontWeight: '400', letterSpacing: -0.41 },
  callout: { fontSize: 16, lineHeight: 22, fontWeight: '400', letterSpacing: -0.32 },
  subhead: { fontSize: 15, lineHeight: 20, fontWeight: '400', letterSpacing: -0.24 },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400', letterSpacing: -0.08 },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500', letterSpacing: 0 },
  /** All-caps section label. Mirrors `.section-label` on the Web storefront. */
  overline: { fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 1.1 },
  /** Order numbers, repair codes, anything that must align digit-for-digit. */
  mono: { fontSize: 13, lineHeight: 18, fontWeight: '500', fontFamily: fontFamilies.mono },
} as const satisfies Record<string, TextStyle>;

export type TypographyToken = keyof typeof typography;
