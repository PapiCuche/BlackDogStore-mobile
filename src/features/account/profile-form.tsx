import { useState } from 'react';
import { View } from 'react-native';

import { Button, Divider, Input, StatusBadge, Text } from '@/design-system';
import type {
  CustomerDocumentType,
  CustomerProfile,
  CustomerProfileInput,
} from '@/domain/customer/profile-types';
import {
  CUSTOMER_DOCUMENT_MAX_LENGTH,
  CUSTOMER_DOCUMENT_TYPES,
  CUSTOMER_NAME_MAX_LENGTH,
  CUSTOMER_PHONE_MAX_LENGTH,
  DOCUMENT_PATTERNS,
  DOCUMENT_SHAPE_MESSAGES,
  PHONE_SHAPE_MESSAGE,
  describeDocumentType,
  isPlausibleCustomerPhone,
} from '@/domain/customer/profile-types';
import { useTheme } from '@/theme/theme-provider';
import { formatDate } from '@/utils/format';

/**
 * «Mi cuenta» — my five fields in this shop, CLIENT-SEC-01.
 *
 * ONLY WHAT CHANGED IS SENT. The server keeps any field a PATCH omits, so
 * sending the whole form would overwrite a phone somebody corrected at the
 * counter a minute ago. The form compares against the profile it was seeded
 * with and sends the difference.
 *
 * THE DOCUMENT IS NOT ALWAYS MINE. When the shop owns it the server says so in
 * `document_locked`; the value is still shown — a person needs to read what is
 * on file — but it is not offered for editing, and the save would refuse it
 * anyway.
 *
 * THE CHECKS HERE CATCH TYPOS, NOT TRUTH. A RUC has a check digit the server
 * verifies with its own arithmetic, and a phone is rewritten into the form the
 * CRM keeps.
 *
 * THE SERVER'S ANSWER RE-SEEDS THE FORM, and it does so by REMOUNTING it: the
 * screen keys this component on `profileFingerprint`, so a save that
 * normalises a phone or locks a document starts the fields from what now
 * exists. Copying props into state inside an effect would do the same thing a
 * render later, and one render with the old value is the render somebody taps.
 */
export type ProfileFormProps = {
  profile: CustomerProfile;
  isSaving: boolean;
  error: unknown;
  onSave: (changes: CustomerProfileInput) => void;
};

/**
 * What the form is seeded from, as one string.
 *
 * The screen passes it as `key`. Any field the server changed — including one
 * nobody asked it to change, like `document_locked` after a save — remounts
 * the form on the record that now exists.
 */
export function profileFingerprint(profile: CustomerProfile): string {
  return [
    profile.firstName,
    profile.lastName,
    profile.phone,
    profile.documentType,
    profile.documentNumber,
    String(profile.documentLocked),
    String(profile.emailVerifiedAt),
  ].join('\u0000');
}

