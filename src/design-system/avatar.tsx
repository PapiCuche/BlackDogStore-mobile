import { View } from 'react-native';

import { useTheme } from '@/theme/theme-provider';

import { Text } from './text';

export type AvatarProps = {
  /** Two characters at most. Produced by `initials()` in the customer domain. */
  initials: string;
  size?: 'sm' | 'md' | 'lg';
  /** Full name, for the screen reader. */
  accessibilityLabel?: string;
};

/**
 * Initials avatar.
 *
 * There is no image variant because Django's user model has no avatar field —
 * adding one here would be a placeholder for a feature the backend cannot fill.
 */
export function Avatar({ initials, size = 'md', accessibilityLabel }: AvatarProps) {
  const theme = useTheme();

  const dimension =
    size === 'sm' ? theme.sizes.avatarSm : size === 'lg' ? theme.sizes.avatarLg : theme.sizes.avatarMd;
  const variant = size === 'lg' ? 'title2' : size === 'sm' ? 'caption' : 'headline';

  return (
    <View
      accessible={accessibilityLabel !== undefined}
      accessibilityLabel={accessibilityLabel}
      style={{
        width: dimension,
        height: dimension,
        borderRadius: dimension / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surfaceSubtle,
        borderWidth: theme.sizes.hairline,
        borderColor: theme.colors.border,
      }}
    >
      <Text variant={variant} color="textSecondary" style={{ fontWeight: '600' }}>
        {initials}
      </Text>
    </View>
  );
}
