import { Stack } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { serviceErrorMessage } from '@/api/endpoints/internal-service-v1';
import {
  AppHeader,
  Button,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  icons,
  Input,
  KeyValueRow,
  LoadingState,
  Screen,
  SectionHeader,
  StatusBadge,
  Text,
} from '@/design-system';
import {
  CALLING_CODE_MAX_DIGITS,
  CAP_SETTINGS_MANAGE,
  CAP_SETTINGS_VIEW,
  TEMPLATE_LANGUAGE_PATTERN,
  TEMPLATE_NAME_PATTERN,
} from '@/domain/internal/messaging-types';
import { hasUxCapability } from '@/domain/internal/types';
import { useInternalContext } from '@/hooks/use-internal-sales';
import {
  useMessagingSettings,
  useSaveMessagingSettings,
} from '@/hooks/use-internal-messaging';
import { useTheme } from '@/theme/theme-provider';

/**
 * The shop's WhatsApp setup — WHATSAPP-NOTIFY.
 *
 * TWO OWNERS, AND THE SCREEN SAYS WHICH IS WHICH. The provider credentials and
 * the phone number id belong to whoever operates the deployment; the shop owns
 * the switch, the country code, the template language and the template names.
 * Credentials are reported as present or missing and NEVER as values, because
 * that is all the server sends.
 *
 * `enabled` IS NOT OFFERED UNTIL THE PROVIDER SIDE IS COMPLETE. The server
 * refuses it with its own sentence; this screen reads `ready` to decide what to
 * offer, and shows `missing` so somebody knows who to ask.
 *
 * SAVING SENDS ONLY WHAT CHANGED. `PATCH` leaves an omitted key alone, so
 * sending every field on every save would overwrite what a colleague just
 * changed from the console.
 */
