import { Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import {
  Button,
  Card,
  Divider,
  ErrorState,
  LoadingState,
  Screen,
  Text,
} from '@/design-system';
import {
  CAP_SALES_ORDERS_MANAGE,
  CAP_SALES_ORDERS_VIEW,
  hasUxCapability,
  type FulfillmentStatus,
} from '@/domain/internal/types';
import {
  useInternalContext,
  useInternalOrder,
  useSetFulfillmentStatus,
} from '@/hooks/use-internal-sales';
import { useTheme } from '@/theme/theme-provider';
import { formatCurrency } from '@/utils/format';

/**
 * One sale, from the inside.
 *
 * Shows what the INTERNAL serializer returns and nothing else — no invented
 * fields, and no payment-provider identifiers, which the server does not send
 * and staff cannot act on.
 *
 * The fulfilment controls appear only with `sales.orders.manage`, and the
 * offered states come from `availableFulfillmentTransitions` — the SERVER's
 * list. There is deliberately no transition table in this app: one that
 * computed its own would drift the first time the rule changed, and the drift
 * would show up as a button that fails.
 */
export default function InternalOrderDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const numericId = Number(id);

  const { data: context } = useInternalContext();
  const mayView = hasUxCapability(context ?? null, CAP_SALES_ORDERS_VIEW);
  const mayManage = hasUxCapability(context ?? null, CAP_SALES_ORDERS_MANAGE);

  const { data: order, isPending, isError, error, refetch } = useInternalOrder(
    Number.isFinite(numericId) ? numericId : undefined,
    { enabled: mayView },
  );
  const mutation = useSetFulfillmentStatus();

  if (!mayView) {
    return (
      <>
        <Stack.Screen options={{ title: 'Pedido' }} />
        <Screen scrollable contentContainerStyle={{ flexGrow: 1 }}>
          <Card variant="outlined">
            <Text variant="headline">Ya no tienes acceso a este módulo</Text>
          </Card>
        </Screen>
      </>
    );
  }

  if (isPending) {
    return (
      <>
        <Stack.Screen options={{ title: 'Pedido' }} />
        <Screen scrollable>
          <LoadingState label="Cargando pedido" skeletonCount={3} />
        </Screen>
      </>
    );
  }

  if (isError || !order) {
    return (
      <>
        <Stack.Screen options={{ title: 'Pedido' }} />
        <Screen scrollable contentContainerStyle={{ flexGrow: 1 }}>
          <ErrorState error={error} onRetry={() => void refetch()} />
        </Screen>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: `Pedido #${order.id}` }} />
      <Screen scrollable>
        <View style={{ gap: theme.spacing.md }}>
          <Card variant="outlined">
            <View style={{ gap: 4 }}>
              <Text variant="title3">{formatCurrency(order.total)}</Text>
              <Text variant="subhead" color="textSecondary">
                Pago: {order.paymentStatusLabel}
              </Text>
              <Text variant="subhead" color="textSecondary">
                Entrega: {order.fulfillmentStatusLabel}
              </Text>
              {order.fulfillmentBranchName ? (
                <Text variant="footnote" color="textTertiary">
                  Sucursal: {order.fulfillmentBranchName}
                </Text>
              ) : null}
            </View>
          </Card>

          <Card variant="outlined">
            <View style={{ gap: 4 }}>
              <Text variant="headline">Cliente</Text>
              <Text variant="subhead">{order.customerName}</Text>
              <Text variant="subhead" color="textSecondary">{order.customerEmail}</Text>
              <Text variant="subhead" color="textSecondary">{order.customerPhone}</Text>
              <Text variant="footnote" color="textTertiary">
                {order.documentTypeLabel} {order.documentNumber} · {order.receiptTypeLabel}
              </Text>
            </View>
          </Card>

          <Card variant="outlined">
            <View style={{ gap: 4 }}>
              <Text variant="headline">Entrega</Text>
              <Text variant="subhead">{order.deliveryMethodLabel || 'Sin especificar'}</Text>
              {order.addressLine ? (
                <Text variant="subhead" color="textSecondary">
                  {[order.addressLine, order.district, order.city].filter(Boolean).join(', ')}
                </Text>
              ) : null}
              {order.reference ? (
                <Text variant="footnote" color="textTertiary">Ref.: {order.reference}</Text>
              ) : null}
              {order.notes ? (
                <Text variant="footnote" color="textTertiary">Nota: {order.notes}</Text>
              ) : null}
            </View>
          </Card>

          <Card variant="outlined">
            <View style={{ gap: theme.spacing.xs }}>
              <Text variant="headline">Productos</Text>
              {order.items.map((item) => (
                <View
                  key={item.id}
                  style={{ flexDirection: 'row', justifyContent: 'space-between' }}
                >
                  <Text variant="subhead" style={{ flex: 1 }} numberOfLines={2}>
                    {item.quantity} × {item.productName}
                  </Text>
                  <Text variant="subhead">{formatCurrency(item.price)}</Text>
                </View>
              ))}
            </View>
          </Card>

          {mayManage ? (
            <Card variant="outlined">
              <View style={{ gap: theme.spacing.xs }}>
                <Text variant="headline">Cambiar estado de entrega</Text>
                <Divider />
                {order.availableFulfillmentTransitions.map((next) => (
                  <Button
                    key={next}
                    label={next}
                    variant={next === order.fulfillmentStatus ? 'secondary' : 'ghost'}
                    disabled={mutation.isPending || next === order.fulfillmentStatus}
                    onPress={() =>
                      mutation.mutate({
                        id: order.id,
                        fulfillmentStatus: next as FulfillmentStatus,
                      })
                    }
                  />
                ))}
                {mutation.isError ? (
                  <Text variant="footnote" color="textTertiary">
                    No se pudo cambiar el estado. Puede que ya no tengas permiso.
                  </Text>
                ) : null}
              </View>
            </Card>
          ) : null}
        </View>
      </Screen>
    </>
  );
}
