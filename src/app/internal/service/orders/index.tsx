import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { FlatList, ScrollView, View } from 'react-native';

import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  icons,
  LoadingState,
  Screen,
  SearchInput,
  StatusBadge,
  Text,
} from '@/design-system';
import { CAP_SERVICE_ORDERS_VIEW } from '@/domain/internal/service-types';
import { hasUxCapability } from '@/domain/internal/types';
import { useServiceContext, useServiceOrders } from '@/hooks/use-internal-service';
import { useInternalContext } from '@/hooks/use-internal-sales';
import { useTheme } from '@/theme/theme-provider';
import { formatRelativeTime } from '@/utils/format';

/**
 * The company's service orders.
 *
 * FILTERED ON THE SERVER. Status and branch go up as query parameters rather
 * than being applied to a downloaded list: a workshop's board grows every day,
 * and "fetch everything and filter here" is a screen that gets slower until
 * somebody notices.
 *
 * The status chips are built from the SERVER's own list, in its own order and
 * with the tenant's own words. A company that renamed "Recibido" sees its word
 * on the chip and in the badge, because neither is written down in this app.
 */
export default function ServiceOrderListScreen() {
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  const { data: context, isPending: contextPending } = useInternalContext();
  const mayView = hasUxCapability(context ?? null, CAP_SERVICE_ORDERS_VIEW);

  const service = useServiceContext({ enabled: mayView });
  const query = useServiceOrders(
    { search: search.trim() || undefined, status: status ?? undefined },
    { enabled: mayView },
  );
  const { data, isPending, isError, error } = query;

  const title = 'Órdenes de servicio';

  if (contextPending) {
    return (
      <>
        <Stack.Screen options={{ title }} />
        <Screen scrollable>
          <LoadingState label="Cargando órdenes" skeletonCount={4} />
        </Screen>
      </>
    );
  }

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

  if (isError) {
    return (
      <>
        <Stack.Screen options={{ title }} />
        <Screen scrollable contentContainerStyle={{ flexGrow: 1 }}>
          <ErrorState error={error} onRetry={() => void query.refetch()} />
        </Screen>
      </>
    );
  }

  if (isPending) {
    return (
      <>
        <Stack.Screen options={{ title }} />
        <Screen scrollable>
          <LoadingState label="Cargando órdenes" skeletonCount={4} />
        </Screen>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title }} />
      <Screen padded={false}>
        <FlatList
          data={data.results}
          keyExtractor={(order) => String(order.id)}
          ListHeaderComponent={
            <View style={{ gap: theme.spacing.sm, marginBottom: theme.spacing.md }}>
              <Text variant="footnote" color="textTertiary">
                {data.count} {data.count === 1 ? 'orden' : 'órdenes'} · {context?.company.name}
              </Text>
              <SearchInput
                value={search}
                onChangeText={setSearch}
                placeholder="Buscar por número, cliente o equipo"
              />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: theme.spacing.xs }}
              >
                <Button
                  label="Todas"
                  size="compact"
                  variant={status === null ? 'primary' : 'ghost'}
                  onPress={() => setStatus(null)}
                />
                {(service.data?.statuses ?? []).map((entry) => (
                  <Button
                    key={entry.code}
                    label={entry.label}
                    size="compact"
                    variant={status === entry.code ? 'primary' : 'ghost'}
                    onPress={() => setStatus(entry.code)}
                  />
                ))}
              </ScrollView>
            </View>
          }
          renderItem={({ item }) => (
            <Card
              variant="outlined"
              onPress={() => router.push(`/internal/service/orders/${item.id}`)}
              accessibilityLabel={`${item.number}, ${item.deviceSummary}, ${item.statusLabel}`}
              accessibilityHint="Abre la orden de servicio"
            >
              <View style={{ gap: 4 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    gap: theme.spacing.sm,
                  }}
                >
                  <Text variant="mono" color="textTertiary">
                    {item.number}
                  </Text>
                  <StatusBadge
                    label={item.statusLabel}
                    tone="neutral"
                    size="small"
                    accessibilityPrefix="Estado de la orden"
                  />
                </View>
                <Text variant="headline" numberOfLines={1}>
                  {item.deviceSummary}
                </Text>
                <Text variant="subhead" color="textSecondary" numberOfLines={1}>
                  {item.customerName} · {item.branchName}
                </Text>
                <Text variant="caption" color="textTertiary">
                  Recibido {formatRelativeTime(item.receivedAt)}
                  {item.technicianName ? ` · ${item.technicianName}` : ''}
                </Text>
              </View>
            </Card>
          )}
          ItemSeparatorComponent={() => <View style={{ height: theme.spacing.sm }} />}
          contentContainerStyle={{ padding: theme.spacing.md, flexGrow: 1 }}
          ListEmptyComponent={
            <EmptyState
              icon={icons.empty}
              title="Sin órdenes"
              message={
                status === null
                  ? 'Todavía no hay equipos recibidos en tus sucursales.'
                  : 'Ninguna orden está en ese estado ahora mismo.'
              }
            />
          }
          refreshing={query.isFetching}
          onRefresh={() => void query.refetch()}
        />
      </Screen>
    </>
  );
}
