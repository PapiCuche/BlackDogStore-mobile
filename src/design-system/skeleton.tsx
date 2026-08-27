import { useEffect, useState } from 'react';
import { Animated, Easing, View, type ViewStyle } from 'react-native';

import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useTheme } from '@/theme/theme-provider';

export type SkeletonProps = {
  width?: ViewStyle['width'];
  height?: number;
  radius?: number;
  style?: ViewStyle;
};

/**
 * A loading placeholder.
 *
 * Uses React Native's `Animated` rather than Reanimated: this is a single
 * looping opacity on the JS driver's `useNativeDriver` path, which needs none
 * of Reanimated's worklet machinery and stays trivially testable.
 *
 * Under Reduce Motion the pulse stops entirely and a static block is shown. A
 * pulsing skeleton is decorative motion, and decorative motion is exactly what
 * that setting exists to suppress.
 */
export function Skeleton({ width = '100%', height = 16, radius, style }: SkeletonProps) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  // Lazily-initialised state, not a ref: the value must be stable across
  // renders AND readable during render to build the interpolation below, and
  // reading `ref.current` during render is exactly what React forbids.
  const [pulse] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reducedMotion) {
      pulse.setValue(0);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse, reducedMotion]);

  return (
    <Animated.View
      // Hidden from assistive tech: a screen reader should hear the screen's
      // "Cargando" announcement, not a series of anonymous grey rectangles.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width,
          height,
          borderRadius: radius ?? theme.radius.sm,
          backgroundColor: theme.colors.skeleton,
          opacity: reducedMotion ? 1 : pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.45] }),
        },
        style,
      ]}
    />
  );
}

/** A card-shaped skeleton, matching the real cards it stands in for. */
export function SkeletonCard() {
  const theme = useTheme();
  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radius.lg,
        padding: theme.spacing.md,
        gap: theme.spacing.sm,
      }}
    >
      <Skeleton width="45%" height={12} />
      <Skeleton width="80%" height={20} />
      <Skeleton width="35%" height={24} radius={theme.radius.pill} />
    </View>
  );
}
