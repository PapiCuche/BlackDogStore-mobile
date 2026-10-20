import { Stack } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import {
  AppHeader,
  Button,
  Card,
  Divider,
  ErrorState,
  Input,
  KeyValueRow,
  LoadingState,
  Screen,
  SectionHeader,
  StatusBadge,
  Text,
} from '@/design-system';
import type { CustomerAddress } from '@/domain/customer/address-types';
import { describeAddressKind, summariseAddress } from '@/domain/customer/address-types';
import { AddressEditor } from '@/features/account/address-editor';
import {
  EmailVerificationBadge,
  ProfileForm,
  profileErrorMessage,
  profileFingerprint,
} from '@/features/account/profile-form';
import {
  PrivateActionPrompt,
  usePrivateActionState,
} from '@/features/auth/private-action-gate';
import {
  useAddAddress,
  useAddressBook,
  useConfirmEmailCode,
  useCustomerProfile,
  useEditAddress,
  useMakeAddressDefault,
  useRemoveAddress,
  useSaveProfile,
  useSendEmailCode,
} from '@/hooks/use-customer-account';
import { useTheme } from '@/theme/theme-provider';

/**
 * «Mi cuenta» — my record and my addresses in this shop. CLIENT-SEC-01,
 * DELIVERY-01.
 *
 * PRIVATE, so the gate comes before any query state: a disabled query leaves
 * `isPending` true forever, and an anonymous visitor would watch a spinner
 * that never resolves.
 *
 * THE TWO HALVES ARE TIED. The first entry of the address book needs a record
 * with a name, so the server refuses it with «Completa tu nombre en «Mi
 * cuenta»» — which is why the profile sits above the book on one screen
 * instead of hiding in a separate one.
 *
 * NOTHING HERE DECIDES. The phone is rewritten into the form the CRM keeps,
 * the RUC's check digit is the server's arithmetic, the document can be the
 * shop's to change, the entry limit is the shop's rule, and the agencies are
 * the ones it has switched on today. Every answer comes back from the server
 * and re-seeds what is shown.
 */
