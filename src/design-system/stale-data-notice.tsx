import { View } from 'react-native';

import { useTheme } from '@/theme/theme-provider';

import { Icon, icons } from './icon';
import { Text } from './text';

/**
 * Shown above content that is cached and may be out of date.
 *
 * The case it covers: the device is offline but we already have data. Blanking
 * the screen would be worse than useless — the customer's order is still their
 * order, and yesterday's copy of it is better than an error page. But letting
 * them believe it is live would be a lie they might act on.
 *
 * So the data stays and the caveat is stated, in product language. "Sin
 * conexión" is a fact anyone can act on; "stale cache" is not.
 */
export function StaleDataNotice({
  message = 'Sin conexión. Esta información puede no estar actualizada.',
}: {
  message?: string;
}) {
  const theme = useTheme();

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={message}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs,
        paddingVertical: theme.spacing.xs,
        paddingHorizontal: theme.spacing.sm,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.surfaceSubtle,
      }}
    >
      <Icon name={icons.offline} size={theme.sizes.iconSm} color={theme.colors.textTertiary} />
      <Text variant="caption" color="textTertiary" style={{ flex: 1 }}>
        {message}
      </Text>
    </View>
  );
}
