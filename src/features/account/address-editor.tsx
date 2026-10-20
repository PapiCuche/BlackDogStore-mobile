import { useState } from 'react';
import { View } from 'react-native';

import { Button, Divider, Input, Text } from '@/design-system';
import type {
  AgencyCarrier,
  CustomerAddress,
  CustomerAddressInput,
  CustomerAddressKind,
} from '@/domain/customer/address-types';
import { ADDRESS_FIELD_LIMITS } from '@/domain/customer/address-types';
import { CUSTOMER_PHONE_MAX_LENGTH, PHONE_SHAPE_MESSAGE, isPlausibleCustomerPhone } from '@/domain/customer/profile-types';
import { useTheme } from '@/theme/theme-provider';

/**
 * One entry of the address book — DELIVERY-01.
 *
 * TWO KINDS, TWO SHAPES, AND THE SERVER DECIDES WHICH FIELDS SURVIVE. A door
 * needs a street, a district and a city; an agency needs the agency's name, its
 * locality and which carrier it belongs to. Changing the kind DROPS what the
 * other kind had — that is the server's rule — so the form says so rather than
 * letting somebody believe their street is still kept.
 *
 * THE CARRIER IS AN ID THE SERVER PUBLISHED. The shop's active agencies arrive
 * with the book; there is no free-text carrier here, because an agency nobody
 * has is an entry no parcel can reach. A shop with no agencies switched on
 * cannot be offered the agency kind at all.
 */
export type AddressEditorProps = {
  /** The entry being corrected, or null for a new one. */
  entry: CustomerAddress | null;
  agencyCarriers: readonly AgencyCarrier[];
  isSaving: boolean;
  error: unknown;
  onSave: (input: CustomerAddressInput) => void;
  onCancel: () => void;
};

