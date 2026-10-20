import { View } from 'react-native';

import { Button, Card, Divider, KeyValueRow, StatusBadge, Text } from '@/design-system';
import type { PosSale } from '@/domain/internal/pos-types';
import { describeDocumentStatus, describeReceiptType } from '@/domain/internal/pos-types';
import { useTheme } from '@/theme/theme-provider';

/**
 * WHAT THE SHOP JUST SOLD — the sale as the server closed it.
 *
 * It used to be an alert with the total and the change. That is the one thing
 * a till may NOT do: the person at the counter has to be able to tell the
 * customer the document number, read back the devices that went out, and see
 * the tax breakdown the sale was closed with — and an alert disappears the
 * moment somebody taps it.
 *
 * EVERY FIGURE IS THE SERVER'S, printed. The totals, the change, the tax: all
 * strings, none of them recomputed. If the shelf or a promotion moved between
 * pricing and charging, these are the numbers that actually happened.
 *
 * THE DOCUMENT IS SHOWN, NOT ASSERTED. Electronic issuance takes time and can
 * be rejected, so the status is reported in the server's own word. There is no
 * route to the printed document on `/api/v1/` (BR-017), so this screen offers
 * no «imprimir»: a button that cannot print is worse than none.
 *
 * `created: false` means the idempotency key had already been spent on this
 * exact basket. That is a successful outcome — the sale exists — and the copy
 * says so rather than implying a second charge.
 */
export type PosSaleResultProps = {
  sale: PosSale;
  onDismiss: () => void;
};

export function PosSaleResult({ sale, onDismiss }: PosSaleResultProps) {
  const theme = useTheme();
  const documentLabel = describeReceiptType(sale.receiptType);
  const statusLabel = describeDocumentStatus(sale.documentStatus);

  return (
    <Card>
      <View style={{ gap: theme.spacing.sm }}>
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm }}
        >
          <Text variant="headline" style={{ flex: 1 }} accessibilityRole="header">
            {sale.created ? 'Venta registrada' : 'Esta venta ya estaba registrada'}
          </Text>
          <StatusBadge
            label={`#${sale.orderId}`}
            tone="success"
            size="small"
            accessibilityPrefix="Pedido"
          />
        </View>

        <KeyValueRow label="Total cobrado" value={sale.total} />
        {sale.amountReceived ? (
          <KeyValueRow label="Recibido" value={sale.amountReceived} />
        ) : null}
        {sale.changeAmount ? <KeyValueRow label="Vuelto" value={sale.changeAmount} /> : null}
        {sale.discount !== '0.00' && sale.discount !== '0' ? (
          <KeyValueRow
            label="Descuento"
            value={sale.discountReason ? `${sale.discount} · ${sale.discountReason}` : sale.discount}
          />
        ) : null}

        <Divider />

        {/* The comprobante, in the words the customer will hear at the counter. */}
        <View style={{ gap: theme.spacing.xs }}>
          <Text variant="subhead">Comprobante</Text>
          <KeyValueRow label="Tipo" value={documentLabel} />
          {sale.documentNumber ? (
            <KeyValueRow label="Número" value={sale.documentNumber} />
          ) : null}
          {statusLabel ? <KeyValueRow label="Estado" value={statusLabel} /> : null}
          {!sale.documentNumber ? (
            <Text variant="caption" color="textSecondary">
              El número aparece cuando el servidor termina de emitirlo. Se consulta en la
              consola web.
            </Text>
          ) : null}
        </View>

        {sale.tax ? (
          <>
            <Divider />
            <View style={{ gap: theme.spacing.xs }}>
              {/* The breakdown this sale was CLOSED with. The server reads it
                  off the order rather than computing it again, so a reprint a
                  year from now says the same thing. */}
              <KeyValueRow label={sale.tax.baseLabel} value={sale.tax.taxableAmount} />
              <KeyValueRow label={sale.tax.taxLabel} value={sale.tax.taxAmount} />
              <KeyValueRow label="Total" value={sale.tax.total || sale.total} />
            </View>
          </>
        ) : null}

        <Divider />

        <View style={{ gap: theme.spacing.xs }}>
          <Text variant="subhead">Entregado</Text>
          {sale.items.map((item) => (
            <View key={`${item.product}-${item.name}`} style={{ gap: 2 }}>
              <Text variant="caption">
                {item.quantity} × {item.name} · {item.price}
              </Text>
              {/* SERIAL-PICK-01 — read back so the counter can check the box
                  against the record before the customer walks out. */}
              {item.units.map((unit) => (
                <Text
                  key={`${unit.serialNumber}-${unit.imei}`}
                  variant="caption"
                  color="textTertiary"
                >
                  {[
                    unit.serialNumber && `Serie ${unit.serialNumber}`,
                    unit.imei && `IMEI ${unit.imei}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              ))}
            </View>
          ))}
        </View>

        {sale.seller || sale.customer ? (
          <Text variant="caption" color="textTertiary">
            {[sale.seller && `Vendió ${sale.seller}`, sale.customer && `Cliente ${sale.customer}`]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        ) : null}

        {sale.commission ? (
          <Text variant="caption" color="textTertiary">
            {`Comisión ${sale.commission}`}
          </Text>
        ) : null}

        <Button label="Listo, siguiente venta" onPress={onDismiss} />
      </View>
    </Card>
  );
}
