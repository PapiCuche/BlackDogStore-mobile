import { useRef, useState } from 'react';
import { Alert, View } from 'react-native';

import { Button, Card, Divider, Input, SectionHeader, StatusBadge, Text } from '@/design-system';
import { makeIdempotencyKey } from '@/domain/idempotency';
import {
  PAYMENT_METHODS,
  type PaymentMethodValue,
  type ServicePayment,
  type ServicePaymentSummary,
} from '@/domain/internal/service-types';
import { useTheme } from '@/theme/theme-provider';
import { formatDate } from '@/utils/format';

export type ServicePaymentSectionProps = {
  summary: ServicePaymentSummary | null;
  payments: readonly ServicePayment[];
  canManage: boolean;
  isBusy: boolean;
  error: unknown;
  onRecord: (input: {
    amount: string;
    method: PaymentMethodValue;
    reference: string;
    idempotencyKey: string;
  }) => void;
  onReverse: (paymentId: number) => void;
};

const STATUS_TONE: Record<string, { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' }> = {
  no_quote: { label: 'Sin cotización', tone: 'neutral' },
  unpaid: { label: 'Sin pagos', tone: 'warning' },
  partial: { label: 'Pago parcial', tone: 'warning' },
  paid: { label: 'Pagado', tone: 'success' },
  overpaid: { label: 'Pagado de más', tone: 'warning' },
};

/**
 * The till. M12B.
 *
 * THIS COMPONENT DOES NO ARITHMETIC ON MONEY. Every figure is a decimal string
 * the server computed and this screen prints. Parsing one into a number to show
 * a running total would create a second answer to "how much is owed" that can
 * disagree with the shop's — and the one that disagrees is the one somebody is
 * reading across a counter while a customer waits.
 *
 * `outstanding` and `quotedTotal` can be NULL, and null is not zero: it means
 * no price has been agreed. Drawing "S/ 0.00" would say the repair is free.
 *
 * A REVERSAL IS NOT A REFUND, and the confirmation says so before the button
 * does anything. It marks a row as written in error; this platform cannot
 * return money, and pretending otherwise at a counter is how a shop ends up
 * arguing about cash it never gave back.
 */
