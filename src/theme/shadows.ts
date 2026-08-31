import { Platform, type ViewStyle } from 'react-native';

import type { ColorSchemeName } from './colors';

/**
 * Elevation.
 *
 * Shadows are deliberately very discreet — the brief calls for "sombras muy
 * discretas", and a heavy drop shadow is the fastest way to make a native app
 * look like a web page.
 *
 * On dark backgrounds a black shadow is invisible, so depth there comes from
 * the surface colour ramp (`surface` → `surfaceElevated`) instead. These
 * helpers therefore return an empty style in dark mode rather than pretending.
 */
export type ElevationLevel = 'none' | 'card' | 'raised' | 'overlay';

const iosShadows: Record<ElevationLevel, ViewStyle> = {
  none: {},
  card: {
    shadowColor: '#0A0A0A',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  raised: {
    shadowColor: '#0A0A0A',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
  },
  overlay: {
    shadowColor: '#0A0A0A',
    shadowOpacity: 0.14,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
  },
};

const androidElevation: Record<ElevationLevel, ViewStyle> = {
  none: {},
  card: { elevation: 1 },
  raised: { elevation: 3 },
  overlay: { elevation: 8 },
};

/** Elevation style for `level` under `scheme`. Empty object is a valid answer. */
export function elevation(level: ElevationLevel, scheme: ColorSchemeName): ViewStyle {
  if (level === 'none' || scheme === 'dark') return {};
  return Platform.select({
    ios: iosShadows[level],
    android: androidElevation[level],
    default: iosShadows[level],
  });
}