export default function MessagingSettingsScreen() {
  const theme = useTheme();
  const { data: context, isPending: contextPending } = useInternalContext();
  const mayView = hasUxCapability(context ?? null, CAP_SETTINGS_VIEW);
  const mayManage = hasUxCapability(context ?? null, CAP_SETTINGS_MANAGE);

  const query = useMessagingSettings({ enabled: mayView });
  const { data: settings, isPending, isError, error, refetch } = query;
  const save = useSaveMessagingSettings();

  const [callingCode, setCallingCode] = useState<string | null>(null);
  const [language, setLanguage] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Record<string, string>>({});

  const languageValue = language ?? settings?.templateLanguage ?? '';
  const callingCodeValue = callingCode ?? settings?.defaultCallingCode ?? '';
  const languageIsValid = languageValue === '' || TEMPLATE_LANGUAGE_PATTERN.test(languageValue);
  const templateNamesAreValid = Object.values(templates).every(
    (name) => name === '' || TEMPLATE_NAME_PATTERN.test(name),
  );

  if (contextPending || (mayView && isPending)) {
    return (
      <>
        <Stack.Screen options={{ title: 'WhatsApp' }} />
        <Screen scrollable>
          <LoadingState label="Cargando configuración" />
        </Screen>
      </>
    );
  }

  if (!mayView) {
    return (
      <>
        <Stack.Screen options={{ title: 'WhatsApp' }} />
        <Screen scrollable contentContainerStyle={{ flexGrow: 1 }}>
          <EmptyState
            icon={icons.info}
            title="No administras la configuración"
            message="Ver y cambiar la configuración de avisos necesita un permiso que no tienes."
          />
        </Screen>
      </>
    );
  }

  if (isError || !settings) {
    return (
      <>
        <Stack.Screen options={{ title: 'WhatsApp' }} />
        <Screen scrollable contentContainerStyle={{ flexGrow: 1 }}>
          <ErrorState error={error} onRetry={() => void refetch()} />
        </Screen>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'WhatsApp' }} />
      <Screen scrollable>
        <View style={{ gap: theme.spacing.md }}>
          <AppHeader
            title="Avisos por WhatsApp"
            eyebrow="Configuración"
            subtitle="Lo que la tienda controla, y lo que depende de quien administra la instalación."
          />

          <Card>
            <View style={{ gap: theme.spacing.sm }}>
              <StatusBadge
                label={settings.enabled ? 'Activado' : 'Desactivado'}
                tone={settings.enabled ? 'success' : 'neutral'}
                accessibilityPrefix="Estado de los avisos"
              />
              <KeyValueRow label="Proveedor" value={settings.provider || '—'} />
              <KeyValueRow
                label="Número configurado"
                value={settings.phoneNumberConfigured ? 'Sí' : 'No'}
              />
              {/* Booleans, because that is all the server sends: a credential's
                  value never leaves the deployment. */}
              {Object.entries(settings.credentials).map(([name, present]) => (
                <KeyValueRow key={name} label={name} value={present ? 'Configurada' : 'Falta'} />
              ))}
              {settings.missing.length > 0 ? (
                <Text variant="footnote" color="statusWarning">
                  Falta: {settings.missing.join(', ')}. Lo configura quien administra
                  la instalación.
                </Text>
              ) : null}
            </View>
          </Card>

          {mayManage ? (
            <View>
              <SectionHeader title="Lo que controla la tienda" />
              <Card variant="outlined">
                <View style={{ gap: theme.spacing.sm }}>
                  {/* Offered only when the provider side is complete. The server
                      refuses otherwise, and offering a switch that bounces is
                      worse than explaining why it is absent. */}
                  {settings.ready ? (
                    <Button
                      label={settings.enabled ? 'Desactivar los avisos' : 'Activar los avisos'}
                      variant={settings.enabled ? 'secondary' : 'primary'}
                      loading={save.isPending}
                      onPress={() => save.mutate({ enabled: !settings.enabled })}
                    />
                  ) : (
                    <Text variant="footnote" color="textSecondary">
                      No se puede activar todavía: faltan credenciales del proveedor.
                    </Text>
                  )}

                  <Divider />

                  <Input
                    label="Código de país por defecto"
                    value={callingCodeValue}
                    onChangeText={(value) =>
                      setCallingCode(value.replace(/\D/g, '').slice(0, CALLING_CODE_MAX_DIGITS))
                    }
                    keyboardType="number-pad"
                    hint="Se usa cuando un teléfono no lo trae. Sólo dígitos."
                  />
                  <Input
                    label="Idioma de las plantillas"
                    value={languageValue}
                    onChangeText={setLanguage}
                    autoCapitalize="none"
                    hint="Ejemplos: es, es_MX, en_US."
                    error={languageIsValid ? undefined : 'Idioma no reconocido.'}
                  />

                  <Divider />

                  <Text variant="footnote" color="textSecondary">
                    Una plantilla por aviso, con el nombre aprobado en el proveedor.
                    Vacío significa que ese aviso no se envía por WhatsApp.
                  </Text>
                  {settings.events.map((event) => (
                    <Input
                      key={event.code}
                      label={event.label}
                      value={templates[event.code] ?? settings.templates[event.code] ?? ''}
                      onChangeText={(value) =>
                        setTemplates((current) => ({ ...current, [event.code]: value }))
                      }
                      autoCapitalize="none"
                      error={
                        (templates[event.code] ?? '') === ''
                        || TEMPLATE_NAME_PATTERN.test(templates[event.code]!)
                          ? undefined
                          : 'Sólo minúsculas, números y guion bajo.'
                      }
                    />
                  ))}

                  {settings.templateParameters.length > 0 ? (
                    <Text variant="caption" color="textTertiary">
                      Parámetros disponibles: {settings.templateParameters.join(', ')}
                    </Text>
                  ) : null}

                  {save.isError ? (
                    <Text variant="subhead" color="danger">
                      {serviceErrorMessage(save.error)}
                    </Text>
                  ) : null}

                  {/* Only what changed. PATCH leaves the rest alone, and sending
                      everything would overwrite a colleague's edit. */}
                  <Button
                    label="Guardar cambios"
                    loading={save.isPending}
                    onPress={() => {
                      const input: Parameters<typeof save.mutate>[0] = {};
                      if (callingCode !== null) input.defaultCallingCode = callingCode;
                      if (language !== null) input.templateLanguage = language;
                      if (Object.keys(templates).length > 0) input.templates = templates;
                      save.mutate(input, {
                        onSuccess: () => {
                          setCallingCode(null);
                          setLanguage(null);
                          setTemplates({});
                        },
                      });
                    }}
                    disabled={!languageIsValid || !templateNamesAreValid}
                  />
                </View>
              </Card>
            </View>
          ) : null}

          <View>
            <SectionHeader title="Para quien administra la instalación" />
            <Card variant="outlined">
              <View style={{ gap: theme.spacing.xs }}>
                <Text variant="footnote" color="textSecondary">
                  El proveedor publica los estados de entrega en esta ruta:
                </Text>
                <Text variant="mono" selectable>
                  {settings.webhookPath}
                </Text>
              </View>
            </Card>
          </View>
        </View>
      </Screen>
    </>
  );
}
