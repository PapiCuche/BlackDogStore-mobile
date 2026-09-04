import { router, Stack } from 'expo-router';
import { View } from 'react-native';

import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  icons,
  LoadingState,
  Screen,
  Text,
} from '@/design-system';
import {
  CAP_SERVICE_ORDERS_CREATE,
  CAP_SERVICE_ORDERS_VIEW,
} from '@/domain/internal/service-types';
import { hasUxCapability } from '@/domain/internal/types';
import { useServiceContext, useServiceOrders } from '@/hooks/use-internal-service';
import { useInternalContext } from '@/hooks/use-internal-sales';
import { useTheme } from '@/theme/theme-provider';

/**
 * The workshop's entrance.
 *
 * DELIBERATELY SMALL, AND NOT FOR THE ORIGINAL REASON. This screen used to be
 * small because diagnosis, quotes, parts, quality and payments did not exist.
 * They exist now — seven sections in the order detail, against V1 endpoints the
 * backend has shipped — and this screen stayed small anyway, because the order
 * IS the workspace. Every one of those steps happens to a specific device on a
 * specific order; a tile here would only be a longer road to the same place.
 *
 * So the two doors are the two ways to reach an order: the list, and receiving
 * a new device. What changed is the reason, not the layout.
 *
 * Everything drawn comes from FRESH capabilities and the server's own context —
 * the lifecycle labels are the tenant's words, and the branches are the ones
 * this member may actually receive a device into.
 */
export default function ServiceHomeScreen() {
  const theme = useTheme();

  const { data: context, isPending: contextPending } = useInternalContext();
  const mayView = hasUxCapability(context ?? null, CAP_SERVICE_ORDERS_VIEW);
  const mayCreate = hasUxCapability(context ?? null, CAP_SERVICE_ORDERS_CREATE);

  const service = useServiceContext({ enabled: mayView });
  const open = useServiceOrders({}, { enabled: mayView });

  const title = 'Servicio técnico';

  if (contextPending) {
    return (
      <>
        <Stack.Screen options={{ title }} />
        <Screen scrollable>
          <LoadingState label="Cargando servicio técnico" skeletonCount={3} />
        </Screen>
      </>
    );
  }

  // Checked BEFORE `isPending`: the queries are disabled without the
  // capability, so they stay pending forever and a spinner would be the last
  // thing this person ever saw.
  if (!mayView) {
    return (
      <>
        <Stack.Screen options={{ title }} />
        <Screen scrollable contentContainerStyle={{ flexGrow: 1 }}>
          <EmptyState
            icon={icons.info}
            title="Ya no tienes acceso a este módulo"
            message="Tu cuenta no tiene permiso para ver el servicio técnico de esta empresa."
            actionLabel="Volver al área interna"
            onAction={() => router.replace('/internal')}
          />
        </Screen>
      </>
    );
  }

  if (service.isError) {
    return (
      <>
        <Stack.Screen options={{ title }} />
        <Screen scrollable contentContainerStyle={{ flexGrow: 1 }}>
          <ErrorState error={service.error} onRetry={() => void service.refetch()} />
        </Screen>
      </>
    );
  }

  if (service.isPending) {
    return (
      <>
        <Stack.Screen options={{ title }} />
        <Screen scrollable>
          <LoadingState label="Cargando servicio técnico" skeletonCount={3} />
        </Screen>
      </>
    );
  }

  const branches = service.data.availableBranches;

  return (
    <>
      <Stack.Screen options={{ title }} />
      <Screen scrollable>
        <View style={{ gap: theme.spacing.md }}>
          <View style={{ gap: 2 }}>
            <Text variant="overline" color="textTertiary" style={{ textTransform: 'uppercase' }}>
              {context?.company.name ?? 'Servicio técnico'}
            </Text>
            <Text variant="title2" accessibilityRole="header">
              Taller
            </Text>
          </View>

          {/* A member with SELECTED access and no grants. A legitimate state of
              the company, not a failed request. */}
          {branches.length === 0 ? (
            <EmptyState
              icon={icons.info}
              title="Sin sucursales asignadas"
              message="Tu cuenta puede ver el servicio técnico, pero todavía no tiene ninguna sucursal asignada. Pídeselo a quien administra la empresa."
            />
          ) : (
            <>
              <Card variant="outlined">
                <View style={{ gap: 4 }}>
                  <Text variant="footnote" color="textTertiary">
                    Órdenes registradas
                  </Text>
                  <Text variant="title3">
                    {open.isPending ? '—' : String(open.data?.count ?? 0)}
                  </Text>
                  <Text variant="caption" color="textTertiary">
                    En {branches.length === 1 ? 'tu sucursal' : `${branches.length} sucursales`}
                  </Text>
                </View>
              </Card>

              <Button
                label="Ver órdenes"
                variant="secondary"
                fullWidth
                onPress={() => router.push('/internal/service/orders')}
              />

              {/* Only with `service.orders.create`. Receiving a device and
                  reading the board are two capabilities, and the server treats
                  them as two. */}
              {mayCreate ? (
                <Button
                  label="Recibir un equipo"
                  fullWidth
                  onPress={() => router.push('/internal/service/orders/new')}
                />
              ) : null}
            </>
          )}

          {/* This card used to say that diagnosis, quotes, customer approval,
              parts and quality control "no están construidos todavía — ni aquí
              ni en el servidor", and that the lifecycle stopped at "esperando
              aprobación". Every one of those statements had become false: the
              backend ships V1 routes for all of them and the order detail
              renders seven sections against those routes. Only warranty is
              still genuinely absent, so only warranty is still named. */}
          <Card variant="outlined">
            <View style={{ gap: theme.spacing.xs }}>
              <Text variant="headline">Dónde ocurre cada paso</Text>
              <Text variant="subhead" color="textSecondary">
                Diagnóstico, cotización, repuestos, control de calidad, pagos y
                entrega se trabajan dentro de cada orden, no desde aquí. Abre la
                orden del equipo y verás lo que tu cuenta tiene permitido hacer
                en la etapa en que esté.
              </Text>
              <Text variant="footnote" color="textTertiary">
                La garantía todavía no está en la app.
              </Text>
            </View>
          </Card>

          <Button
            label="Volver al área interna"
            variant="ghost"
            fullWidth
            onPress={() => router.replace('/internal')}
          />
        </View>
      </Screen>
    </>
  );
}
