import { useState } from 'react';
import { View } from 'react-native';

import { Button, Divider, Input, KeyValueRow, StatusBadge, Text } from '@/design-system';
import type {
  DeliveryMode,
  FreightPaidBy,
  OrderDeliveryInput,
  OrderDeliveryRecord,
} from '@/domain/internal/delivery-types';
import {
  DELIVERY_FIELD_LIMITS,
  FREIGHT_PAID_BY_OPTIONS,
  describeDeliveryMode,
  describeFreightPaidBy,
} from '@/domain/internal/delivery-types';
import { PHONE_SHAPE_MESSAGE, isPlausibleCustomerPhone } from '@/domain/customer/profile-types';
import { isOpenableLink, openExternalLink } from '@/utils/external-links';
import { useTheme } from '@/theme/theme-provider';
import { formatDate } from '@/utils/format';

/**
 * AN ORDER'S DELIVERY, AS STAFF KEEP IT — DELIVERY-01.
 *
 * A RECORD BESIDE THE ORDER. Writing it changes neither the delivery method
 * the buyer chose, nor the address they typed, nor the total — freight is what
 * the shop paid, not part of the sale — nor the dispatch state: «enviado» is
 * still said through the fulfilment controls.
 *
 * THE BUYER'S ADDRESS IS READ-ONLY HERE, because the staff allowlist does not
 * include it. Showing it as an editable field would promise a correction the
 * save silently drops.
 *
 * THE TRACKING LINK IS SENT ONLY WHEN SOMEBODY TYPES ONE. Left alone, the
 * server derives it from the carrier's page and the waybill and moves it when
 * either changes; echoing the record back whole with a corrected waybill would
 * look like re-typing the old link and would leave the buyer following a page
 * for a number that no longer exists.
 *
 * THE CARRIER CANNOT BE CHOSEN FROM HERE. Naming one needs the company's
 * active carriers by id and no v1 route lists them (BR-013), so the order
 * keeps the carrier it has and everything else can still be corrected.
 */
export type OrderDeliverySectionProps = {
  record: OrderDeliveryRecord;
  isSaving: boolean;
  error: unknown;
  onSave: (input: OrderDeliveryInput) => void;
};

