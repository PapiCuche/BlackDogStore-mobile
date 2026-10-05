import { Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import {
  AppHeader,
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
import { useAnnouncement, useAnnouncementStats } from '@/hooks/use-internal-communications';
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