export function ServicePaymentSection({
  summary,
  payments,
  canManage,
  isBusy,
  error,
  onRecord,
  onReverse,
}: ServicePaymentSectionProps) {
  const theme = useTheme();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethodValue>(PAYMENT_METHODS[0].value);
  const [reference, setReference] = useState('');

  // Held in a ref, NOT in render state: a retry must resend the SAME key, and a
  // key that changed on re-render would be no key at all — which for this
  // screen means charging somebody twice.
  const keys = useRef(new Map<string, string>());

  function keyFor(shape: string): string {
    const existing = keys.current.get(shape);
    if (existing) return existing;
    const minted = makeIdempotencyKey(shape);
    keys.current.set(shape, minted);
    return minted;
  }

  const value = amount.trim();
  const badge = summary
    ? STATUS_TONE[summary.paymentStatus] ?? { label: summary.paymentStatus, tone: 'neutral' as const }
    : null;
  const canCharge = summary !== null && summary.outstanding !== null && summary.outstanding !== '0.00';

  function confirmRecord() {
    if (!summary) return;
    Alert.alert(
      'Registrar pago',
      `Se registrará ${summary.currency} ${value}. No se puede editar después: `
      + 'para corregir hay que reversar.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Registrar',
          onPress: () =>
            onRecord({
              amount: value,
              method,
              reference: reference.trim(),
              idempotencyKey: keyFor(`${value}:${method}:${reference.trim()}`),
            }),
        },
      ],
    );
  }

  function confirmReverse(payment: ServicePayment) {
    Alert.alert(
      'Reversar pago',
      `Se marcará ${payment.currency} ${payment.amount} como registrado por error. `
      + 'NO devuelve dinero: esta plataforma no puede hacerlo.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Reversar', style: 'destructive', onPress: () => onReverse(payment.id) },
      ],
    );
  }

  return (
    <View style={{ gap: theme.spacing.md }}>
      <SectionHeader title="Pago del servicio" />

      {error ? (
        <Card variant="outlined">
          <Text variant="subhead" color="danger">
            {String((error as Error)?.message ?? error)}
          </Text>
        </Card>
      ) : null}

      {summary === null ? (
        <Card variant="outlined">
          <Text variant="subhead" color="textSecondary">Cargando el saldo…</Text>
        </Card>
      ) : (
        <Card variant="outlined">
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: theme.spacing.sm,
            }}
          >
            <Text variant="headline" style={{ flex: 1 }}>
              {summary.outstanding === null
                ? 'Sin cotización aprobada'
                : `Saldo ${summary.currency} ${summary.outstanding}`}
            </Text>
            {badge ? <StatusBadge label={badge.label} tone={badge.tone} /> : null}
          </View>
          <Text variant="footnote" color="textTertiary">
            {summary.quotedTotal === null
              ? 'Todavía no hay precio acordado.'
              : `Total ${summary.currency} ${summary.quotedTotal} · `
                + `pagado ${summary.currency} ${summary.confirmedPaid}`}
          </Text>

          {summary.paymentStatus === 'overpaid' ? (
            <Text variant="caption" color="textTertiary">
              Se recibió {summary.currency} {summary.credit} de más. No se devuelve nada
              automáticamente.
            </Text>
          ) : null}

          {summary.requiresPaymentBeforeDelivery ? (
            <Text variant="caption" color="textTertiary">
              Esta empresa exige el pago antes de entregar.
            </Text>
          ) : null}

          {canManage && canCharge ? (
            <>
              <Divider />
              <Input
                label={`Importe (${summary.currency})`}
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                placeholder="0.00"
              />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
                {PAYMENT_METHODS.map((option) => (
                  <Button
                    key={option.value}
                    label={option.label}
                    variant={method === option.value ? 'primary' : 'secondary'}
                    onPress={() => setMethod(option.value)}
                    disabled={isBusy}
                  />
                ))}
              </View>
              <Input
                label="Referencia"
                value={reference}
                onChangeText={setReference}
                placeholder="Nº de operación"
              />
              <Button
                label="Registrar pago"
                onPress={confirmRecord}
                disabled={isBusy || value === ''}
              />
            </>
          ) : null}
        </Card>
      )}

      {payments.length > 0 ? (
        <Card variant="outlined">
          {payments.map((payment) => (
            <View key={payment.id} style={{ gap: theme.spacing.xs }}>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: theme.spacing.sm,
                }}
              >
                <Text
                  variant="subhead"
                  color={payment.isReversed ? 'textTertiary' : 'textPrimary'}
                  style={{ flex: 1 }}
                >
                  {payment.currency} {payment.amount}
                  {'  '}
                  {PAYMENT_METHODS.find((m) => m.value === payment.method)?.label
                    ?? payment.method}
                </Text>
                {payment.isReversed ? (
                  <StatusBadge label="Reversado" tone="danger" />
                ) : canManage ? (
                  <Button
                    label="Reversar"
                    variant="secondary"
                    onPress={() => confirmReverse(payment)}
                    disabled={isBusy}
                  />
                ) : null}
              </View>
              <Text variant="caption" color="textTertiary">
                {formatDate(payment.receivedAt)}
                {payment.receivedByName ? ` · ${payment.receivedByName}` : ''}
                {payment.reference ? ` · ${payment.reference}` : ''}
              </Text>
              <Divider />
            </View>
          ))}
          <Text variant="caption" color="textTertiary">
            Un pago no se edita ni se borra: se reversa, y ambos hechos quedan.
            Reversar NO devuelve dinero.
          </Text>
        </Card>
      ) : null}
    </View>
  );
}
