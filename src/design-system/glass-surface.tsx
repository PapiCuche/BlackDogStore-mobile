import { BlurView } from 'expo-blur';
import { useMemo, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { useReducedTransparency } from '@/hooks/use-reduced-transparency';
import { supportsBlurMaterials, type MaterialKey } from '@/theme';
import { useTheme } from '@/theme/theme-provider';

/**
 * Everything a `View` accepts, plus the material. Accessibility props pass
 * straight through: a pane that announced nothing would make every component
 * built on it reach for a wrapper `View`, and the wrapper is where labels get
 * lost.
 */
export type GlassSurfaceProps = Omit<ViewProps, 'style' | 'children'> & {
  /** Which material this pane is made of. See `theme/materials.ts`. */
  material?: MaterialKey;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Corner radius. Applied with `overflow: 'hidden'`, which iOS and Android both need. */
  radius?: number;
  /** Draw the hairline edge. On by default: a pane without one dissolves. */
  bordered?: boolean;
  /** Draw the specular top edge. Off for full-bleed chrome that has no top. */
  highlighted?: boolean;
  /**
   * Force the opaque material.
   *
   * For content that repeats — list rows, grid cells. A blurred pane per row is
   * a compositing pass per row, and the effect belongs to chrome that floats
   * over scrolling content, not to the content itself.
   */
  solid?: boolean;
};

/**
 * A pane of material.
 *
 * THE ONE PLACE the app decides whether a surface is frosted. Every component
 * that wants the look asks for a MATERIAL and gets whatever that means here —
 * which is the only way "turn the blur off" can ever be a single change rather
 * than an audit of thirty files.
 *
 * THE BLUR IS THE ENHANCEMENT, NOT THE DESIGN. Three situations render the
 * opaque material, and none of them is exotic:
 *
 *   · Android, where efficient blur needs SDK 31+ RenderNode and, in expo-blur,
 *     a `BlurTargetView` wrapping the content behind every single pane. That is
 *     an architectural change to every screen for an effect Material Design
 *     does not ask for.
 *   · "Reduce Transparency", which is a person telling the OS that translucency
 *     costs them legibility.
 *   · `solid`, for anything that repeats.
 *
 * So the fallback must look finished on its own, and the component is written
 * fallback-first: the frosted version is the branch, not the base.
 */
export function GlassSurface({
  material = 'card',
  children,
  style,
  radius,
  bordered = true,
  highlighted = true,
  solid = false,
  ...rest
}: GlassSurfaceProps) {
  const theme = useTheme();
  const reducedTransparency = useReducedTransparency();
  const tokens = theme.materials[material];

  const frosted = supportsBlurMaterials && !reducedTransparency && !solid;

  const shell = useMemo<ViewStyle>(
    () => ({
      borderRadius: radius,
      // Required for the radius to clip the blur on BOTH platforms.
      overflow: radius === undefined ? undefined : 'hidden',
      borderWidth: bordered ? StyleSheet.hairlineWidth : 0,
      borderColor: bordered ? tokens.borderColor : undefined,
      backgroundColor: frosted ? 'transparent' : tokens.fallbackColor,
    }),
    [radius, bordered, tokens.borderColor, tokens.fallbackColor, frosted],
  );

  const body = (
    <>
      {/* The specular edge. One hairline, not a gradient: a gradient per pane
          is a texture upload per pane, and the effect is an edge catching
          light, not a wash. */}
      {highlighted ? (
        <View
          pointerEvents="none"
          style={[styles.highlight, { backgroundColor: tokens.highlightColor }]}
        />
      ) : null}
      {children}
    </>
  );

  if (!frosted) {
    return (
      <View style={[shell, style]} {...rest}>
        {body}
      </View>
    );
  }

  return (
    <BlurView
      intensity={tokens.intensity}
      tint={tokens.blurTint}
      style={[shell, style]}
      {...rest}
    >
      {/* Painted OVER the blur so the pane keeps its tone over any wallpaper.
          Without it, a photo behind the pane decides what colour it is. */}
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: tokens.tintColor }]}
      />
      {body}
    </BlurView>
  );
}

const styles = StyleSheet.create({
  highlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
  },
});
