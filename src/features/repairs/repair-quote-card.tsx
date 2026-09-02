import { useState } from 'react';
import { Alert, View } from 'react-native';

import { quoteErrorMessage } from '@/api/endpoints/customer-repairs-v1';
import {
  Button,
  Divider,
  Input,
  StatusBadge,
  Text,
} from '@/design-system';
import {
  isAwaitingDecision,
  undecidableReason,
  type QuoteDecision,
  type RepairQuote,
} from '@/domain/repairs/quote';
import { useTheme } from '@/theme/theme-provider';
import { formatCurrency, formatDate } from '@/utils/format';

export type RepairQuoteCardProps = {
  quote: RepairQuote;
  onDecide: (input: { decision: QuoteDecision; reason?: string }) => void;
  isDeciding: boolean;
  error: unknown;
};

/**
 * The quote, and the one thing on this screen the customer can act on.
 *
 * EVERY FIGURE IS THE SERVER'S. Nothing here is added up: `format.ts` states
 * the rule the whole app follows — decimal strings are parsed at the very last
 * moment before display and never earlier, because arithmetic on a float that
 * came from '4899.00' is how a price ends up a cent short. The one place this
 * app computes money is the anonymous cart, which has no backend to ask.
 *
 * WHETHER THE BUTTONS APPEAR IS ALSO THE SERVER'S. `canBeDecided` and
 * `isExpired` arrive computed; a phone's clock is not the authority on whether
 * an offer is still open, and the server re-checks the whole thing when the
 * answer arrives anyway.
 *
 * APPROVING IS NOT PAYING, and the wording says so. A confirmation that used
 * the word "pagar" would promise a transaction this phase does not perform.
 */
export function RepairQuoteCard({
  quote,
  onDecide,
  isDeciding,
  error,
}: RepairQuoteCardProps) {
  const theme = useTheme();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  const blocked = undecidableReason(quote);
  const awaiting = isAwaitingDecision(quote);

  const confirmApprove = () => {
    // The total, the currency and the validity are all in front of the person
    // BEFORE they commit — not hidden behind a generic "¿Confirmar?".
    Alert.alert(
      'Aprobar la cotización',
      `Estás aprobando ${formatCurrency(quote.total)} ${quote.currency} para esta `
        + 'reparación. El taller podrá empezar el trabajo. Aprobar no es pagar.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Aprobar', onPress: () => onDecide({ decision: 'approve' }) },
      ],
    );
  };

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: theme.spacing.sm,
        }}
      >
        <Text variant="footnote" color="textTertiary">
          Cotización #{quote.revision} · {formatDate(quote.sentAt)}
        </Text>
        <StatusBadge
          label={quote.statusLabel}
          tone={
            quote.status === 'approved'
              ? 'success'
              : quote.status === 'rejected'
                ? 'danger'
                : 'warning'
          }
          size="small"
          accessibilityPrefix="Estado de la cotización"
        />
      </View>

      {quote.items.map((item) => (
        <View key={item.id} style={{ gap: 2 }}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              gap: theme.spacing.sm,
            }}
          >
            <Text variant="subhead" style={{ flex: 1 }} numberOfLines={2}>
              {item.description}
            </Text>
            <Text variant="subhead">{formatCurrency(item.lineTotal)}</Text>
          </View>
          <Text variant="caption" color="textTertiary">
            {item.itemTypeLabel} · {item.quantity} × {formatCurrency(item.unitPrice)}
          </Text>
        </View>
      ))}

      <Divider />

      <Amount label="Subtotal" value={quote.subtotal} theme={theme} />
      {/* Shown only when they exist. A line reading "Descuento S/ 0.00" is
          noise, and "Impuestos S/ 0.00" would imply a tax policy the platform
          does not have. */}
      {Number(quote.discountAmount) > 0 ? (
        <Amount label="Descuento" value={`-${quote.discountAmount}`} theme={theme} />
      ) : null}
      {Number(quote.taxAmount) > 0 ? (
        <Amount label="Impuestos" value={quote.taxAmount} theme={theme} />
      ) : null}

      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: theme.spacing.sm,
        }}
        accessible
        accessibilityLabel={`Total ${formatCurrency(quote.total)} ${quote.currency}`}
      >
        <Text variant="headline">Total</Text>
        <Text variant="title3">
          {formatCurrency(quote.total)} {quote.currency}
        </Text>
      </View>

      {quote.customerNotes ? (
        <Text variant="footnote" color="textSecondary">
          {quote.customerNotes}
        </Text>
      ) : null}

      {quote.validUntil ? (
        <Text variant="caption" color={quote.isExpired ? 'danger' : 'textTertiary'}>
          {quote.isExpired ? 'Venció el ' : 'Válida hasta el '}
          {formatDate(quote.validUntil)}
        </Text>
      ) : null}

      {error ? (
        <Text variant="subhead" color="danger">
          {quoteErrorMessage(error)}
        </Text>
      ) : null}

      {/* The state is carried by TEXT, not only by the badge's colour. */}
      {blocked ? (
        <Text variant="subhead" color="textSecondary">
          {blocked}
        </Text>
      ) : null}

      {awaiting && !rejecting ? (
        <View style={{ gap: theme.spacing.xs }}>
          <Button
            label="Aprobar cotización"
            fullWidth
            loading={isDeciding}
            accessibilityHint={`Autoriza el trabajo por ${formatCurrency(quote.total)} ${quote.currency}`}
            onPress={confirmApprove}
          />
          <Button
            label="Rechazar"
            variant="destructive"
            fullWidth
            disabled={isDeciding}
            onPress={() => setRejecting(true)}
          />
        </View>
      ) : null}

      {awaiting && rejecting ? (
        <View style={{ gap: theme.spacing.xs }}>
          <Input
            label="Motivo (opcional)"
            value={reason}
            onChangeText={setReason}
            multiline
            hint="Solo lo ve el taller."
          />
          <Button
            label="Confirmar rechazo"
            variant="destructive"
            fullWidth
            loading={isDeciding}
            onPress={() =>
              onDecide({ decision: 'reject', reason: reason.trim() || undefined })
            }
          />
          <Button
            label="Volver"
            variant="ghost"
            fullWidth
            disabled={isDeciding}
            onPress={() => setRejecting(false)}
          />
        </View>
      ) : null}
    </View>
  );
}

function Amount({
  label,
  value,
  theme,
}: {
  label: string;
  value: string;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: theme.spacing.sm,
      }}
    >
      <Text variant="subhead" color="textSecondary">
        {label}
      </Text>
      <Text variant="subhead">{formatCurrency(value)}</Text>
    </View>
  );
}
