import { View } from 'react-native';

import { Icon, icons, Text } from '@/design-system';
import type { Repair } from '@/domain/repairs/types';
import { useTheme } from '@/theme/theme-provider';
import { formatDate } from '@/utils/format';

/**
 * What has happened to this device, newest last.
 *
 * M8 CHANGED WHAT THIS DRAWS. It used to render the fixed ladder
 * `REPAIR_STAGES` and mark the stages still ahead as pending, which was right
 * for a seven-stage lifecycle that ended in "entregado". The real machine stops
 * at `waiting_approval`: approval needs a quote, a quote needs a diagnosis, and
 * neither module exists yet. Drawing "Entregado — pendiente" underneath would
 * promise a step this version of the product cannot take.
 *
 * So the timeline is now the SERVER's events, and only the ones it decided this
 * customer may see. Nothing is filtered here — the hidden events never arrive,
 * which is a stronger guarantee than asking a component not to render them.
 *
 * Every label is the tenant's own word, carried on the event.
 */
export function RepairTimeline({ repair }: { repair: Repair }) {
  const theme = useTheme();

  if (repair.timeline.length === 0) {
    return (
      <Text variant="subhead" color="textSecondary">
        Todavía no hay novedades para mostrar.
      </Text>
    );
  }

  return (
    <View accessibilityRole="list" style={{ gap: 0 }}>
      {repair.timeline.map((entry, index) => {
        const isLast = index === repair.timeline.length - 1;
        // The last event is where the device IS. Everything above it happened.
        const current = isLast;
        const tone = entry.status === 'cancelled'
          ? theme.colors.statusDanger
          : current
            ? theme.colors.textPrimary
            : theme.colors.statusSuccess;

        return (
          <View
            key={entry.id}
            accessibilityRole="text"
            accessibilityLabel={`${entry.statusLabel}, ${formatDate(entry.occurredAt)}`}
            style={{ flexDirection: 'row', gap: theme.spacing.sm }}
          >
            {/* Rail: marker plus the connector down to the next event. */}
            <View style={{ alignItems: 'center', width: theme.sizes.iconMd }}>
              <View
                style={{
                  width: theme.sizes.iconMd,
                  height: theme.sizes.iconMd,
                  borderRadius: theme.sizes.iconMd / 2,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: current
                    ? theme.colors.surfaceSubtle
                    : 'transparent',
                  borderWidth: theme.sizes.hairline,
                  borderColor: tone,
                }}
              >
                <Icon
                  name={entry.status === 'cancelled' ? icons.close : icons.check}
                  size={theme.sizes.iconSm}
                  color={tone}
                />
              </View>

              {!isLast ? (
                <View
                  style={{
                    flex: 1,
                    width: theme.sizes.hairline,
                    minHeight: theme.spacing.md,
                    backgroundColor: theme.colors.border,
                  }}
                />
              ) : null}
            </View>

            <View style={{ flex: 1, paddingBottom: isLast ? 0 : theme.spacing.md, gap: 2 }}>
              <Text variant="subhead" color={current ? 'textPrimary' : 'textSecondary'}>
                {entry.statusLabel}
              </Text>
              <Text variant="caption" color="textTertiary">
                {formatDate(entry.occurredAt)}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}
