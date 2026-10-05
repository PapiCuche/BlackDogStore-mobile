import { useState } from 'react';
import { View } from 'react-native';

import { serviceErrorMessage } from '@/api/endpoints/internal-service-v1';
import { Button, Divider, Input, StatusBadge, Text } from '@/design-system';
import type { WhatsAppConsent } from '@/domain/internal/service-types';
import { useTheme } from '@/theme/theme-provider';
import { formatDate } from '@/utils/format';

/**
 * The two things the counter does to a customer RECORD, not to the repair —
 * WHATSAPP-NOTIFY and the account link.
 *
 * CONSENT IS WRITE-ONLY TODAY, and this component is honest about it. No v1
 * payload exposes `whatsapp_opt_in`, so there is no current state to show
 * before acting: the two buttons are phrased as what the operator is
 * RECORDING ("el cliente aceptó"), not as a switch that reflects a stored
 * value, and the answer that comes back is displayed as what was just written.
 * A toggle drawn from an unknown state would invite flipping it blindly. See
 * BR-011.
 *
 * UNLINKING ASKS FIRST. It is how a real customer stops being told their
 * record belongs to somebody else, and it is not a thing to do by accident.
 */
export type ServiceCustomerAdminSectionProps = {
  customerName: string;
  /** `service.customers.manage`, as the server resolved it. */
  mayManage: boolean;
  /** What the LAST write recorded, or null before anything was written here. */
  consent: WhatsAppConsent | null;
  isBusy: boolean;
  error: unknown;
  onRecordConsent: (optIn: boolean) => void;
  onUnlinkAccount: (reason: string) => void;
  /** What the last unlink answered, or null. */
  unlinked: { hasAccount: boolean } | null;
};

export function ServiceCustomerAdminSection({
  customerName,
  mayManage,
  consent,
  isBusy,
  error,
  onRecordConsent,
  onUnlinkAccount,
  unlinked,
}: ServiceCustomerAdminSectionProps) {
  const theme = useTheme();
  const [confirmingUnlink, setConfirmingUnlink] = useState(false);
  const [reason, setReason] = useState('');

  if (!mayManage) {
    return (
      <Text variant="subhead" color="textSecondary">
        Administrar los datos del cliente necesita un permiso que no tienes.
      </Text>
    );
  }

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Text variant="subhead" color="textSecondary">
        {customerName}
      </Text>

      {error ? (
        <Text variant="footnote" color="statusDanger">
          {serviceErrorMessage(error)}
        </Text>
      ) : null}

      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="footnote" color="textSecondary">
          Un teléfono en la ficha no es permiso. Anota lo que el cliente te dijo
          sobre recibir avisos por WhatsApp.
        </Text>
        <View style={{ flexDirection: 'row', gap: theme.spacing.xs, flexWrap: 'wrap' }}>
          <Button
            label="Aceptó recibir avisos"
            size="compact"
            loading={isBusy}
            onPress={() => onRecordConsent(true)}
          />
          <Button
            label="Ya no quiere avisos"
            variant="secondary"
            size="compact"
            loading={isBusy}
            onPress={() => onRecordConsent(false)}
          />
        </View>
        {/* Shown only once something was written here, because that is the only
            thing this screen actually knows. */}
        {consent ? (
          <View style={{ gap: 2 }}>
            <StatusBadge
              label={consent.optIn ? 'Quedó registrado que acepta' : 'Quedó registrado que no acepta'}
              tone={consent.optIn ? 'success' : 'neutral'}
              size="small"
              accessibilityPrefix="Consentimiento de WhatsApp"
            />
            <Text variant="caption" color="textTertiary">
              {consent.optIn
                ? consent.optInAt
                  ? `Aceptó el ${formatDate(consent.optInAt)}${consent.optInSource ? ` · ${consent.optInSource}` : ''}`
                  : 'Sin fecha registrada'
                : consent.optOutAt
                  ? `Se dio de baja el ${formatDate(consent.optOutAt)}`
                  : 'Sin fecha registrada'}
            </Text>
          </View>
        ) : null}
      </View>

      <Divider />

      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="footnote" color="textSecondary">
          Si esta ficha quedó enlazada a la cuenta equivocada, desenlázala para
          que el cliente real pueda registrarse.
        </Text>
        {unlinked ? (
          <Text variant="caption" color="textTertiary">
            {unlinked.hasAccount
              ? 'La ficha sigue enlazada a una cuenta.'
              : 'La ficha quedó sin cuenta enlazada.'}
          </Text>
        ) : null}
        {confirmingUnlink ? (
          <View style={{ gap: theme.spacing.xs }}>
            <Input
              label="Motivo"
              value={reason}
              onChangeText={setReason}
              hint="Queda en el registro de la ficha."
            />
            <Button
              label="Sí, desenlazar la cuenta"
              variant="destructive"
              loading={isBusy}
              onPress={() => {
                setConfirmingUnlink(false);
                onUnlinkAccount(reason);
                setReason('');
              }}
            />
            <Button
              label="Cancelar"
              variant="ghost"
              onPress={() => setConfirmingUnlink(false)}
            />
          </View>
        ) : (
          <Button
            label="Desenlazar la cuenta"
            variant="ghost"
            size="compact"
            onPress={() => setConfirmingUnlink(true)}
          />
        )}
      </View>
    </View>
  );
}
