import { Stack, router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import {
  AppHeader,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  icons,
  KeyValueRow,
  LoadingState,
  Screen,
  SectionHeader,
  Text,
} from '@/design-system';
import { CAP_SERVICE_DEVICES_VIEW } from '@/domain/internal/service-types';
import { hasUxCapability } from '@/domain/internal/types';
import { useInternalContext } from '@/hooks/use-internal-sales';
import { useServiceDevice } from '@/hooks/use-internal-service';
import { useTheme } from '@/theme/theme-provider';
import { formatDate } from '@/utils/format';

/**
 * One device and every time it has been in the shop — DEVICE-IDENTITY.
 *
 * WHY THE VISIT LIST IS THE POINT. A technician holding a phone that was here
 * in March needs to see March — the same screen replaced under warranty, the
 * same customer — not a count that says "2". The server orders it newest first
 * and this screen does not reorder it.
 *
 * `service.devices.view` gates it, and the server re-checks: a device of
 * another company is not found rather than refused.
 */
export default function ServiceDeviceScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const parsed = Number(id);
  const deviceId = Number.isFinite(parsed) ? parsed : undefined;

  const { data: context, isPending: contextPending } = useInternalContext();
  const mayView = hasUxCapability(context ?? null, CAP_SERVICE_DEVICES_VIEW);
  const query = useServiceDevice(deviceId, { enabled: mayView });
  const { data: device, isPending, isError, error, refetch } = query;

  if (contextPending || (mayView && isPending)) {
    return (
      <>
        <Stack.Screen options={{ title: 'Equipo' }} />
        <Screen scrollable>
          <LoadingState label="Cargando equipo" />
        </Screen>
      </>
    );
  }

  if (!mayView) {
    return (
      <>
        <Stack.Screen options={{ title: 'Equipo' }} />
        <Screen scrollable contentContainerStyle={{ flexGrow: 1 }}>
          <EmptyState
            icon={icons.info}
            title="No puedes ver equipos"
            message="Consultar la ficha de un equipo necesita un permiso que no tienes."
          />
        </Screen>
      </>
    );
  }

  if (isError || !device) {
    return (
      <>
        <Stack.Screen options={{ title: 'Equipo' }} />
        <Screen scrollable contentContainerStyle={{ flexGrow: 1 }}>
          <ErrorState error={error} onRetry={() => void refetch()} />
        </Screen>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Equipo' }} />
      <Screen scrollable>
        <View style={{ gap: theme.spacing.md }}>
          <AppHeader
            title={device.displayName}
            eyebrow={device.deviceTypeLabel}
            subtitle={device.customerName}
          />

          <Card>
            <View style={{ gap: theme.spacing.xs }}>
              <KeyValueRow label="Marca" value={device.brand || '—'} />
              <KeyValueRow label="Modelo" value={device.model || '—'} />
              <KeyValueRow label="Número de serie" value={device.serialNumber || '—'} />
              <KeyValueRow label="IMEI" value={device.imei || '—'} />
              <KeyValueRow label="Color" value={device.color || '—'} />
              <KeyValueRow label="Capacidad" value={device.storageCapacity || '—'} />
              {device.notes ? (
                <>
                  <Divider />
                  <Text variant="subhead" color="textSecondary">
                    {device.notes}
                  </Text>
                </>
              ) : null}
            </View>
          </Card>

          <View>
            <SectionHeader title="Veces que estuvo aquí" />
            {device.repairOrders.length === 0 ? (
              <Card variant="outlined">
                <Text variant="subhead" color="textSecondary">
                  Es la primera vez que este equipo entra al taller.
                </Text>
              </Card>
            ) : (
              <View style={{ gap: theme.spacing.sm }}>
                {device.repairOrders.map((visit) => (
                  <Card
                    key={visit.id}
                    variant="outlined"
                    onPress={() => router.push(`/internal/service/orders/${visit.id}`)}
                    accessibilityLabel={`Orden ${visit.number}`}
                    accessibilityHint="Abre la orden de servicio"
                  >
                    <View style={{ gap: 2 }}>
                      <Text variant="headline">{visit.number}</Text>
                      <Text variant="caption" color="textTertiary">
                        {`${formatDate(visit.receivedAt)} · ${visit.status}`}
                      </Text>
                    </View>
                  </Card>
                ))}
              </View>
            )}
          </View>
        </View>
      </Screen>
    </>
  );
}
