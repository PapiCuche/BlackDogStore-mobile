import { ActivityIndicator, Pressable, View, type ViewStyle } from 'react-native';

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
 * `primary` is INK on light and WHITE on dark, not gold. That follows the brand
 * master document directly: "Usar negro, blanco y gris como sistema principal.
 * Reservar el dorado para detalles, sellos o llamadas puntuales." Gold at 4.5:1
 * against white is also not a passing contrast ratio for a filled control.
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
