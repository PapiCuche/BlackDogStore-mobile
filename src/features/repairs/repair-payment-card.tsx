import { View } from 'react-native';

import { Divider, StatusBadge, Text } from '@/design-system';
import type { CustomerPaymentSummary } from '@/domain/internal/service-types';
import { useTheme } from '@/theme/theme-provider';

const STATUS: Record<string, { label: string; tone: 'neutral' | 'success' | 'warning' }> = {
  no_quote: { label: 'Sin presupuesto', tone: 'neutral' },
  unpaid: { label: 'Pendiente', tone: 'warning' },
  partial: { label: 'Pago parcial', tone: 'warning' },
  paid: { label: 'Pagado', tone: 'success' },
};

/**
 * What the customer owes on their own repair. M12B.
 *
 * THREE NUMBERS AND A WORD, all of them the server's. This component does no
 * arithmetic: every figure is a decimal string, printed. A total computed here
 * could disagree with the shop's, and the customer is exactly the person who
 * must not be shown the wrong one.
 *
 * NULL IS NOT ZERO. `outstanding: null` means no price has been agreed yet, and
 * drawing "S/ 0.00" would tell somebody their repair is free.
 *
 * THERE IS NO PAY BUTTON, and there must not be one until online payment for a
 * repair exists. Showing a balance next to something that looked like a way to
 * settle it would be the lie this whole phase was built to avoid — the customer
 * pays at the counter, and the app says so by staying quiet about it.
 *
 * IT ALSO SAYS NOTHING ABOUT A REVERSAL. That is the shop correcting its own
 * books; the balance already reflects it, and publishing the correction would
 * turn it into an accusation.
 */
export function RepairPaymentCard({ summary }: { summary: CustomerPaymentSummary }) {
  const theme = useTheme();
  const badge = STATUS[summary.status] ?? { label: summary.status, tone: 'neutral' as const };
  const unquoted = summary.quotedTotal === null;

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
        <Text variant="headline" style={{ flex: 1 }}>
          {unquoted
            ? 'Todavía sin presupuesto'
            : `Saldo ${summary.currency} ${summary.outstanding}`}
        </Text>
        <StatusBadge label={badge.label} tone={badge.tone} />
      </View>

      {unquoted ? (
        <Text variant="footnote" color="textTertiary">
          Cuando el taller te envíe un presupuesto y lo apruebes, aquí verás
          cuánto queda por pagar.
        </Text>
      ) : (
        <>
          <Divider />
          <Row label="Total aprobado" value={`${summary.currency} ${summary.quotedTotal}`} theme={theme} />
          <Row label="Pagado" value={`${summary.currency} ${summary.paid}`} theme={theme} />
          <Divider />
          <Text variant="caption" color="textTertiary">
            El pago se realiza en el taller.
          </Text>
        </>
      )}
    </View>
  );
}

function Row({
  label, value, theme,
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
      <Text variant="subhead" color="textSecondary">{label}</Text>
      <Text variant="subhead">{value}</Text>
    </View>
  );
}