export function AddressEditor({
  entry,
  agencyCarriers,
  isSaving,
  error,
  onSave,
  onCancel,
}: AddressEditorProps) {
  const theme = useTheme();
  const [kind, setKind] = useState<CustomerAddressKind>(entry?.kind ?? 'address');
  const [label, setLabel] = useState(entry?.label ?? '');
  const [recipientName, setRecipientName] = useState(entry?.recipientName ?? '');
  const [recipientPhone, setRecipientPhone] = useState(entry?.recipientPhone ?? '');
  const [addressLine, setAddressLine] = useState(entry?.addressLine ?? '');
  const [district, setDistrict] = useState(entry?.district ?? '');
  const [city, setCity] = useState(entry?.city ?? '');
  const [department, setDepartment] = useState(entry?.department ?? '');
  const [reference, setReference] = useState(entry?.reference ?? '');
  const [agencyName, setAgencyName] = useState(entry?.agencyName ?? '');
  const [agencyLocality, setAgencyLocality] = useState(entry?.agencyLocality ?? '');
  const [carrier, setCarrier] = useState<number | null>(entry?.carrier ?? null);

  const phoneLooksWrong = !isPlausibleCustomerPhone(recipientPhone);
  const ready =
    recipientName.trim() !== ''
    && !phoneLooksWrong
    && (kind === 'address'
      ? addressLine.trim() !== '' && district.trim() !== '' && city.trim() !== ''
      : agencyName.trim() !== '' && agencyLocality.trim() !== '' && carrier !== null);

  function submit() {
    const input: CustomerAddressInput = {
      kind,
      label,
      recipientName,
      recipientPhone,
    };
    if (kind === 'address') {
      Object.assign(input, { addressLine, district, city, department, reference });
    } else {
      Object.assign(input, { agencyName, agencyLocality, department });
      // Null never travels: the server refuses a carrier that is not one of
      // its own agencies, and `ready` already holds the button until one is
      // chosen.
      if (carrier !== null) input.carrier = carrier;
    }
    onSave(input);
  }

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
        <Button
          label="A una dirección"
          size="compact"
          variant={kind === 'address' ? 'primary' : 'secondary'}
          onPress={() => setKind('address')}
        />
        {/* Offered only where the shop has agencies switched on. */}
        {agencyCarriers.length > 0 ? (
          <Button
            label="A una agencia"
            size="compact"
            variant={kind === 'agency' ? 'primary' : 'secondary'}
            onPress={() => setKind('agency')}
          />
        ) : null}
      </View>

      <Input
        label="Nombre de la dirección (opcional)"
        value={label}
        onChangeText={setLabel}
        maxLength={ADDRESS_FIELD_LIMITS.label}
        hint="Como «Casa» o «Oficina»."
      />
      <Input
        label="Quién recibe"
        value={recipientName}
        onChangeText={setRecipientName}
        maxLength={ADDRESS_FIELD_LIMITS.recipientName}
        autoCapitalize="words"
      />
      <Input
        label="Teléfono de quien recibe"
        value={recipientPhone}
        onChangeText={setRecipientPhone}
        maxLength={CUSTOMER_PHONE_MAX_LENGTH}
        keyboardType="phone-pad"
        error={phoneLooksWrong ? PHONE_SHAPE_MESSAGE : undefined}
      />

      <Divider />

      {kind === 'address' ? (
        <>
          <Input
            label="Dirección"
            value={addressLine}
            onChangeText={setAddressLine}
            maxLength={ADDRESS_FIELD_LIMITS.addressLine}
          />
          <Input
            label="Distrito"
            value={district}
            onChangeText={setDistrict}
            maxLength={ADDRESS_FIELD_LIMITS.district}
          />
          <Input
            label="Ciudad"
            value={city}
            onChangeText={setCity}
            maxLength={ADDRESS_FIELD_LIMITS.city}
          />
          <Input
            label="Departamento (opcional)"
            value={department}
            onChangeText={setDepartment}
            maxLength={ADDRESS_FIELD_LIMITS.department}
          />
          <Input
            label="Referencia (opcional)"
            value={reference}
            onChangeText={setReference}
            maxLength={ADDRESS_FIELD_LIMITS.reference}
            hint="Algo que ayude a encontrarla."
          />
        </>
      ) : (
        <>
          <Text variant="subhead">Transportista</Text>
          <View style={{ flexDirection: 'row', gap: theme.spacing.xs, flexWrap: 'wrap' }}>
            {agencyCarriers.map((option) => (
              <Button
                key={option.id}
                label={option.name}
                size="compact"
                variant={carrier === option.id ? 'primary' : 'secondary'}
                onPress={() => setCarrier(option.id)}
              />
            ))}
          </View>
          <Input
            label="Agencia"
            value={agencyName}
            onChangeText={setAgencyName}
            maxLength={ADDRESS_FIELD_LIMITS.agencyName}
          />
          <Input
            label="Localidad de la agencia"
            value={agencyLocality}
            onChangeText={setAgencyLocality}
            maxLength={ADDRESS_FIELD_LIMITS.agencyLocality}
          />
          <Input
            label="Departamento (opcional)"
            value={department}
            onChangeText={setDepartment}
            maxLength={ADDRESS_FIELD_LIMITS.department}
          />
        </>
      )}

      {entry && entry.kind !== kind ? (
        <Text variant="caption" color="textSecondary">
          {kind === 'agency'
            ? 'Al guardarla como agencia se quitan la dirección, el distrito y la ciudad.'
            : 'Al guardarla como dirección se quitan la agencia y su transportista.'}
        </Text>
      ) : null}

      <Button
        label={entry ? 'Guardar los cambios' : 'Guardar la dirección'}
        loading={isSaving}
        disabled={!ready}
        onPress={submit}
      />
      <Button label="Cancelar" variant="ghost" onPress={onCancel} />

      {error ? (
        <Text variant="caption" color="danger">
          {addressErrorMessage(error)}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * The shop's own sentence about what it refused.
 *
 * `{field: [message]}` for a field, `{detail: …}` for a rule about the book —
 * the ten-entry limit, or «Completa tu nombre en «Mi cuenta» antes de guardar
 * una dirección.», which is the first entry needing a record with a name.
 */
export function addressErrorMessage(error: unknown): string {
  const fieldErrors = (error as { fieldErrors?: Record<string, readonly string[]> } | null)
    ?.fieldErrors;
  if (fieldErrors) {
    const first = Object.values(fieldErrors).find((messages) => messages.length > 0);
    if (first?.[0]) return first[0];
  }
  if (error instanceof Error && error.message) return error.message;
  return 'No se pudo guardar la dirección.';
}
