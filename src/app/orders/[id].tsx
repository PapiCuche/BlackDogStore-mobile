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
import { describeFulfillmentStatus, describePaymentStatus } from '@/domain/orders/status';
import { orderNumber } from '@/domain/orders/types';
import { MockDataNotice } from '@/features/home/mock-data-notice';
import { useOrder } from '@/hooks/use-orders';
import { useTheme } from '@/theme/theme-provider';
import { formatCurrency, formatDate } from '@/utils/format';

/**
 * Order detail.
 *
 * Payment and fulfilment get their own labelled section each. When Django has
 * not sent `fulfillment_status` (BR-003), the UI says "Sin información" rather
 * than defaulting to `pending` — showing a customer a state the server never
 * claimed is worse than admitting we do not know.
 */
export default function OrderDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const numericId = Number(id);

  const { data: order, isPending, isError, error, refetch } = useOrder(
    Number.isFinite(numericId) ? numericId : undefined,
  );

  if (isPending) {
    return (
      <Screen scrollable>
        <LoadingState label="Cargando pedido" />
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

  if (!order) {
    return (
      <Screen contentContainerStyle={{ flexGrow: 1 }}>
        <EmptyState
          icon={icons.warning}
          title="Pedido no encontrado"
          message="Es posible que este pedido ya no esté disponible."
        />
      </Screen>
    );
  }

  const payment = describePaymentStatus(order.paymentStatus);
  const fulfillment = describeFulfillmentStatus(order.fulfillmentStatus);
  const hasDiscount = Number.parseFloat(order.discountAmount) > 0;

  return (
    <>
      <Stack.Screen options={{ title: `Pedido ${orderNumber(order)}` }} />

      <Screen scrollable>
        <View style={{ gap: theme.spacing.xl, paddingTop: theme.spacing.sm }}>
          <View style={{ gap: theme.spacing.xs }}>
            <Text variant="mono" color="textTertiary">
              Pedido {orderNumber(order)}
            </Text>
            <Text variant="display" accessibilityRole="header">
              {formatCurrency(order.total)}
            </Text>
            <Text variant="footnote" color="textTertiary">
              Realizado el {formatDate(order.createdAt)}
            </Text>
          </View>

          {/* Two labelled statuses, never merged. */}
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <View style={{ flex: 1, gap: theme.spacing.xxs }}>
              <Text variant="caption" color="textTertiary">
                Pago
              </Text>
              <StatusBadge label={payment.label} tone={payment.tone} accessibilityPrefix="Pago" />
            </View>

            <View style={{ flex: 1, gap: theme.spacing.xxs }}>
              <Text variant="caption" color="textTertiary">
                Entrega
              </Text>
              <StatusBadge
                label={fulfillment.label}
                tone={fulfillment.tone}
                accessibilityPrefix="Entrega"
              />
            </View>
          </View>

          <View>
            <SectionHeader title="Artículos" />
            <Card padded={false}>
              {order.items.map((item, index) => (
                <View key={item.id}>
                  {index > 0 ? <Divider inset={theme.spacing.md} /> : null}
                  <View
                    accessible
                    accessibilityLabel={`${item.quantity} × ${item.product.name}, ${formatCurrency(item.price)}`}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: theme.spacing.sm,
                      padding: theme.spacing.md,
                    }}
                  >
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="callout" numberOfLines={2}>
                        {item.product.name}
                      </Text>
                      <Text variant="footnote" color="textTertiary">
                        Cantidad: {item.quantity}
                      </Text>
                    </View>
                    <Text variant="headline">{formatCurrency(item.price)}</Text>
                  </View>
                </View>
              ))}
            </Card>
          </View>

          <Card>
            <View style={{ gap: theme.spacing.xs }}>
              {hasDiscount ? (
                <>
                  <SummaryRow
                    label={order.couponCode ? `Descuento (${order.couponCode})` : 'Descuento'}
                    value={`− ${formatCurrency(order.discountAmount)}`}
                  />
                  <Divider />
                </>
              ) : null}

              <SummaryRow label="Total" value={formatCurrency(order.total)} emphasised />

              {order.paidAt ? (
                <Text variant="caption" color="textTertiary">
                  Pagado el {formatDate(order.paidAt)}
                </Text>
              ) : null}
            </View>
          </Card>

          <MockDataNotice message="Datos de ejemplo. El endpoint de pedidos existe pero requiere el contrato de autenticación web." />
        </View>
      </Screen>
    </>
  );
}

function SummaryRow({
  label,
  value,
  emphasised = false,
}: {
  label: string;
  value: string;
  emphasised?: boolean;
}) {
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}`}
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
    >
      <Text variant={emphasised ? 'headline' : 'subhead'} color={emphasised ? 'textPrimary' : 'textSecondary'}>
        {label}
      </Text>
      <Text variant={emphasised ? 'title3' : 'subhead'}>{value}</Text>
    </View>
  );
}
