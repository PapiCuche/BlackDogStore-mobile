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
import {
  PrivateActionPrompt,
  usePrivateActionState,
} from '@/features/auth/private-action-gate';
import { OrderCard } from '@/features/orders/order-card';
import { useAuth } from '@/auth/auth-provider';
import { useOrders } from '@/hooks/use-orders';
import { screenGutter } from '@/theme';
import { useTheme } from '@/theme/theme-provider';

/**
 * The orders list — the app's first PRIVATE screen.
 *
 * An Order here is a SHOP PURCHASE. It is not a repair, and the two must never
 * be merged into one "mis servicios" list — they have different lifecycles,
 * different money and, in Django, different models. The Repairs tab is next
 * door for a reason.
 *
 * DEC-MOBILE-006 — the catalogue stays public; THIS is where a session is
 * asked for, because this is where the data becomes personal. Anonymous
 * visitors get an invitation to sign in, not a technical error: they have done
 * nothing wrong.
 *
 * DEC-MOBILE-007 — this is the CUSTOMER audience. An employee signed in here
 * sees their OWN purchases, never the company's. Company-wide orders belong to
 * the internal area, behind `sales.orders.view`, and the server enforces that
 * separation regardless of what this screen draws.
 */
export default function OrdersScreen() {
  const theme = useTheme();
  const { policy } = useAuth();
  const access = usePrivateActionState();
  // Hooks run unconditionally — an early return above them would change the
  // hook order between renders. The query is disabled instead.
  const query = useOrders({ enabled: access === 'ready' });
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
        {/* Only over fixtures. In backend mode these are real purchases. */}
        {policy.mode === 'mock' ? (
          <MockDataNotice message="Datos de ejemplo. No son compras reales." />
        ) : null}
      </View>
    </View>
  );

  // The private gate comes BEFORE any query state: with the query disabled,
  // `isPending` is permanently true for an anonymous visitor, and showing them
  // a spinner forever would be the worst of both answers.
  if (access !== 'ready' && access !== 'pending') {
    return (
      <Screen scrollable contentContainerStyle={{ flexGrow: 1 }}>
        {header}
        <PrivateActionPrompt state={access} />
      </Screen>
    );
  }

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
