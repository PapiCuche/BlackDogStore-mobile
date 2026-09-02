import { useRef, useState } from 'react';
import { Alert, View } from 'react-native';

import { Button, Card, Divider, Input, SectionHeader, StatusBadge, Text } from '@/design-system';
import type { ServiceDelivery } from '@/domain/internal/service-types';
import { makeIdempotencyKey } from '@/domain/idempotency';
import { useTheme } from '@/theme/theme-provider';
import { formatDate } from '@/utils/format';

export type ServiceDeliverySectionProps = {
  delivery: ServiceDelivery | null;
  status: string;
  canManage: boolean;
  isBusy: boolean;
  error: unknown;
  onDeliver: (input: { recipientName: string; notes: string; idempotencyKey: string }) => void;
};

/**
 * The handover: who took the device, and when.
 *
 * THIS SCREEN DOES NOT COLLECT MONEY, and it says so out loud rather than
 * leaving a counter to assume. The platform cannot charge for a repair —
 * `PaymentTransaction` is bound to an e-commerce order by a non-null FK — so a
 * "cobrado" toggle here would be a lie the shop believes. Service payment is its
 * own phase, and until it exists a counter that took cash records it in the
 * shop's own book, not here.
 *
 * THERE IS NO EDIT AFFORDANCE, because there is no endpoint: the row refuses
 * updates and deletes in the server's own `save`. A handover is a fact with a
 * date; offering to correct it would promise something the platform will not do.
 *
 * NO SIGNATURE AND NO PHOTO (DEC-016): the storage provider is undecided, and
 * an evidence field that stores nothing is worse than an honest gap.
 */
export function ServiceDeliverySection({
  delivery,
  status,
  canManage,
  isBusy,
  error,
  onDeliver,
}: ServiceDeliverySectionProps) {
  const theme = useTheme();
  const [recipient, setRecipient] = useState('');
  const [notes, setNotes] = useState('');

  // Held in a ref, NOT in render state: a retry must resend the SAME key, and a
  // key that changed on re-render would be no key at all. Keyed by the intention
  // — a different recipient is a different handover and gets its own key, which
  // is exactly the case the server answers 409 for.
  const keys = useRef(new Map<string, string>());

  function keyFor(shape: string): string {
    const existing = keys.current.get(shape);
    if (existing) return existing;
    const minted = makeIdempotencyKey(shape);
    keys.current.set(shape, minted);
    return minted;
  }

  const ready = status === 'ready_for_pickup';
  const name = recipient.trim();

  function confirm() {
    Alert.alert(
      'Registrar entrega',
      `El equipo quedará entregado a ${name}. No se puede deshacer, y esto no `
      + 'registra ningún cobro.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Entregar',
          onPress: () =>
            onDeliver({
              recipientName: name,
              notes: notes.trim(),
              idempotencyKey: keyFor(name),
            }),
        },
      ],
    );
  }

  return (
    <View style={{ gap: theme.spacing.md }}>
      <SectionHeader title="Entrega" />

      {error ? (
        <Card variant="outlined">
          <Text variant="subhead" color="danger">
            {String((error as Error)?.message ?? error)}
          </Text>
        </Card>
      ) : null}

      {delivery !== null ? (
        <Card variant="outlined">
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: theme.spacing.sm,
            }}
          >
            <Text variant="headline" style={{ flex: 1 }} numberOfLines={2}>
              {delivery.recipientName}
            </Text>
            <StatusBadge label="Entregado" tone="success" />
          </View>
          <Text variant="footnote" color="textTertiary">
            {formatDate(delivery.deliveredAt)}
            {delivery.deliveredByName ? ` · ${delivery.deliveredByName}` : ''}
          </Text>
          {delivery.notes ? (
            <Text variant="caption" color="textTertiary">{delivery.notes}</Text>
          ) : null}
          <Divider />
          <Text variant="caption" color="textTertiary">
            El registro no se puede editar ni borrar. No incluye cobro.
          </Text>
        </Card>
      ) : !ready ? (
        <Card variant="outlined">
          <Text variant="subhead" color="textSecondary">
            Solo se entrega un equipo que aprobó el control de calidad.
          </Text>
        </Card>
      ) : !canManage ? (
        <Card variant="outlined">
          <Text variant="subhead" color="textSecondary">
            Este equipo está listo. Tu cuenta no puede registrar la entrega.
          </Text>
        </Card>
      ) : (
        <Card variant="outlined">
          <Input
            label="Quién recibe"
            value={recipient}
            onChangeText={setRecipient}
            placeholder="Nombre de quien se lleva el equipo"
          />
          <Input
            label="Observaciones"
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholder="No lo ve el cliente"
          />
          <Divider />
          <Text variant="caption" color="textTertiary">
            No registra cobro: esta plataforma todavía no puede cobrar una reparación.
          </Text>
          <Button
            label="Registrar entrega"
            onPress={confirm}
            disabled={isBusy || name === ''}
          />
        </Card>
      )}
    </View>
  );
}
