import { router } from 'expo-router';
import { FlatList, View } from 'react-native';

import {
  AppHeader,
  EmptyState,
  ErrorState,
  icons,
  LoadingState,
  Screen,
  StaleDataNotice,
} from '@/design-system';
import { useConnectivity } from '@/connectivity/connectivity-provider';
import { useListRefresh } from '@/hooks/use-list-refresh';
import { MockDataNotice } from '@/features/home/mock-data-notice';
import { OrderCard } from '@/features/orders/order-card';
import { useOrders } from '@/hooks/use-orders';
import { screenGutter } from '@/theme';
import { useTheme } from '@/theme/theme-provider';

/**
 * The orders list.
 *
 * An Order here is a SHOP PURCHASE. It is not a repair, and the two must never
 * be merged into one "mis servicios" list — they have different lifecycles,
 * different money and, in Django, different models. The Repairs tab is next
 * door for a reason.
 */
export default function OrdersScreen() {
  const theme = useTheme();
  const query = useOrders();
  const { data, isPending, isError, error } = query;
  const { isOffline } = useConnectivity();
  const hasCachedData = (data?.length ?? 0) > 0;
  const { onRefresh, refreshing } = useListRefresh(query, { enabled: !isError });

  const header = (
    <View>
      <AppHeader
        title="Pedidos"
        eyebrow="Tienda"
        subtitle="Estado de pago y de entrega de tus compras."
      />
      <View style={{ marginBottom: theme.spacing.md, gap: theme.spacing.xs }}>
        {isOffline && hasCachedData ? <StaleDataNotice /> : null}
        <MockDataNotice message="Datos de ejemplo. El endpoint existe pero requiere autenticación web (cookie + CSRF)." />
      </View>
    </View>
  );

  if (isPending) {
    return (
      <Screen scrollable>
        {header}
        <LoadingState label="Cargando pedidos" skeletonCount={3} />
      </Screen>
    );
  }

  if (isError) {
    return (
      <Screen scrollable contentContainerStyle={{ flexGrow: 1 }}>
        {header}
        <ErrorState error={error} onRetry={() => void query.refetch()} />
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <FlatList
        data={data}
        keyExtractor={(order) => String(order.id)}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <OrderCard order={item} onPress={() => router.push(`/orders/${item.id}`)} />
        )}
        ItemSeparatorComponent={() => <View style={{ height: theme.spacing.sm }} />}
        ListEmptyComponent={
          <EmptyState
            icon={icons.orders}
            title="Aún no tienes pedidos"
            message="Cuando compres en la tienda, tus pedidos aparecerán aquí."
            actionLabel="Explorar tienda"
            onAction={() => router.push('/(tabs)/shop')}
          />
        }
        contentContainerStyle={{
          paddingHorizontal: screenGutter,
          paddingBottom: theme.spacing.xxl,
          flexGrow: 1,
        }}
        onRefresh={onRefresh}
        refreshing={refreshing}
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  );
}
