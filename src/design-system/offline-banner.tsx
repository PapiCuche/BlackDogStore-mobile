import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useConnectivity } from '@/connectivity/connectivity-provider';
import { useTheme } from '@/theme/theme-provider';

import { GlassSurface } from './glass-surface';
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
 *
 * UI7 made it a pane of `chrome` material. It sits above every screen, under
 * the status bar, which is exactly what that material is for. The amber stays:
 * it is a status colour, so the tenant's brand does not touch it and the
 * material does not wash it out — the tint is painted OVER the pane, not
 * mixed into it.
 */
export function OfflineBanner() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { isOffline } = useConnectivity();

  if (!isOffline) return null;

  return (
    <GlassSurface
      material="chrome"
      bordered={false}
      accessible
      accessibilityRole="alert"
      accessibilityLabel="Sin conexión. Mostrando la información disponible."
      style={{
        paddingTop: insets.top,
        paddingLeft: insets.left,
        paddingRight: insets.right,
        borderBottomWidth: theme.sizes.hairline,
        borderBottomColor: theme.colors.border,
      }}
    >
      {/* The status wash, over the material rather than instead of it. */}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: theme.colors.statusWarningSurface, opacity: 0.9 },
        ]}
      />
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
    </GlassSurface>
  );
}
