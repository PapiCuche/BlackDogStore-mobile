import { useRef, useState } from 'react';
import { Alert, View } from 'react-native';

import {
  Button,
  Card,
  Divider,
  Input,
  SectionHeader,
  StatusBadge,
  Text,
} from '@/design-system';
import { makeIdempotencyKey } from '@/domain/idempotency';
import type {
  ServicePartCandidate,
  ServicePartUsage,
  ServicePartUsageInput,
} from '@/domain/internal/service-types';
import { useTheme } from '@/theme/theme-provider';
import { formatDate } from '@/utils/format';

export type ServicePartsSectionProps = {
  candidates: readonly ServicePartCandidate[];
  usages: readonly ServicePartUsage[];
  canManage: boolean;
  canReverse: boolean;
  isBusy: boolean;
  error: unknown;
  onUse: (input: ServicePartUsageInput) => void;
  onReverse: (usageId: number) => void;
};

/**
 * The parts this repair may spend, and the ones it already has.
 *
 * WHAT THIS COMPONENT NEVER SENDS: a branch (the server takes the order's), a
 * product (it takes the quoted line's), a price (the quote settled that once),
 * a stock figure or a movement type (inventory computes those). It sends a line
 * id, a count, and a key.
 *
 * WHAT IT NEVER COMPUTES: the stock left after a consumption. Showing
 * `available - quantity` would be this app asserting a number about a shelf
 * that another till may be changing at the same moment. After a write the
 * server is asked again.
 *
 * THE IDEMPOTENCY KEY IS MINTED ONCE PER INTENTION and held in a ref across
 * retries. If the network drops and the technician presses again, the SAME key
 * goes back — which is the only thing standing between a timeout and a second
 * battery off the shelf. It changes when the ask changes: a different line or a
 * different count is a different intention and gets its own key.
 */
export function ServicePartsSection({
  candidates,
  usages,
  canManage,
  canReverse,
  isBusy,
  error,
  onUse,
  onReverse,
}: ServicePartsSectionProps) {
  const theme = useTheme();
  const [selected, setSelected] = useState<number | null>(null);
  const [quantity, setQuantity] = useState('1');

  // Not state: changing it must not re-render, and a retry has to see exactly
  // the value the first attempt used.
  const attempt = useRef<{ key: string; shape: string } | null>(null);

  function keyFor(shape: string): string {
    if (attempt.current === null || attempt.current.shape !== shape) {
      attempt.current = { key: makeIdempotencyKey(shape), shape };
    }
    return attempt.current.key;
  }

  function confirmUse(candidate: ServicePartCandidate) {
    const count = Number.parseInt(quantity, 10);
    if (!Number.isFinite(count) || count <= 0) {
      Alert.alert('Cantidad inválida', 'Indica cuántas unidades se usaron.');
      return;
    }
    if (count > candidate.outstandingQuantity) {
      Alert.alert(
        'Más de lo aprobado',
        `El cliente aprobó ${candidate.approvedQuantity} unidad(es) y ya se `
        + `usaron ${candidate.usedQuantity}. Para usar más hace falta una `
        + 'cotización nueva.',
      );
      return;
    }

    const shape = `${candidate.quoteItemId}x${count}`;
    Alert.alert(
      'Registrar repuesto',
      `Se descontarán ${count} unidad(es) de "${candidate.description}" del `
      + 'stock de la sucursal de esta reparación.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Registrar',
          onPress: () =>
            onUse({
              quoteItemId: candidate.quoteItemId,
              quantity: count,
              idempotencyKey: keyFor(shape),
            }),
        },
      ],
    );
  }

  function confirmReverse(usage: ServicePartUsage) {
    Alert.alert(
      'Deshacer consumo',
      `Esto devolverá ${usage.quantity} unidad(es) de "${usage.description}" `
      + 'al stock de la sucursal.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Deshacer', onPress: () => onReverse(usage.id) },
      ],
    );
  }

  const active = usages.filter((u) => !u.isReversed);
  const reversed = usages.filter((u) => u.isReversed);

  return (
    <View style={{ gap: theme.spacing.md }}>
      <SectionHeader title="Repuestos" />

      {error ? (
        <Card variant="outlined">
          <Text variant="subhead" color="danger">
            {String((error as Error)?.message ?? error)}
          </Text>
        </Card>
      ) : null}

      {canManage && candidates.length > 0 ? (
        <Card variant="outlined">
          <Text variant="subhead" color="textSecondary">
            Aprobados en la cotización
          </Text>
          <Divider />
          {candidates.map((candidate) => (
            <View key={candidate.quoteItemId} style={{ gap: theme.spacing.xs }}>
              <Text variant="subhead" numberOfLines={2}>{candidate.description}</Text>
              <Text variant="footnote" color="textTertiary">
                {`Aprobados ${candidate.approvedQuantity} · usados `
                  + `${candidate.usedQuantity} · disponibles en esta sucursal `
                  + `${candidate.availableInBranch}`}
              </Text>
              {candidate.outstandingQuantity === 0 ? (
                <Text variant="footnote" color="textTertiary">
                  Ya se usó todo lo aprobado.
                </Text>
              ) : candidate.availableInBranch === 0 ? (
                <Text variant="footnote" color="danger">
                  Sin stock en la sucursal de esta reparación.
                </Text>
              ) : (
                <View style={{ gap: theme.spacing.xs }}>
                  <Input
                    label="Cantidad"
                    value={selected === candidate.quoteItemId ? quantity : '1'}
                    onChangeText={(value) => {
                      setSelected(candidate.quoteItemId);
                      setQuantity(value);
                    }}
                    keyboardType="number-pad"
                  />
                  <Button
                    label="Registrar consumo"
                    onPress={() => {
                      setSelected(candidate.quoteItemId);
                      confirmUse(candidate);
                    }}
                    disabled={isBusy}
                  />
                </View>
              )}
              <Divider />
            </View>
          ))}
        </Card>
      ) : null}

      <Card variant="outlined">
        <Text variant="subhead" color="textSecondary">Consumidos</Text>
        <Divider />
        {active.length === 0 ? (
          <Text variant="footnote" color="textTertiary">
            Todavía no se ha usado ningún repuesto.
          </Text>
        ) : (
          active.map((usage) => (
            <View key={usage.id} style={{ gap: theme.spacing.xs }}>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  gap: theme.spacing.sm,
                }}
              >
                <Text variant="subhead" style={{ flex: 1 }} numberOfLines={2}>
                  {usage.description}
                </Text>
                <Text variant="subhead">{`×${usage.quantity}`}</Text>
              </View>
              <Text variant="caption" color="textTertiary">
                {formatDate(usage.createdAt)}
                {usage.actorName ? ` · ${usage.actorName}` : ''}
              </Text>
              {canReverse ? (
                <Button
                  label="Deshacer"
                  variant="secondary"
                  onPress={() => confirmReverse(usage)}
                  disabled={isBusy}
                />
              ) : null}
              <Divider />
            </View>
          ))
        )}

        {reversed.length > 0 ? (
          <View style={{ gap: theme.spacing.xs }}>
            <Text variant="footnote" color="textTertiary">Deshechos</Text>
            {reversed.map((usage) => (
              <View
                key={usage.id}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  gap: theme.spacing.sm,
                }}
              >
                <Text variant="caption" color="textTertiary" style={{ flex: 1 }}>
                  {`${usage.description} ×${usage.quantity}`}
                </Text>
                <StatusBadge label="Devuelto" tone="neutral" />
              </View>
            ))}
          </View>
        ) : null}
      </Card>
    </View>
  );
}
