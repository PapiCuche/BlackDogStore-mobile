import { Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import {
  Card,
  Divider,
  EmptyState,
  ErrorState,
  icons,
  LoadingState,
  Screen,
  SectionHeader,
  StatusBadge,
  Text,
} from '@/design-system';
import { describeRepairStatus } from '@/domain/repairs/status';
import { RepairTimeline } from '@/features/repairs/repair-timeline';
import { useRepair } from '@/hooks/use-repairs';
import { useTheme } from '@/theme/theme-provider';
import { formatDate, formatRelativeTime } from '@/utils/format';

/**
 * Repair detail.
 *
 * The timeline is the point of this screen: a customer without their device
 * wants to know where in the process it is and when it last moved. Everything
 * else is supporting detail.
 */
export default function RepairDetailScreen() {
  const theme = useTheme();
  // A URL segment is a string; the domain id is a number. Converted at the
  // boundary rather than widening the type inwards — the deep-link layer has no
  // business knowing what a primary key looks like.
  const { id } = useLocalSearchParams<{ id: string }>();
  const repairId = Number(id);
  const { data: repair, isPending, isError, error, refetch } = useRepair(
    Number.isFinite(repairId) ? repairId : undefined,
  );

  if (isPending) {
    return (
      <Screen scrollable>
        <LoadingState label="Cargando reparación" />
      </Screen>
    );
  }

  if (isError) {
    return (
      <Screen scrollable contentContainerStyle={{ flexGrow: 1 }}>
        <ErrorState error={error} onRetry={() => void refetch()} />
      </Screen>
    );
  }

  if (!repair) {
    return (
      <Screen contentContainerStyle={{ flexGrow: 1 }}>
        <EmptyState
          icon={icons.warning}
          title="Reparación no encontrada"
          message="Es posible que este servicio ya no esté disponible."
        />
      </Screen>
    );
  }

  const status = describeRepairStatus(repair.status, repair.statusLabel);

  return (
    <>
      {/* The native header title becomes the service code, so the back stack
          reads correctly when several repairs are open. */}
      <Stack.Screen options={{ title: repair.number }} />

      <Screen scrollable>
        <View style={{ gap: theme.spacing.xl, paddingTop: theme.spacing.sm }}>
          <View style={{ gap: theme.spacing.sm }}>
            <View style={{ gap: 2 }}>
              <Text variant="overline" color="textTertiary" style={{ textTransform: 'uppercase' }}>
                Servicio técnico
              </Text>
              <Text variant="title1" accessibilityRole="header">
                {repair.deviceSummary}
              </Text>
            </View>

            <StatusBadge
              label={status.label}
              tone={status.tone}
              accessibilityPrefix="Estado de la reparación"
            />

            <Text variant="footnote" color="textTertiary">
              Actualizado {formatRelativeTime(repair.updatedAt)}
            </Text>
          </View>

          <Card>
            <View style={{ gap: theme.spacing.sm }}>
              <DetailRow label="Número de servicio" value={repair.number} mono />
              <Divider />
              <DetailRow label="Recibido" value={formatDate(repair.receivedAt)} />
              <Divider />
              <DetailRow label="Motivo" value={repair.reportedIssue} />
              {repair.closedAt ? (
                <>
                  <Divider />
                  <DetailRow label="Cerrado" value={formatDate(repair.closedAt)} />
                </>
              ) : null}
            </View>
          </Card>

          <View>
            <SectionHeader title="Seguimiento" />
            <Card>
              <RepairTimeline repair={repair} />
            </Card>
          </View>

        </View>
      </Screen>
    </>
  );
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <View accessible accessibilityLabel={`${label}: ${value}`} style={{ gap: 2 }}>
      <Text variant="caption" color="textTertiary">
        {label}
      </Text>
      <Text variant={mono ? 'mono' : 'callout'}>{value}</Text>
    </View>
  );
}