export default function AccountScreen() {
  const theme = useTheme();
  const access = usePrivateActionState();
  const signedIn = access === 'ready';

  const profileQuery = useCustomerProfile({ enabled: signedIn });
  const bookQuery = useAddressBook({ enabled: signedIn });

  const saveProfile = useSaveProfile();
  const sendCode = useSendEmailCode();
  const confirmCode = useConfirmEmailCode();
  const addAddress = useAddAddress();
  const editAddress = useEditAddress();
  const removeAddress = useRemoveAddress();
  const makeDefault = useMakeAddressDefault();

  const [code, setCode] = useState('');
  const [editing, setEditing] = useState<CustomerAddress | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState<number | null>(null);

  const heading = (
    <AppHeader
      title="Mi cuenta"
      eyebrow="Tu perfil"
      subtitle="Tus datos y tus direcciones en esta tienda."
    />
  );

  if (access !== 'ready' && access !== 'pending') {
    return (
      <>
        <Stack.Screen options={{ title: 'Mi cuenta' }} />
        <Screen scrollable contentContainerStyle={{ flexGrow: 1 }}>
          {heading}
          <PrivateActionPrompt
            state={access}
            message="Tu cuenta es privada. Entra con tu sesión para ver y corregir tus datos."
          />
        </Screen>
      </>
    );
  }

  if (profileQuery.isPending) {
    return (
      <>
        <Stack.Screen options={{ title: 'Mi cuenta' }} />
        <Screen scrollable>
          {heading}
          <LoadingState label="Cargando tu cuenta" skeletonCount={3} />
        </Screen>
      </>
    );
  }

  if (profileQuery.isError || !profileQuery.data) {
    return (
      <>
        <Stack.Screen options={{ title: 'Mi cuenta' }} />
        <Screen scrollable contentContainerStyle={{ flexGrow: 1 }}>
          {heading}
          <ErrorState
            error={profileQuery.error}
            onRetry={() => void profileQuery.refetch()}
          />
        </Screen>
      </>
    );
  }

  const profile = profileQuery.data;
  const book = bookQuery.data;
  const full = book ? book.entries.length >= book.limit && book.limit > 0 : false;

  return (
    <>
      <Stack.Screen options={{ title: 'Mi cuenta' }} />
      <Screen scrollable>
        <View style={{ gap: theme.spacing.md }}>
          {heading}

          <View>
            <SectionHeader title="Tu correo" />
            <Card variant="outlined">
              <View style={{ gap: theme.spacing.xs }}>
                <KeyValueRow label="Correo" value={profile.email || '—'} />
                <EmailVerificationBadge profile={profile} />

                {/* The server decides whether a code can be sent. Offering the
                    button when it says no teaches people it is broken. */}
                {profile.emailVerificationAvailable ? (
                  <View style={{ gap: theme.spacing.xs }}>
                    <Text variant="caption" color="textSecondary">
                      Verificar tu correo te permite guardar tu documento y recuperar tu
                      cuenta.
                    </Text>
                    <Button
                      label="Enviarme un código"
                      variant="secondary"
                      loading={sendCode.isPending}
                      onPress={() => sendCode.mutate(undefined)}
                    />
                    <Input
                      label="Código recibido"
                      value={code}
                      onChangeText={setCode}
                      keyboardType="number-pad"
                      maxLength={6}
                    />
                    <Button
                      label="Confirmar el código"
                      disabled={code.trim().length === 0}
                      loading={confirmCode.isPending}
                      onPress={() =>
                        confirmCode.mutate(
                          { code },
                          { onSuccess: () => setCode('') },
                        )
                      }
                    />
                    {sendCode.error ? (
                      <Text variant="caption" color="textSecondary">
                        {profileErrorMessage(sendCode.error)}
                      </Text>
                    ) : null}
                    {confirmCode.error ? (
                      <Text variant="caption" color="danger">
                        {profileErrorMessage(confirmCode.error)}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
              </View>
            </Card>
          </View>

          <View>
            <SectionHeader title="Tus datos" />
            <Card variant="outlined">
              <ProfileForm
                // Remounted when the server's answer differs from what was
                // typed: a phone it normalised, a document it locked.
                key={profileFingerprint(profile)}
                profile={profile}
                isSaving={saveProfile.isPending}
                error={saveProfile.error}
                onSave={(changes) => saveProfile.mutate(changes)}
              />
            </Card>
          </View>

          <View>
            <SectionHeader title="Tus direcciones" />
            <Card variant="outlined">
              {bookQuery.isPending ? (
                <Text variant="subhead" color="textSecondary">
                  Cargando tus direcciones…
                </Text>
              ) : bookQuery.isError || !book ? (
                <Text variant="subhead" color="danger">
                  No se pudieron cargar tus direcciones.
                </Text>
              ) : (
                <View style={{ gap: theme.spacing.sm }}>
                  {book.entries.length === 0 ? (
                    <Text variant="subhead" color="textSecondary">
                      Todavía no has guardado ninguna dirección.
                    </Text>
                  ) : (
                    book.entries.map((entry, index) => (
                      <View key={entry.id} style={{ gap: theme.spacing.xs }}>
                        {index > 0 ? <Divider /> : null}
                        <View
                          style={{
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            gap: theme.spacing.sm,
                          }}
                        >
                          <Text variant="headline" style={{ flex: 1 }}>
                            {entry.label || describeAddressKind(entry.kind)}
                          </Text>
                          {entry.isDefault ? (
                            <StatusBadge
                              label="Predeterminada"
                              tone="success"
                              size="small"
                              accessibilityPrefix="Dirección"
                            />
                          ) : null}
                        </View>
                        <Text variant="subhead" color="textSecondary">
                          {summariseAddress(entry)}
                        </Text>
                        <Text variant="caption" color="textTertiary">
                          {entry.recipientName}
                          {entry.recipientPhone ? ` · ${entry.recipientPhone}` : ''}
                        </Text>

                        {editing?.id === entry.id ? (
                          <AddressEditor
                            entry={entry}
                            agencyCarriers={book.agencyCarriers}
                            isSaving={editAddress.isPending}
                            error={editAddress.error}
                            onCancel={() => setEditing(null)}
                            onSave={(changes) =>
                              editAddress.mutate(
                                { id: entry.id, changes },
                                { onSuccess: () => setEditing(null) },
                              )
                            }
                          />
                        ) : (
                          <View
                            style={{ flexDirection: 'row', gap: theme.spacing.xs, flexWrap: 'wrap' }}
                          >
                            <Button
                              label="Corregir"
                              variant="ghost"
                              size="compact"
                              onPress={() => {
                                setAdding(false);
                                setEditing(entry);
                              }}
                            />
                            {!entry.isDefault ? (
                              <Button
                                label="Usar por defecto"
                                variant="ghost"
                                size="compact"
                                loading={makeDefault.isPending}
                                onPress={() => makeDefault.mutate({ id: entry.id })}
                              />
                            ) : null}
                            {confirmRemoveId === entry.id ? (
                              <>
                                <Button
                                  label="Sí, quitarla"
                                  variant="destructive"
                                  size="compact"
                                  loading={removeAddress.isPending}
                                  onPress={() => {
                                    setConfirmRemoveId(null);
                                    removeAddress.mutate({ id: entry.id });
                                  }}
                                />
                                <Button
                                  label="Mejor no"
                                  variant="ghost"
                                  size="compact"
                                  onPress={() => setConfirmRemoveId(null)}
                                />
                              </>
                            ) : (
                              <Button
                                label="Quitar"
                                variant="ghost"
                                size="compact"
                                onPress={() => setConfirmRemoveId(entry.id)}
                              />
                            )}
                          </View>
                        )}
                      </View>
                    ))
                  )}

                  <Divider />

                  {adding ? (
                    <AddressEditor
                      entry={null}
                      agencyCarriers={book.agencyCarriers}
                      isSaving={addAddress.isPending}
                      error={addAddress.error}
                      onCancel={() => setAdding(false)}
                      onSave={(input) =>
                        addAddress.mutate(input, { onSuccess: () => setAdding(false) })
                      }
                    />
                  ) : (
                    <View style={{ gap: theme.spacing.xs }}>
                      <Button
                        label="Agregar una dirección"
                        // The limit is the shop's, read from the book itself.
                        disabled={full}
                        onPress={() => {
                          setEditing(null);
                          setAdding(true);
                        }}
                      />
                      {full ? (
                        <Text variant="caption" color="textSecondary">
                          {`Puedes guardar hasta ${book.limit} direcciones. Quita una para agregar otra.`}
                        </Text>
                      ) : null}
                      {removeAddress.error ? (
                        <Text variant="caption" color="danger">
                          {profileErrorMessage(removeAddress.error)}
                        </Text>
                      ) : null}
                    </View>
                  )}
                </View>
              )}
            </Card>
          </View>
        </View>
      </Screen>
    </>
  );
}
