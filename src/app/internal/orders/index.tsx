import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { FlatList, View } from 'react-native';

import {
  Card,
  EmptyState,
  ErrorState,
  icons,
  LoadingState,
  Screen,
  SearchInput,
  Text,
} from '@/design-system';
import { CAP_SALES_ORDERS_VIEW, hasUxCapability } from '@/domain/internal/types';
import { useInternalContext, useInternalOrders } from '@/hooks/use-internal-sales';
import { screenGutter } from '@/theme';
import { useTheme } from '@/theme/theme-provider';
import { formatCurrency } from '@/utils/format';

/**
 * The COMPANY's sales.
 *
 * Not the caller's own purchases — those are the customer Orders tab, and an
 * employee who shops here sees them there. Two screens, two repositories, two
 * cache namespaces, two endpoints (DEC-MOBILE-007).
 *
 * Gated on FRESH capabilities. The context query is the source, so a permission
 * revoked while the app was open closes this screen on the next visit rather
 * than at the next login.
 */
export default function InternalOrdersScreen() {
  const theme = useTheme();
  const [search, setSearch] = useState('');

  const { data: context, isPending: contextPending } = useInternalContext();
  const mayView = hasUxCapability(context ?? null, CAP_SALES_ORDERS_VIEW);

  const query = useInternalOrders({ search: search.trim() || undefined }, { enabled: mayView });
  const { data, isPending, isError, error } = query;

  if (contextPending) {
    return (
      <>
        <Stack.Screen options={{ title: 'Pedidos' }} />
        <Screen scrollable>
          <LoadingState label="Cargando pedidos" skeletonCount={4} />
        </Screen>
      </>
    );
  }

  if (!mayView) {
    // Reached when a permission was revoked between drawing the tile and
    // opening it. Honest, and not an error: nothing is broken.
    return (
      <>
        <Stack.Screen options={{ title: 'Pedidos' }} />
        <Screen scrollable contentContainerStyle={{ flexGrow: 1 }}>
          <EmptyState
            icon={icons.info}
            title="Ya no tienes acceso a este módulo"
            message="Tu cuenta no tiene permiso para ver los pedidos de esta empresa."
            actionLabel="Volver al área interna"
            onAction={() => router.replace('/internal')}
          />
        </Screen>
      </>
    );
  }

  if (isPending) {
    return (
      <>
        <Stack.Screen options={{ title: 'Pedidos' }} />
        <Screen scrollable>
          <LoadingState label="Cargando pedidos" skeletonCount={4} />
        </Screen>
      </>
    );
  }

  if (isError) {
    return (
      <>
        <Stack.Screen options={{ title: 'Pedidos' }} />
        <Screen scrollable contentContainerStyle={{ flexGrow: 1 }}>
          <ErrorState error={error} onRetry={() => void query.refetch()} />
        </Screen>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Pedidos' }} />
      <Screen padded={false}>
        <FlatList
          data={data.results}
          keyExtractor={(order) => String(order.id)}
          ListHeaderComponent={
            <View style={{ gap: theme.spacing.sm, marginBottom: theme.spacing.md }}>
              <Text variant="footnote" color="textTertiary">
                {data.count} {data.count === 1 ? 'pedido' : 'pedidos'} · {context?.company.name}
              </Text>
              <SearchInput
                value={search}
                onChangeText={setSearch}
                placeholder="Buscar por cliente, correo o número"
              />
            </View>
          }
          renderItem={({ item }) => (
            <Card variant="outlined" onPress={() => router.push(`/internal/orders/${item.id}`)}>
              <View style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text variant="headline">#{item.id}</Text>
                  <Text variant="headline">{formatCurrency(item.total)}</Text>
                </View>
                <Text variant="subhead" color="textSecondary" numberOfLines={2}>
                  {item.customerName || 'Sin nombre'}
                </Text>
                {/* Two independent facts, shown as two. Collapsing payment and
                    delivery into one status is how staff are told the wrong
                    thing about an order. */}
                <Text variant="footnote" color="textTertiary">
                  Pago: {item.paymentStatusLabel} · Entrega: {item.fulfillmentStatusLabel}
                </Text>
              </View>
            </Card>
          )}
          ItemSeparatorComponent={() => <View style={{ height: theme.spacing.sm }} />}
          ListEmptyComponent={
            <EmptyState
              icon={icons.orders}
              title="Sin pedidos"
              message="No hay pedidos que coincidan con la búsqueda."
            />
          }
          contentContainerStyle={{
            paddingHorizontal: screenGutter,
            paddingBottom: theme.spacing.xxl,
            flexGrow: 1,
          }}
          showsVerticalScrollIndicator={false}
        />
      </Screen>
    </>
  );
}
