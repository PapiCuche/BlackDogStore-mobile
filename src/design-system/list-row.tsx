import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { useTheme } from '@/theme/theme-provider';

import { Icon, icons, type IconName } from './icon';
import { Text } from './text';

export type ListRowProps = {
  label: string;
  /** Secondary line under the label. */
  description?: string;
  /** Right-aligned value, e.g. the current theme name. */
  value?: string;
  icon?: IconName;
  onPress?: () => void;
  /** Renders the label and icon in the destructive colour. */
  destructive?: boolean;
  /** Replaces the value/chevron, e.g. with a Switch. */
  trailing?: ReactNode;
  accessibilityHint?: string;
};

/**
 * A settings-style row.
 *
 * Used by Profile. The chevron appears only when the row actually navigates,
 * because a chevron on a row that does nothing is a promise the UI does not
 * keep.
 */
export function ListRow({
  label,
  description,
  value,
  icon,
  onPress,
  destructive = false,
  trailing,
  accessibilityHint,
}: ListRowProps) {
  const theme = useTheme();
  const foreground = destructive ? theme.colors.danger : theme.colors.textPrimary;

  const content = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        minHeight: theme.sizes.minTouchTarget,
        paddingVertical: theme.spacing.sm,
        paddingHorizontal: theme.spacing.md,
      }}
    >
      {icon ? (
        <Icon
          name={icon}
          size={theme.sizes.iconMd}
          color={destructive ? theme.colors.danger : theme.colors.textSecondary}
        />
      ) : null}

      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body" style={{ color: foreground }}>
          {label}
        </Text>
        {description ? (
          <Text variant="footnote" color="textTertiary">
            {description}
          </Text>
        ) : null}
      </View>

      {trailing ??
        (value ? (
          <Text variant="subhead" color="textSecondary">
            {value}
          </Text>
        ) : null)}

      {onPress && !trailing ? (
        <Icon name={icons.chevronRight} size={theme.sizes.iconSm} color={theme.colors.textTertiary} />
      ) : null}
    </View>
  );

  if (!onPress) {
    return content;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => (pressed ? { backgroundColor: theme.colors.surfacePressed } : null)}
    >
      {content}
    </Pressable>
  );
}