export function ProfileForm({ profile, isSaving, error, onSave }: ProfileFormProps) {
  const theme = useTheme();
  const [firstName, setFirstName] = useState(profile.firstName);
  const [lastName, setLastName] = useState(profile.lastName);
  const [phone, setPhone] = useState(profile.phone);
  const [documentType, setDocumentType] = useState<CustomerDocumentType | ''>(
    profile.documentType,
  );
  const [documentNumber, setDocumentNumber] = useState(profile.documentNumber);

  const phoneLooksWrong = !isPlausibleCustomerPhone(phone);
  const documentLooksWrong =
    documentType !== ''
    && documentNumber.trim() !== ''
    && !DOCUMENT_PATTERNS[documentType].test(documentNumber.trim());
  const shapeMessage = documentType === '' ? '' : DOCUMENT_SHAPE_MESSAGES[documentType];

  const changes: CustomerProfileInput = {};
  if (firstName !== profile.firstName) changes.firstName = firstName;
  if (lastName !== profile.lastName) changes.lastName = lastName;
  if (phone !== profile.phone) changes.phone = phone;
  if (
    !profile.documentLocked
    && (documentType !== profile.documentType || documentNumber !== profile.documentNumber)
  ) {
    changes.documentType = documentType;
    changes.documentNumber = documentNumber;
  }

  const touched = Object.keys(changes).length > 0;
  const blocked = phoneLooksWrong || documentLooksWrong;

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Input
        label="Nombres"
        value={firstName}
        onChangeText={setFirstName}
        maxLength={CUSTOMER_NAME_MAX_LENGTH}
        autoCapitalize="words"
      />
      <Input
        label="Apellidos"
        value={lastName}
        onChangeText={setLastName}
        maxLength={CUSTOMER_NAME_MAX_LENGTH}
        autoCapitalize="words"
      />
      <Input
        label="Teléfono"
        value={phone}
        onChangeText={setPhone}
        maxLength={CUSTOMER_PHONE_MAX_LENGTH}
        keyboardType="phone-pad"
        error={phoneLooksWrong ? PHONE_SHAPE_MESSAGE : undefined}
        hint="Un celular peruano. La tienda lo usa para avisarte."
      />

      <Divider />

      {profile.documentLocked ? (
        <View style={{ gap: theme.spacing.xs }}>
          <Text variant="subhead">Documento</Text>
          <Text>
            {profile.documentType
              ? `${describeDocumentType(profile.documentType)} ${profile.documentNumber}`
              : 'Sin documento registrado.'}
          </Text>
          {/* The server's own sentence, because it is the shop's rule. */}
          <Text variant="caption" color="textSecondary">
            El documento de tu ficha lo cambia la tienda. Comunícate con ella si necesitas
            corregirlo.
          </Text>
        </View>
      ) : (
        <View style={{ gap: theme.spacing.xs }}>
          <Text variant="subhead">Documento</Text>
          <View style={{ flexDirection: 'row', gap: theme.spacing.xs, flexWrap: 'wrap' }}>
            {CUSTOMER_DOCUMENT_TYPES.map((option) => (
              <Button
                key={option}
                label={describeDocumentType(option)}
                size="compact"
                variant={documentType === option ? 'primary' : 'secondary'}
                onPress={() => setDocumentType(option)}
              />
            ))}
          </View>
          <Input
            label="Número"
            value={documentNumber}
            onChangeText={setDocumentNumber}
            maxLength={CUSTOMER_DOCUMENT_MAX_LENGTH}
            autoCapitalize="characters"
            error={documentLooksWrong ? shapeMessage : undefined}
          />
          {/* Said before the save, because the server refuses it afterwards. */}
          {!profile.emailVerifiedAt ? (
            <Text variant="caption" color="textSecondary">
              Verifica tu correo antes de guardar tu documento. Puedes hacerlo aquí mismo.
            </Text>
          ) : null}
        </View>
      )}

      <Button
        label="Guardar cambios"
        loading={isSaving}
        disabled={!touched || blocked}
        onPress={() => onSave(changes)}
      />

      {error ? (
        <Text variant="caption" color="danger">
          {profileErrorMessage(error)}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * What the shop said, field by field.
 *
 * The server answers a refused save with `{field: [message]}` in its own
 * words — «El DNI debe tener exactamente 8 dígitos.», «El documento no se
 * puede quitar desde aquí.» — and those sentences are the useful ones. A
 * generic «no se pudo guardar» would hide which rule was broken.
 */
export function profileErrorMessage(error: unknown): string {
  const fieldErrors = (error as { fieldErrors?: Record<string, readonly string[]> } | null)
    ?.fieldErrors;
  if (fieldErrors) {
    const first = Object.values(fieldErrors).find((messages) => messages.length > 0);
    if (first?.[0]) return first[0];
  }
  if (error instanceof Error && error.message) return error.message;
  return 'No se pudieron guardar tus datos.';
}

/** The badge on the account's address: proved, or still to prove. */
export function EmailVerificationBadge({ profile }: { profile: CustomerProfile }) {
  return profile.emailVerifiedAt ? (
    <StatusBadge
      label={`Verificado el ${formatDate(profile.emailVerifiedAt)}`}
      tone="success"
      size="small"
      accessibilityPrefix="Estado del correo"
    />
  ) : (
    <StatusBadge
      label="Sin verificar"
      tone="warning"
      size="small"
      accessibilityPrefix="Estado del correo"
    />
  );
}
