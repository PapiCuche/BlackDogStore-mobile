import { StyleSheet } from 'react-native';

import type { Theme } from '@/theme';

import { GlassSurface } from './glass-surface';

/**
 * The navigation bar's material, shared by every stack in the app.
 *
 * WHY A FACTORY AND NOT THREE COPIES. There are three stacks — the root, the
 * auth flow and the internal area — and each one declares its own
 * `screenOptions`. Before UI7 they each spelled out their own header colours,
 * which is how two of them ended up subtly different from the third. A stack
 * now asks for the chrome and gets whatever the design system currently means
 * by it.
 */
export function glassStackScreenOptions(theme: Theme) {
  return {
    // The scene runs UNDER the bar, so the material has something to blur.
    // `Screen` reads `HeaderHeightContext` and pads for it, so no screen has to
    // know this is happening.
    headerTransparent: true,
    headerBackground: renderHeaderBackground,
    headerTintColor: theme.colors.textPrimary,
    headerTitleStyle: { color: theme.colors.textPrimary },
    // The pane draws its own hairline; the platform's would be a second one.
    headerShadowVisible: false,
    contentStyle: { backgroundColor: theme.colors.background },
  } as const;
}

/**
 * Module scope, not inline.
 *
 * React Navigation calls `headerBackground` on every render. A component
 * declared inside a navigator would be a new type each time, remounting the
 * pane — and for a blurred view that means re-creating a native effect view on
 * every push.
 */
export function renderHeaderBackground() {
  return <GlassSurface material="chrome" bordered={false} style={StyleSheet.absoluteFill} />;
}
