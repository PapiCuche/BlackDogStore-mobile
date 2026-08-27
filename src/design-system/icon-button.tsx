import { Pressable, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/theme-provider';

import { Icon, type IconName } from './icon';

export type IconButtonProps = {
  icon: IconName;
  onPress: () => void;
  /** REQUIRED. An icon-only control is invisible to a screen reader without it. */
  accessibilityLabel: string;
  accessibilityHint?: string;
  variant?: 'plain' | 'filled';
  disabled?: boolean;
  style?: ViewStyle;
};

/**
 * An icon-only control.
 *
 * `accessibilityLabel` is a required prop, not an optional one. That is the
 * whole point of having this component: it makes the accessible name
 * impossible to forget rather than merely recommended.
 *
 * The touch target is always `minTouchTarget` (44pt) even when the glyph inside
 * is 20pt.
 */
export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  variant = 'plain',
  disabled = false,
  style,
}: IconButtonProps) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        {
          width: theme.sizes.minTouchTarget,
          height: theme.sizes.minTouchTarget,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: variant === 'filled' ? theme.radius.md : theme.radius.pill,
          backgroundColor:
            pressed
              ? theme.colors.surfacePressed
              : variant === 'filled'
                ? theme.colors.surface
                : 'transparent',
          opacity: disabled ? 0.4 : 1,
        },
        style,
      ]}
    >
      <Icon name={icon} size={theme.sizes.iconLg} color={theme.colors.textPrimary} />
    </Pressable>
  );
}
