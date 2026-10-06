import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import {
  AppHeader,
  Button,
  Card,
  Divider,
  ErrorState,
  KeyValueRow,
  LoadingState,
  Screen,
  SectionHeader,
  StatusBadge,
  Text,
} from '@/design-system';
import {
  describeAnnouncementStatus,
} from '@/domain/internal/announcement-types';
import type { AnnouncementPreview } from '@/domain/internal/announcement-types';
import { announcementErrorMessage } from '@/features/internal/announcement-composer';
import {
  useAnnouncement,
  useAnnouncementStats,
  useCancelAnnouncementDraft,
  usePreviewAnnouncement,
  usePublishAnnouncement,
  useUpdateAnnouncementDraft,
} from '@/hooks/use-internal-communications';
import { useTheme } from '@/theme/theme-provider';
import { formatDate } from '@/utils/format';

/**
 * One communiqué, as the company that sent it sees it — M12C.
 *
 * THE AUDIENCE IS SHOWN ONLY BECAUSE THE SERVER SENT IT. `audience` arrives for
 * somebody who manages this company's messages and is absent for a recipient,
 * so this screen renders it when present and says nothing when it is not —
 * never an empty list, which would read as "sent to nobody".
 *
 * THE NUMBERS ARE AGGREGATES, BY DECISION. Eleven of forty read it is
 * management; which eleven is surveillance, and the server offers no per-person
 * list to ask for. `readPct` is the server's arithmetic, not this app's.
 *
 * A DRAFT CAN BE FINISHED HERE: addressed to the whole company, counted, sent
 * or discarded. Each is its own button because each is its own act — the server
 * refuses to publish a draft nobody was addressed to, and refuses to unsay a
 * published one.
 *
 * THE COUNT IS NOT A PROMISE. `preview` resolves the audience to answer and
 * publication resolves it again from scratch, so the number is shown as of the
 * moment it was asked for and is cleared the moment anything changes.
 */
