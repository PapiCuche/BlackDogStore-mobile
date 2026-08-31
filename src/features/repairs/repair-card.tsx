import { View } from 'react-native';

import { Card, StatusBadge, Text } from '@/design-system';
import { describeRepairStatus } from '@/domain/repairs/status';
import type { Repair } from '@/domain/repairs/types';
import { useTheme } from '@/theme/theme-provider';
import { formatRelativeTime } from '@/utils/format';

export type RepairCardProps = {
  repair: Repair;
  onPress: () => void;
};

/**
 * One repair in a list.
 *
 * The whole card is a single accessible button with a composed label, rather
 * than four separately focusable fragments — a VoiceOver user swiping through a
 * list wants one stop per repair, not one per line of text.
 */
export function RepairCard({ repair, onPress }: RepairCardProps) {
  const theme = useTheme();
  const status = describeRepairStatus(repair.status);
  const updated = formatRelativeTime(repair.updatedAt);

  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`${repair.deviceName}, ${repair.code}. ${status.label}. Actualizado ${updated}`}
      accessibilityHint="Abre el seguimiento de la reparación"
    >
      <View style={{ gap: theme.spacing.xs }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: theme.spacing.sm,
          }}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="mono" color="textTertiary">
              {repair.code}
            </Text>
            <Text variant="headline" numberOfLines={1}>
              {repair.deviceName}
            </Text>
          </View>
        </View>

        <Text variant="footnote" color="textSecondary" numberOfLines={2}>
          {repair.reportedIssue}
        </Text>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: theme.spacing.xs,
            marginTop: theme.spacing.xxs,
          }}
        >
          {/* The badge is inside the card's accessibility label already, so it
              is hidden from the reader to avoid announcing the status twice. */}
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <StatusBadge label={status.label} tone={status.tone} size="small" />
          </View>
          <Text variant="caption" color="textTertiary">
            {updated}
          </Text>
        </View>
      </View>
    </Card>
  );
}
