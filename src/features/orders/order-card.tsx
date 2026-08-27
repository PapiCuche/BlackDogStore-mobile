import { View } from 'react-native';

import { Card, StatusBadge, Text } from '@/design-system';
import { describeFulfillmentStatus, describePaymentStatus } from '@/domain/orders/status';
import { orderItemCount, orderNumber, type Order } from '@/domain/orders/types';
import { useTheme } from '@/theme/theme-provider';
import { formatCurrency, formatDate } from '@/utils/format';

export type OrderCardProps = {
  order: Order;
  onPress: () => void;
};

/**
 * One order in a list.
 *
 * TWO badges, always. Payment and fulfilment are independent fields in Django
 * and a single merged "status" would have to lie about one of them — a paid
 * order still being prepared is the normal case, not an edge case.
 */
export function OrderCard({ order, onPress }: OrderCardProps) {
  const theme = useTheme();
  const payment = describePaymentStatus(order.paymentStatus);
  const fulfillment = describeFulfillmentStatus(order.fulfillmentStatus);
  const itemCount = orderItemCount(order);

  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`Pedido ${orderNumber(order)}, ${formatCurrency(order.total)}. Pago: ${payment.label}. Entrega: ${fulfillment.label}.`}
      accessibilityHint="Abre el detalle del pedido"
    >
      <View style={{ gap: theme.spacing.xs }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: theme.spacing.sm,
          }}
        >
          <Text variant="mono" color="textTertiary">
            Pedido {orderNumber(order)}
          </Text>
          <Text variant="caption" color="textTertiary">
            {formatDate(order.createdAt)}
          </Text>
        </View>

        <Text variant="title3">{formatCurrency(order.total)}</Text>

        <Text variant="footnote" color="textSecondary">
          {itemCount} {itemCount === 1 ? 'artículo' : 'artículos'}
        </Text>

        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: theme.spacing.xxs,
            marginTop: theme.spacing.xxs,
          }}
        >
          <StatusBadge label={payment.label} tone={payment.tone} size="small" />
          <StatusBadge label={fulfillment.label} tone={fulfillment.tone} size="small" />
        </View>
      </View>
    </Card>
  );
}
