import { View } from 'react-native';

import { serviceErrorMessage } from '@/api/endpoints/internal-service-v1';
import { Button, Divider, StatusBadge, Text } from '@/design-system';
import type { CustomerNotice } from '@/domain/internal/service-types';
import {
  describeDeliveryStatus,
  mayRetryWhatsApp,
} from '@/domain/internal/service-types';
import { useTheme } from '@/theme/theme-provider';
import { formatDate } from '@/utils/format';

/**
 * What the shop told the customer about this repair — WHATSAPP-NOTIFY.
 *
 * WHAT HAPPENED IS READ, NEVER ASSUMED. Each status comes from the delivery
 * rows: `Enviada` means a provider took the message, not that the app asked
 * for it, and `No aplica` means the channel was never part of that notice.
 * Nothing here infers one channel's state from the other's.
 *
 * ONLY A FAILED WHATSAPP MESSAGE CAN BE SENT AGAIN, and only by a person
 * pressing the button: a message to somebody's phone is not something a client
 * retries on its own when the network wobbles.
 *
 * NO MESSAGE BODY. The server returns a masked recipient and the short stored
 * failure reason, and no template or payload — what the provider was handed is
 * not something the counter needs to read.
 */
export type ServiceNoticesSectionProps = {
  notices: readonly CustomerNotice[];
  /** `service.orders.manage`, as resolved by the server. */
  mayRetry: boolean;
  isRetrying: boolean;
  error: unknown;
  onRetry: (noticeId: number) => void;
};

export function ServiceNoticesSection({
  notices,
  mayRetry,
  isRetrying,
  error,
  onRetry,
}: ServiceNoticesSectionProps) {
  const theme = useTheme();

  if (notices.length === 0) {
    return (
      <Text variant="subhead" color="textSecondary">
        Todavía no se envió ningún aviso al cliente por esta orden.
      </Text>
    );
  }

  return (
    <View style={{ gap: theme.spacing.sm }}>
      {error ? (
        <Text variant="footnote" color="statusDanger">
          {serviceErrorMessage(error)}
        </Text>
      ) : null}

      {notices.map((notice, index) => {
        const email = describeDeliveryStatus(notice.emailStatus);
        const whatsapp = describeDeliveryStatus(notice.whatsappStatus);
        return (
          <View key={notice.id} style={{ gap: theme.spacing.xs }}>
            {index > 0 ? <Divider /> : null}
            <Text variant="headline">{notice.title}</Text>
            <Text variant="caption" color="textTertiary">
              {formatDate(notice.createdAt)}
            </Text>
            <View style={{ flexDirection: 'row', gap: theme.spacing.xs, flexWrap: 'wrap' }}>
              <StatusBadge
                label={`Correo: ${email.label}`}
                tone={email.tone}
                size="small"
                accessibilityPrefix="Estado del correo"
              />
              <StatusBadge
                label={`WhatsApp: ${whatsapp.label}`}
                tone={whatsapp.tone}
                size="small"
                accessibilityPrefix="Estado del WhatsApp"
              />
            </View>
            {notice.whatsappRecipient ? (
              <Text variant="caption" color="textTertiary">
                Enviado a {notice.whatsappRecipient}
              </Text>
            ) : null}
            {notice.whatsappDetail ? (
              <Text variant="footnote" color="textSecondary">
                {notice.whatsappDetail}
              </Text>
            ) : null}
            {mayRetry && mayRetryWhatsApp(notice) ? (
              <Button
                label="Reintentar el WhatsApp"
                variant="secondary"
                size="compact"
                loading={isRetrying}
                onPress={() => onRetry(notice.id)}
              />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
