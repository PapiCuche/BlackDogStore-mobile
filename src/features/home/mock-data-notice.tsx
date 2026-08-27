import { View } from 'react-native';

import { Icon, icons, Text } from '@/design-system';
import { useTheme } from '@/theme/theme-provider';

/**
 * The "this is sample data" marker.
 *
 * Non-negotiable while the app runs on fixtures. A demo screen that looks
 * indistinguishable from live data is how a stakeholder ends up believing a
 * feature is integrated, and how a customer ends up believing a repair exists.
 */
export function MockDataNotice({ message }: { message: string }) {
  const theme = useTheme();

  return (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLabel={`Datos de ejemplo. ${message}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs,
        paddingVertical: theme.spacing.xs,
        paddingHorizontal: theme.spacing.sm,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.statusWarningSurface,
      }}
    >
      <Icon name={icons.info} size={theme.sizes.iconSm} color={theme.colors.statusWarning} />
      <Text variant="caption" style={{ flex: 1, color: theme.colors.statusWarning }}>
        {message}
      </Text>
    </View>
  );
}
