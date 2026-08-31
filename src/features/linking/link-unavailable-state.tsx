import { View } from 'react-native';

import { Icon, icons, Text } from '@/design-system';
import { useTheme } from '@/theme/theme-provider';

/**
 * Shown when an incoming link cannot be opened.
 *
 * ONE MESSAGE FOR EVERY REASON, and that is the security property, not a
 * shortcut. If an expired link, a link for another company and a link to
 * somebody else's order each produced different copy, the screen would become
 * an existence oracle: anyone could probe ids and read the answer off the UI.
 *
 * It also does not claim the link "expired". Only the backend can know that,
 * and asserting it locally would be a guess presented as fact.
 */
export function LinkUnavailableState({
  title = 'No pudimos abrir este enlace',
  message = 'Puede haber expirado o no estar disponible para esta cuenta.',
}: {
  title?: string;
  message?: string;
}) {
  const theme = useTheme();

  return (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLabel={`${title}. ${message}`}
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.sm,
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.section,
      }}
    >
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.surfaceSubtle,
        }}
      >
        <Icon name={icons.info} size={theme.sizes.iconXl} color={theme.colors.textTertiary} />
      </View>

      <Text variant="title3" center accessibilityRole="header">
        {title}
      </Text>

      <Text variant="subhead" color="textSecondary" center style={{ maxWidth: 320 }}>
        {message}
      </Text>
    </View>
  );
}
