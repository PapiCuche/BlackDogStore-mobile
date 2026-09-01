import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { hapticSelection } from '@/utils/haptics';
import { useTheme } from '@/theme/theme-provider';

import { Icon, type IconName } from './icon';
import { Text } from './text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'default' | 'compact';

export type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  /** Shows a spinner and blocks presses. The label stays for layout stability. */
  loading?: boolean;
  icon?: IconName;
  /** Stretches to fill its container. Primary actions usually want this. */
  fullWidth?: boolean;
  accessibilityHint?: string;
  /** Suppress the selection haptic — e.g. inside a list of many buttons. */
  haptic?: boolean;
  style?: ViewStyle;
};

/**
 * The primary control.
 *
 * `primary` is INK on light and WHITE on dark, and it stays that way even when
 * the tenant has a brand colour. That is a deliberate limit on what a brand may
 * repaint (UI7): the primary button is the most contrast-critical surface in
 * the app, and a mid-tone brand fill is exactly where "make the button our
 * colour" quietly costs someone their reading. The tenant's colour reaches the
 * UI through accents, links and the active tab — places where `accentText` has
 * already been corrected against the page.
 *
 * A filled button carries the same specular top hairline as every other pane,
 * so it reads as the same material as the cards around it rather than as a
 * rectangle of paint.
 *
 * Height is `sizes.control` (52) and never drops below `minTouchTarget` (44)
 * even in `compact`, which is the HIG floor.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'default',
  disabled = false,
  loading = false,
  icon,
  fullWidth = false,
  accessibilityHint,
  haptic = true,
  style,
}: ButtonProps) {
  const theme = useTheme();
  const isInert = disabled || loading;

  const palette = {
    primary: {
      background: theme.colors.actionBackground,
      pressed: theme.colors.actionBackgroundPressed,
      foreground: theme.colors.textOnAction,
      border: 'transparent',
    },
    secondary: {
      background: theme.colors.surface,
      pressed: theme.colors.surfacePressed,
      foreground: theme.colors.textPrimary,
      border: theme.colors.border,
    },
    ghost: {
      background: 'transparent',
      pressed: theme.colors.surfacePressed,
      foreground: theme.colors.textPrimary,
      border: 'transparent',
    },
    destructive: {
      background: 'transparent',
      pressed: theme.colors.statusDangerSurface,
      foreground: theme.colors.danger,
      border: theme.colors.border,
    },
  }[variant];

  const handlePress = () => {
    if (isInert) return;
    if (haptic) hapticSelection();
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={isInert}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      // `busy` makes the spinner audible; without it a screen reader user gets
      // silence while a request is in flight.
      accessibilityState={{ disabled: isInert, busy: loading }}
      style={({ pressed }) => [
        {
          minHeight: size === 'compact' ? theme.sizes.controlCompact : theme.sizes.control,
          paddingHorizontal: theme.spacing.md,
          paddingVertical: theme.spacing.xs,
          borderRadius: theme.radius.md,
          // The specular hairline is absolutely positioned; without this it
          // would run straight past the rounded corners.
          overflow: 'hidden',
          borderWidth: theme.sizes.hairline,
          borderColor: palette.border,
          backgroundColor: pressed ? palette.pressed : palette.background,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: theme.spacing.xs,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          // Opacity rather than a muted colour: it reads as unavailable on both
          // schemes without needing a disabled token per variant.
          opacity: isInert ? 0.45 : 1,
        },
        style,
      ]}
    >
      {/* The specular edge, on the DARK filled variant only. A ghost button has
          no surface to catch light, and in dark mode the primary fill is already
          white — a white hairline on white is not a highlight, it is nothing.
          `pointerEvents` none so it never eats a tap. */}
      {variant === 'primary' && theme.scheme === 'light' ? (
        <View pointerEvents="none" style={styles.highlight} />
      ) : null}

      {loading ? (
        <ActivityIndicator size="small" color={palette.foreground} />
      ) : icon ? (
        <Icon name={icon} size={theme.sizes.iconMd} color={palette.foreground} />
      ) : null}

      <View>
        <Text
          variant="headline"
          numberOfLines={1}
          style={{ color: palette.foreground, textAlign: 'center' }}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  highlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
});