export default function CommunicationDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const parsed = Number(id);
  const announcementId = Number.isFinite(parsed) ? parsed : undefined;

  const query = useAnnouncement(announcementId);
  const { data: announcement, isPending, isError, error, refetch } = query;
  // Only a published message has anything to count.
  const stats = useAnnouncementStats(announcementId, {
    enabled: announcement?.status === 'published',
  });

  const address = useUpdateAnnouncementDraft();
  const preview = usePreviewAnnouncement();
  const publish = usePublishAnnouncement();
  const cancel = useCancelAnnouncementDraft();
  // Held in the screen, never cached: see the note above.
  const [reach, setReach] = useState<AnnouncementPreview | null>(null);
  const [confirmingPublish, setConfirmingPublish] = useState(false);

  const draftBusy =
    address.isPending || preview.isPending || publish.isPending || cancel.isPending;
  const draftError = address.error ?? preview.error ?? publish.error ?? cancel.error;

  if (isPending) {
    return (
      <>
        <Stack.Screen options={{ title: 'Comunicado' }} />
        <Screen scrollable>
          <LoadingState label="Cargando comunicado" />
        </Screen>
      </>
    );
  }

  if (isError || !announcement) {
    return (
      <>
        <Stack.Screen options={{ title: 'Comunicado' }} />
        <Screen scrollable contentContainerStyle={{ flexGrow: 1 }}>
          <ErrorState error={error} onRetry={() => void refetch()} />
        </Screen>
      </>
    );
  }

  const state = describeAnnouncementStatus(announcement.status);

  return (
    <>
      <Stack.Screen options={{ title: 'Comunicado' }} />
      <Screen scrollable>
        <View style={{ gap: theme.spacing.md }}>
          <AppHeader title={announcement.title} eyebrow="Comunicado" />

          <Card>
            <View style={{ gap: theme.spacing.sm }}>
              <StatusBadge
                label={state.label}
                tone={state.tone}
                accessibilityPrefix="Estado del comunicado"
              />
              <Text>{announcement.body}</Text>
              <Divider />
              <KeyValueRow label="Autor" value={announcement.author || '—'} />
              <KeyValueRow label="Creado" value={formatDate(announcement.createdAt)} />
              <KeyValueRow
                label="Publicado"
                value={
                  announcement.publishedAt ? formatDate(announcement.publishedAt) : 'Sin publicar'
                }
              />
              <KeyValueRow
                label="Destinatarios"
                value={
                  announcement.status === 'published'
                    ? String(announcement.recipientCount)
                    : 'Se fijan al publicar'
                }
              />
            </View>
          </Card>

          {announcement.status === 'published' ? (
            <View>
              <SectionHeader title="Lectura" />
              <Card variant="outlined">
                {stats.isPending ? (
                  <Text variant="subhead" color="textSecondary">
                    Cargando cifras…
                  </Text>
                ) : stats.isError ? (
                  <Text variant="subhead" color="danger">
                    No se pudieron cargar las cifras.
                  </Text>
                ) : stats.data ? (
                  <View style={{ gap: theme.spacing.xs }}>
                    <KeyValueRow label="Destinatarios" value={String(stats.data.recipients)} />
                    <KeyValueRow label="Leído" value={String(stats.data.read)} />
                    <KeyValueRow label="Sin leer" value={String(stats.data.unread)} />
                    <KeyValueRow label="Porcentaje leído" value={`${stats.data.readPct}%`} />
                    {/* Said out loud, because somebody will ask. */}
                    <Text variant="caption" color="textTertiary">
                      Solo totales: el servidor no expone quién leyó cada comunicado.
                    </Text>
                  </View>
                ) : null}
              </Card>
            </View>
          ) : null}

          {announcement.status === 'draft' ? (
            <View>
              <SectionHeader title="Terminar el borrador" />
              <Card variant="outlined">
                <View style={{ gap: theme.spacing.sm }}>
                  <Text variant="subhead" color="textSecondary">
                    {announcement.audience && announcement.audience.length > 0
                      ? 'Ya tiene destinatarios. Publicarlo escribe un aviso por persona.'
                      : 'Todavía no tiene destinatarios. El servidor no publica un comunicado sin ellos.'}
                  </Text>

                  {/* The only audience this app composes. The other four kinds
                      name a branch, a role, a capability code or a person, and
                      no v1 route lists any of them — BR-012. */}
                  <Button
                    label="Dirigirlo a toda la empresa"
                    variant="secondary"
                    loading={address.isPending}
                    onPress={() => {
                      setReach(null);
                      setConfirmingPublish(false);
                      address.mutate({ id: announcement.id, audienceAllCompany: true });
                    }}
                  />
                  <Text variant="caption" color="textTertiary">
                    Para enviarlo solo a una sucursal, a un rol o a personas
                    concretas, usa la consola web: esta app no puede elegirlos.
                  </Text>

                  <Divider />

                  <Button
                    label="Ver a cuántas personas llegaría"
                    variant="ghost"
                    loading={preview.isPending}
                    onPress={() =>
                      preview.mutate(
                        { id: announcement.id },
                        { onSuccess: (result) => setReach(result) },
                      )
                    }
                  />
                  {reach ? (
                    <View style={{ gap: theme.spacing.xs }}>
                      <KeyValueRow
                        label="Llegaría a"
                        value={`${reach.recipientCount} personas`}
                      />
                      <Text variant="caption" color="textTertiary">
                        Es una estimación de este momento: al publicar, el
                        servidor vuelve a resolver la lista desde cero.
                      </Text>
                    </View>
                  ) : null}

                  <Divider />

                  {confirmingPublish ? (
                    <View style={{ gap: theme.spacing.xs }}>
                      <Text variant="subhead">
                        Se enviará ahora y no se puede retirar.
                      </Text>
                      <Button
                        label="Publicarlo"
                        loading={publish.isPending}
                        onPress={() => {
                          setConfirmingPublish(false);
                          publish.mutate({ id: announcement.id });
                        }}
                      />
                      <Button
                        label="Mejor no"
                        variant="ghost"
                        onPress={() => setConfirmingPublish(false)}
                      />
                    </View>
                  ) : (
                    // Publishing writes a row in every recipient's inbox and
                    // the server will not unsay it, so it is asked twice.
                    <Button
                      label="Publicar el comunicado"
                      disabled={draftBusy}
                      onPress={() => setConfirmingPublish(true)}
                    />
                  )}

                  <Button
                    label="Descartar el borrador"
                    variant="destructive"
                    loading={cancel.isPending}
                    onPress={() => cancel.mutate({ id: announcement.id })}
                  />

                  {draftError ? (
                    <Text variant="caption" color="danger">
                      {announcementErrorMessage(draftError)}
                    </Text>
                  ) : null}
                </View>
              </Card>
            </View>
          ) : null}

          {/* Present only for whoever manages this company's messages. */}
          {announcement.audience && announcement.audience.length > 0 ? (
            <View>
              <SectionHeader title="A quién se envió" />
              <Card variant="outlined">
                <View style={{ gap: theme.spacing.xs }}>
                  {announcement.audience.map((rule, index) => (
                    <View key={`${rule.kind}-${index}`}>
                      {index > 0 ? <Divider /> : null}
                      <KeyValueRow
                        label={rule.kind}
                        value={
                          rule.user
                          ?? rule.role
                          ?? rule.capabilityCode
                          ?? rule.branch
                          ?? rule.company
                        }
                      />
                    </View>
                  ))}
                  <Text variant="caption" color="textTertiary">
                    La lista quedó fija al publicar: quien entró después no recibió
                    este comunicado.
                  </Text>
                </View>
              </Card>
            </View>
          ) : null}
        </View>
      </Screen>
    </>
  );
}
