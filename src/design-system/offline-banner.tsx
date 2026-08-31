import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useConnectivity } from '@/connectivity/connectivity-provider';
import { useTheme } from '@/theme/theme-provider';

import { Icon, icons } from './icon';
import { Text } from './text';

/**
 * A slim bar shown only while the device is genuinely offline.
 *
 * Design constraints, each one deliberate:
 *
 *  - **Not a modal, not a toast.** Losing signal is not an event that deserves
 *    to interrupt what someone is doing. It is a condition, so it gets a strip.
 *  - **Does not cover content.** It sits under the status bar and pushes
 *    nothing; the screen underneath stays usable with whatever it already has.
 *  - **`unknown` shows nothing.** Announcing "sin conexión" before the OS has
 *    answered would be a false alarm on every cold start.
 *  - **Disappears on its own.** Reconnecting needs no confirmation dialog; the
 *    bar going away IS the confirmation.
 *
 * Accessibility: `alert` role so the change is announced once when it appears,
 * and the meaning is carried by TEXT — the amber tint is reinforcement, never
 * the signal.
 */
export function OfflineBanner() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { isOffline } = useConnectivity();

  if (!isOffline) return null;

  return (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLabel="Sin conexión. Mostrando la información disponible."
      style={{
        paddingTop: insets.top,
        paddingLeft: insets.left,
        paddingRight: insets.right,
        backgroundColor: theme.colors.statusWarningSurface,
        borderBottomWidth: theme.sizes.hairline,
        borderBottomColor: theme.colors.border,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.xs,
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.xs,
        }}
      >
        <Icon name={icons.offline} size={theme.sizes.iconSm} color={theme.colors.statusWarning} />

        <View style={{ flex: 1 }}>
          {/* Two lines: what happened, and what it means for what they see. */}
          <Text variant="caption" style={{ color: theme.colors.statusWarning, fontWeight: '600' }}>
            Sin conexión
          </Text>
          <Text variant="caption" style={{ color: theme.colors.statusWarning }}>
            Mostrando la información disponible.
          </Text>
        </View>
      </View>
    </View>
  );
}
