import type { ReactNode } from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/theme-provider';

export type CardProps = {
  children: ReactNode;
  /** Makes the whole card a single control. Omit for a static container. */
  onPress?: () => void;
  /** Required when `onPress` is set — a tappable card must announce itself. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** `elevated` lifts the card off the page. Use for the Home hero only. */
  variant?: 'default' | 'elevated' | 'outlined';
  padded?: boolean;
  style?: ViewStyle;
};

/**
 * The container everything sits in.
 *
 * Depth comes from the surface ramp first and a shadow second — in dark mode
 * `elevation()` returns nothing at all and `surfaceElevated` does the work,
 * because a black shadow on a black page is invisible.
 */
export function Card({
  children,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  variant = 'default',
  padded = true,
  style,
}: CardProps) {
  const theme = useTheme();

  const base: ViewStyle = {
    backgroundColor:
      variant === 'elevated' ? theme.colors.surfaceElevated : theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: padded ? theme.spacing.md : 0,
    ...(variant === 'outlined'
      ? { borderWidth: theme.sizes.hairline, borderColor: theme.colors.border }
      : null),
    ...(variant === 'elevated' ? theme.elevation('card') : null),
  };

  if (!onPress) {
    return <View style={[base, style]}>{children}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [
        base,
        // A pressed card changes fill rather than scaling or fading: opacity on
        // a whole card dims its text too, which reads as "disabled".
        pressed ? { backgroundColor: theme.colors.surfacePressed } : null,
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}
