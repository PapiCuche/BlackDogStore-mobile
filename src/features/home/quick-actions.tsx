import { Pressable, View } from 'react-native';

import { Icon, Text, type IconName } from '@/design-system';
import { useTheme } from '@/theme/theme-provider';

export type QuickAction = {
  key: string;
  label: string;
  icon: IconName;
  onPress: () => void;
  accessibilityHint?: string;
};

/**
 * The Home screen's shortcut row.
 *
 * Deliberately capped at three or four items. A grid of eight shortcuts is not
 * a shortcut, and the brief is explicit: "No saturar el Home."
 */
export function QuickActions({ actions }: { actions: readonly QuickAction[] }) {
  const theme = useTheme();

  return (
    <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
      {actions.map((action) => (
        <Pressable
          key={action.key}
          onPress={action.onPress}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          accessibilityHint={action.accessibilityHint}
          style={({ pressed }) => ({
            flex: 1,
            minHeight: 84,
            alignItems: 'center',
            justifyContent: 'center',
            gap: theme.spacing.xxs,
            paddingVertical: theme.spacing.sm,
            paddingHorizontal: theme.spacing.xxs,
            borderRadius: theme.radius.lg,
            borderWidth: theme.sizes.hairline,
            borderColor: theme.colors.border,
            backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.surface,
          })}
        >
          <Icon name={action.icon} size={theme.sizes.iconLg} color={theme.colors.textPrimary} />
          <Text variant="caption" color="textSecondary" center numberOfLines={2}>
            {action.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
