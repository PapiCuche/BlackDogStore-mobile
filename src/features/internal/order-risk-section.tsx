import { useState } from 'react';
import { View } from 'react-native';

import { Button, Divider, Input, StatusBadge, Text } from '@/design-system';
import type { OrderRisk, RiskDecision } from '@/domain/internal/order-unit-types';
import { RISK_NOTE_MAX_LENGTH } from '@/domain/internal/order-unit-types';
import { useTheme } from '@/theme/theme-provider';
import { formatDate } from '@/utils/format';

/**
 * WHAT WAS NOTICED ABOUT THIS ORDER — CLIENT-SEC-01.
 *
 * ADVICE, NOT A STATE. Approving or rejecting changes nothing about the
 * order's payment or its dispatch; in a company that turned the hold on, it
 * releases an order that was waiting for somebody to look. The copy says so,
 * because «rechazar» otherwise reads as cancelling a sale.
 *
 * WHO MAY DECIDE IS THE SERVER'S ANSWER. `canReview` is only ever true while
 * the review is waiting, so no screen keeps a copy of that rule — and the POST
 * re-checks it anyway, answering 409 for a review somebody else just decided.
 *
 * THE LEVEL AND THE REASONS ARE THE SERVER'S WORDS. The signals arrive already
 * labelled; nothing here turns a code into prose, which is what would drift
 * the first time a new signal is added.
 */
export type OrderRiskSectionProps = {
  risk: OrderRisk;
  isDeciding: boolean;
  error: unknown;
  onDecide: (input: { decision: RiskDecision; note: string }) => void;
};

function toneFor(level: string): 'danger' | 'warning' | 'info' {
  if (level === 'high') return 'danger';
  if (level === 'medium') return 'warning';
  return 'info';
}

export function OrderRiskSection({ risk, isDeciding, error, onDecide }: OrderRiskSectionProps) {
  const theme = useTheme();
  const [note, setNote] = useState('');
  const [pending, setPending] = useState<RiskDecision | null>(null);

  return (
    <View style={{ gap: theme.spacing.xs }}>
      <View
        style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm }}
      >
        <Text variant="headline" style={{ flex: 1 }}>
          Revisión del pedido
        </Text>
        <StatusBadge
          label={risk.levelLabel || risk.level}
          tone={toneFor(risk.level)}
          size="small"
          accessibilityPrefix="Nivel de riesgo"
        />
      </View>

      <Text variant="caption" color="textSecondary">
        {risk.reviewStatusLabel || risk.reviewStatus}
        {risk.assessedAt ? ` · ${formatDate(risk.assessedAt)}` : ''}
      </Text>

      {risk.signals.length > 0 ? (
        <View style={{ gap: 2 }}>
          {risk.signals.map((signal) => (
            <Text key={signal.code} variant="subhead">
              · {signal.label}
            </Text>
          ))}
        </View>
      ) : null}

      {risk.reviewedBy || risk.reviewNote ? (
        <View style={{ gap: 2 }}>
          <Divider />
          <Text variant="caption" color="textTertiary">
            {risk.reviewedBy ?? 'Alguien'}
            {risk.reviewedAt ? ` · ${formatDate(risk.reviewedAt)}` : ''}
          </Text>
          {risk.reviewNote ? <Text variant="subhead">{risk.reviewNote}</Text> : null}
        </View>
      ) : null}

      {risk.canReview ? (
        <View style={{ gap: theme.spacing.xs }}>
          <Divider />
          {/* Said plainly: this decides the REVIEW, not the sale. */}
          <Text variant="caption" color="textSecondary">
            Tu decisión queda en el pedido para quien lo lea después. No cambia el pago ni
            el envío.
          </Text>
          <Input
            label="Nota (opcional)"
            value={note}
            onChangeText={setNote}
            maxLength={RISK_NOTE_MAX_LENGTH}
            hint="Qué comprobaste."
          />

          {pending ? (
            <View style={{ gap: theme.spacing.xs }}>
              <Text variant="subhead">
                {pending === 'approve'
                  ? '¿Dar por revisado este pedido?'
                  : '¿Marcar este pedido como rechazado en la revisión?'}
              </Text>
              <Button
                label={pending === 'approve' ? 'Sí, aprobar' : 'Sí, rechazar'}
                variant={pending === 'approve' ? 'primary' : 'destructive'}
                loading={isDeciding}
                onPress={() => {
                  const decision = pending;
                  setPending(null);
                  onDecide({ decision, note });
                  setNote('');
                }}
              />
              <Button label="Mejor no" variant="ghost" onPress={() => setPending(null)} />
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
              <Button
                label="Aprobar"
                size="compact"
                disabled={isDeciding}
                onPress={() => setPending('approve')}
              />
              <Button
                label="Rechazar"
                size="compact"
                variant="destructive"
                disabled={isDeciding}
                onPress={() => setPending('reject')}
              />
            </View>
          )}

          {error ? (
            <Text variant="caption" color="danger">
              {riskErrorMessage(error)}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * The server's own sentence.
 *
 * A 409 here means somebody else decided it a moment ago, which is worth
 * reading as written rather than as «no se pudo guardar».
 */
export function riskErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'No se pudo registrar la decisión.';
}
