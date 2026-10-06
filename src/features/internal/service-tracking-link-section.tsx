import { useState } from 'react';
import { View } from 'react-native';

import { Button, KeyValueRow, StatusBadge, Text } from '@/design-system';
import { serviceErrorMessage } from '@/api/endpoints/internal-service-v1';
import type { ServiceTrackingLink, ServiceTrackingReveal } from '@/domain/internal/service-types';
import { useTheme } from '@/theme/theme-provider';
import { isOpenableLink, openExternalLink } from '@/utils/external-links';
import { formatDate } from '@/utils/format';

/**
 * The customer's public link to one repair — SERVICE-TRACKING.
 *
 * THREE CAPABILITIES, AND THE SERVER DECIDES ALL THREE. Reading this status
 * comes with `service.orders.view`; revealing the link needs
 * `service.quotes.record_decision`, which the server reports as `canReveal`;
 * replacing or turning it off needs `service.orders.manage`, which the caller
 * passes in. Every button here is drawn from one of those answers and refused
 * again by the route if it was wrong.
 *
 * WHY REVEALING IS GATED HARDER THAN OPENING THE ORDER. Whoever holds the link
 * can answer the quote as the customer. Handing it to somebody who may quote
 * but may not record a decision would let them approve their own quote.
 *
 * THE LINK IS NOT CACHED. It arrives from an audited act and lives in this
 * component's state until the screen goes away: it is a bearer credential for
 * one customer's repair, and the server's own audit entry does not store it
 * either.
 */
export type ServiceTrackingLinkSectionProps = {
  link: ServiceTrackingLink;
  /** `service.orders.manage`, as resolved by the server for this person. */
  mayManage: boolean;
  revealed: ServiceTrackingReveal | null;
  isRevealing: boolean;
  isChanging: boolean;
  error: unknown;
  onReveal: () => void;
  onRotate: () => void;
  onRevoke: () => void;
};

export function ServiceTrackingLinkSection({
  link,
  mayManage,
  revealed,
  isRevealing,
  isChanging,
  error,
  onReveal,
  onRotate,
  onRevoke,
}: ServiceTrackingLinkSectionProps) {
  const theme = useTheme();
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <StatusBadge
          label={link.active ? 'Enlace activo' : 'Enlace desactivado'}
          tone={link.active ? 'success' : 'neutral'}
          accessibilityPrefix="Estado del enlace de seguimiento"
        />
      </View>

      <KeyValueRow label="Veces abierto" value={String(link.viewCount)} />
      <KeyValueRow
        label="Última apertura"
        value={link.lastViewedAt ? formatDate(link.lastViewedAt) : 'Todavía no se abrió'}
      />

      {/* The link itself, once and only after the server handed it over. No
          copy button: the app has no clipboard dependency, and selectable text
          is the honest alternative to adding one for this. */}
      {revealed ? (
        <View style={{ gap: theme.spacing.xs }}>
          <Text variant="caption" color="textTertiary">
            Entrégale este enlace al cliente. Quien lo tenga puede responder la
            cotización en su nombre.
          </Text>
          <Text variant="mono" selectable>
            {revealed.url}
          </Text>
          {/* The page belongs to the web storefront, which already renders the
              repair for whoever holds the token. Opening it is a handoff, not a
              second implementation: nothing about tracking is reproduced here.
              Hidden when the server's URL is not something this app may open —
              a build pointed at a host without a scheme, for instance. */}
          {isOpenableLink(revealed.url) ? (
            <Button
              label="Abrir el enlace"
              variant="ghost"
              size="compact"
              onPress={() => {
                void openExternalLink(revealed.url);
              }}
            />
          ) : null}
        </View>
      ) : null}

      {error ? (
        <Text variant="footnote" color="statusDanger">
          {serviceErrorMessage(error)}
        </Text>
      ) : null}

      <View style={{ gap: theme.spacing.xs }}>
        {/* `canReveal` is the server's word about this person, not a role read
            here. Without it the button is absent rather than disabled: an
            action somebody can never take is not a thing to grey out. */}
        {link.canReveal && link.active ? (
          <Button
            label={revealed ? 'Volver a mostrar el enlace' : 'Mostrar el enlace'}
            variant="secondary"
            loading={isRevealing}
            onPress={onReveal}
          />
        ) : null}

        {mayManage ? (
          <>
            <Button
              label={link.active ? 'Reemplazar el enlace' : 'Crear un enlace nuevo'}
              variant="secondary"
              loading={isChanging}
              onPress={onRotate}
            />
            {link.active ? (
              confirmingRevoke ? (
                <View style={{ gap: theme.spacing.xs }}>
                  <Text variant="footnote" color="textSecondary">
                    Al desactivarlo, el cliente dejará de ver su reparación con
                    el enlace que ya tiene.
                  </Text>
                  <Button
                    label="Sí, desactivar"
                    variant="destructive"
                    loading={isChanging}
                    onPress={() => {
                      setConfirmingRevoke(false);
                      onRevoke();
                    }}
                  />
                  <Button
                    label="Cancelar"
                    variant="ghost"
                    onPress={() => setConfirmingRevoke(false)}
                  />
                </View>
              ) : (
                <Button
                  label="Desactivar el enlace"
                  variant="ghost"
                  onPress={() => setConfirmingRevoke(true)}
                />
              )
            ) : null}
          </>
        ) : null}
      </View>
    </View>
  );
}
