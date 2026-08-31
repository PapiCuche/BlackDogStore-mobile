import { View } from 'react-native';

import { Icon, icons, Text } from '@/design-system';
import { repairStageLabel } from '@/domain/repairs/status';
import {
  REPAIR_STAGES,
  isStageComplete,
  isStageCurrent,
  type Repair,
} from '@/domain/repairs/types';
import { useTheme } from '@/theme/theme-provider';
import { formatDate } from '@/utils/format';

/**
 * The repair lifecycle, drawn as a vertical timeline.
 *
 * The stage list is `REPAIR_STAGES`, not the entries in `repair.timeline` — the
 * customer needs to see the stages still ahead of their device, not only the
 * ones it has already passed. Entries supply the dates for the stages that have
 * happened.
 *
 * Nothing here invents a rule the backend will be held to; the sequence is
 * MOBILE's proposal (BR-005) and lives in the domain layer, not in this view.
 */
export function RepairTimeline({ repair }: { repair: Repair }) {
  const theme = useTheme();

  if (repair.status === 'cancelled') {
    return (
      <View
        accessible
        accessibilityLabel="Esta reparación fue cancelada."
        style={{
          padding: theme.spacing.md,
          borderRadius: theme.radius.md,
          backgroundColor: theme.colors.statusDangerSurface,
        }}
      >
        <Text variant="subhead" style={{ color: theme.colors.statusDanger }}>
          Esta reparación fue cancelada.
        </Text>
      </View>
    );
  }

  return (
    <View accessibilityRole="list" style={{ gap: 0 }}>
      {REPAIR_STAGES.map((stage, index) => {
        const entry = repair.timeline.find((item) => item.stage === stage);
        const done = isStageComplete(stage, repair.status);
        const current = isStageCurrent(stage, repair.status);
        const isLast = index === REPAIR_STAGES.length - 1;

        const markerColor = current
          ? theme.colors.statusProgress
          : done
            ? theme.colors.statusSuccess
            : theme.colors.borderStrong;

        const stateWord = current ? 'en curso' : done ? 'completado' : 'pendiente';

        return (
          <View
            key={stage}
            accessible
            accessibilityRole="text"
            accessibilityLabel={
              entry?.occurredAt
                ? `${repairStageLabel(stage)}, ${stateWord}, ${formatDate(entry.occurredAt)}`
                : `${repairStageLabel(stage)}, ${stateWord}`
            }
            style={{ flexDirection: 'row', gap: theme.spacing.sm }}
          >
            {/* Rail: marker plus the connector down to the next stage. */}
            <View style={{ alignItems: 'center', width: theme.sizes.iconMd }}>
              <View
                style={{
                  width: current ? 16 : 12,
                  height: current ? 16 : 12,
                  borderRadius: 8,
                  marginTop: 4,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: done || current ? markerColor : 'transparent',
                  borderWidth: done || current ? 0 : 1.5,
                  borderColor: markerColor,
                }}
              >
                {done ? <Icon name={icons.check} size={8} color={theme.colors.background} /> : null}
              </View>

              {!isLast ? (
                <View
                  style={{
                    flex: 1,
                    width: 2,
                    minHeight: theme.spacing.xl,
                    marginVertical: 2,
                    backgroundColor: done ? theme.colors.statusSuccess : theme.colors.border,
                  }}
                />
              ) : null}
            </View>

            <View style={{ flex: 1, paddingBottom: isLast ? 0 : theme.spacing.md, gap: 2 }}>
              <Text
                variant={current ? 'headline' : 'callout'}
                color={done || current ? 'textPrimary' : 'textTertiary'}
              >
                {repairStageLabel(stage)}
              </Text>

              {entry?.occurredAt ? (
                <Text variant="footnote" color="textTertiary">
                  {formatDate(entry.occurredAt)}
                </Text>
              ) : null}

              {entry?.note ? (
                <Text variant="footnote" color="textSecondary">
                  {entry.note}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}