export function OrderDeliverySection({
  record,
  isSaving,
  error,
  onSave,
}: OrderDeliverySectionProps) {
  const theme = useTheme();
  const [editing, setEditing] = useState(false);

  const [mode, setMode] = useState<DeliveryMode>(record.mode);
  const [recipientName, setRecipientName] = useState(record.recipientName);
  const [recipientPhone, setRecipientPhone] = useState(record.recipientPhone);
  const [agencyName, setAgencyName] = useState(record.agencyName);
  const [agencyLocality, setAgencyLocality] = useState(record.agencyLocality);
  const [waybillNumber, setWaybillNumber] = useState(record.waybillNumber);
  const [trackingCode, setTrackingCode] = useState(record.trackingCode);
  const [typedUrl, setTypedUrl] = useState(record.trackingUrlTyped ? record.trackingUrl : '');
  const [freightAmount, setFreightAmount] = useState(record.freightAmount ?? '');
  const [freightPaidBy, setFreightPaidBy] = useState<FreightPaidBy>(record.freightPaidBy);

  const phoneLooksWrong = !isPlausibleCustomerPhone(recipientPhone);

  function submit() {
    const input: OrderDeliveryInput = {};
    if (mode !== record.mode) input.mode = mode;
    if (recipientName !== record.recipientName) input.recipientName = recipientName;
    if (recipientPhone !== record.recipientPhone) input.recipientPhone = recipientPhone;
    if (agencyName !== record.agencyName) input.agencyName = agencyName;
    if (agencyLocality !== record.agencyLocality) input.agencyLocality = agencyLocality;
    if (waybillNumber !== record.waybillNumber) input.waybillNumber = waybillNumber;
    if (trackingCode !== record.trackingCode) input.trackingCode = trackingCode;
    if (freightAmount !== (record.freightAmount ?? '')) input.freightAmount = freightAmount;
    if (freightPaidBy !== record.freightPaidBy) input.freightPaidBy = freightPaidBy;
    // Only a link somebody typed. An untyped one is the server's to derive.
    const wasTyped = record.trackingUrlTyped ? record.trackingUrl : '';
    if (typedUrl !== wasTyped) input.trackingUrl = typedUrl;

    onSave(input);
    setEditing(false);
  }

  return (
    <View style={{ gap: theme.spacing.xs }}>
      <View
        style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm }}
      >
        <Text variant="headline" style={{ flex: 1 }}>
          Entrega
        </Text>
        <StatusBadge
          label={describeDeliveryMode(record.mode, record.modeLabel)}
          tone="info"
          size="small"
          accessibilityPrefix="Modo de entrega"
        />
      </View>

      {record.recipientName ? (
        <KeyValueRow
          label="Recibe"
          value={
            record.recipientPhone
              ? `${record.recipientName} · ${record.recipientPhone}`
              : record.recipientName
          }
        />
      ) : null}

      {/* What the buyer typed. Shown because somebody has to ship the box. */}
      {record.addressLine ? (
        <KeyValueRow
          label="Dirección"
          value={[record.addressLine, record.district, record.city].filter(Boolean).join(', ')}
        />
      ) : null}
      {record.reference ? <KeyValueRow label="Referencia" value={record.reference} /> : null}

      {record.carrierName || record.agencyName ? (
        <KeyValueRow
          label="Transportista"
          value={[record.carrierName, record.agencyName, record.agencyLocality]
            .filter(Boolean)
            .join(' · ')}
        />
      ) : null}
      {record.waybillNumber ? (
        <KeyValueRow label="Guía" value={record.waybillNumber} />
      ) : null}
      {record.trackingCode ? (
        <KeyValueRow label="Código de seguimiento" value={record.trackingCode} />
      ) : null}
      {record.freightAmount !== null ? (
        <KeyValueRow
          label="Flete"
          value={`${record.freightAmount} · ${describeFreightPaidBy(record.freightPaidBy)}`}
        />
      ) : null}
      {record.shippedAt ? (
        <KeyValueRow label="Enviado" value={formatDate(record.shippedAt)} />
      ) : null}

      {/* The link the buyer would follow. Handed to the browser, never rendered
          in-app: it is a carrier's page, not ours. */}
      {record.trackingUrl && isOpenableLink(record.trackingUrl) ? (
        <Button
          label="Abrir el seguimiento del transportista"
          variant="ghost"
          size="compact"
          onPress={() => void openExternalLink(record.trackingUrl)}
        />
      ) : null}

      {record.updatedBy ? (
        <Text variant="caption" color="textTertiary">
          {`Actualizado por ${record.updatedBy}`}
          {record.updatedAt ? ` · ${formatDate(record.updatedAt)}` : ''}
        </Text>
      ) : null}

      {record.canEdit ? (
        editing ? (
          <View style={{ gap: theme.spacing.xs }}>
            <Divider />

            {/* Only the modes the server says this order may be left in. */}
            {record.allowedModes.length > 1 ? (
              <View style={{ gap: theme.spacing.xs }}>
                <Text variant="subhead">Modo de entrega</Text>
                <View style={{ flexDirection: 'row', gap: theme.spacing.xs, flexWrap: 'wrap' }}>
                  {record.allowedModes.map((option) => (
                    <Button
                      key={option}
                      label={describeDeliveryMode(option, '')}
                      size="compact"
                      variant={mode === option ? 'primary' : 'secondary'}
                      onPress={() => setMode(option)}
                    />
                  ))}
                </View>
              </View>
            ) : null}

            <Input
              label="Quién recibe"
              value={recipientName}
              onChangeText={setRecipientName}
              maxLength={DELIVERY_FIELD_LIMITS.recipientName}
            />
            <Input
              label="Teléfono de quien recibe"
              value={recipientPhone}
              onChangeText={setRecipientPhone}
              maxLength={DELIVERY_FIELD_LIMITS.recipientPhone}
              keyboardType="phone-pad"
              error={phoneLooksWrong ? PHONE_SHAPE_MESSAGE : undefined}
            />

            {mode === 'agency_pickup' ? (
              <>
                <Input
                  label="Agencia"
                  value={agencyName}
                  onChangeText={setAgencyName}
                  maxLength={DELIVERY_FIELD_LIMITS.agencyName}
                />
                <Input
                  label="Localidad de la agencia"
                  value={agencyLocality}
                  onChangeText={setAgencyLocality}
                  maxLength={DELIVERY_FIELD_LIMITS.agencyLocality}
                />
              </>
            ) : null}

            <Input
              label="Número de guía"
              value={waybillNumber}
              onChangeText={setWaybillNumber}
              maxLength={DELIVERY_FIELD_LIMITS.waybillNumber}
              autoCapitalize="characters"
            />
            <Input
              label="Código de seguimiento"
              value={trackingCode}
              onChangeText={setTrackingCode}
              maxLength={DELIVERY_FIELD_LIMITS.trackingCode}
              autoCapitalize="characters"
            />
            <Input
              label="Enlace de seguimiento (opcional)"
              value={typedUrl}
              onChangeText={setTypedUrl}
              maxLength={DELIVERY_FIELD_LIMITS.trackingUrl}
              autoCapitalize="none"
              keyboardType="url"
              hint="Déjalo vacío y el servidor lo arma con el transportista y la guía."
            />

            <Input
              label="Flete"
              value={freightAmount}
              onChangeText={setFreightAmount}
              keyboardType="decimal-pad"
              hint="Lo que costó el envío. No cambia el total del pedido."
            />
            <View style={{ flexDirection: 'row', gap: theme.spacing.xs, flexWrap: 'wrap' }}>
              {FREIGHT_PAID_BY_OPTIONS.map((option) => (
                <Button
                  key={option}
                  label={describeFreightPaidBy(option)}
                  size="compact"
                  variant={freightPaidBy === option ? 'primary' : 'secondary'}
                  onPress={() => setFreightPaidBy(option)}
                />
              ))}
            </View>

            <Button
              label="Guardar la entrega"
              loading={isSaving}
              disabled={phoneLooksWrong}
              onPress={submit}
            />
            <Button label="Cancelar" variant="ghost" onPress={() => setEditing(false)} />
          </View>
        ) : (
          <Button
            label={record.exists ? 'Corregir la entrega' : 'Registrar la entrega'}
            variant="secondary"
            size="compact"
            onPress={() => setEditing(true)}
          />
        )
      ) : null}

      {error ? (
        <Text variant="caption" color="danger">
          {deliveryErrorMessage(error)}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * The server's own sentence.
 *
 * «Esta entrega sólo puede cambiar entre envío a domicilio y recojo en
 * agencia.» is the shop's rule in the shop's words, and a 409 means this is a
 * till sale with no delivery at all — neither is a field-level complaint.
 */
export function deliveryErrorMessage(error: unknown): string {
  const fieldErrors = (error as { fieldErrors?: Record<string, readonly string[]> } | null)
    ?.fieldErrors;
  if (fieldErrors) {
    const first = Object.values(fieldErrors).find((messages) => messages.length > 0);
    if (first?.[0]) return first[0];
  }
  if (error instanceof Error && error.message) return error.message;
  return 'No se pudo guardar la entrega.';
}
