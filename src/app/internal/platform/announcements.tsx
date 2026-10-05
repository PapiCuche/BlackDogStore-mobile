import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { FlatList, View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { isPlatformMaster } from '@/auth/types';
import {
  AppHeader,
  Button,
  Card,
  EmptyState,
  ErrorState,
  icons,
  LoadingState,
  Screen,
  StatusBadge,
  Text,
} from '@/design-system';
import {
  ANNOUNCEMENT_STATUSES,
  describeAnnouncementStatus,
  type AnnouncementStatus,
} from '@/domain/internal/announcement-types';
import { usePlatformAnnouncements } from '@/hooks/use-platform-announcements';
import { useListRefresh } from '@/hooks/use-list-refresh';
import { screenGutter } from '@/theme';
import { useTheme } from '@/theme/theme-provider';
import { formatDate } from '@/utils/format';

/**
 * Communiqués across every company — M12C, platform master.
 *
 * THE AUTHORITY IS THE ACCOUNT. The server asks `user.is_superuser` and
 * answers 404 to anybody else; the session's `isPlatformMaster` decides only
 * whether this screen asks at all. A tenant role called "Master" is not this,
 * and never will be.
 *
 * READ ONLY. Publishing one of these writes a notification row for every
 * recipient in every company it names, and that is not an act to put on a
 * phone before there is an audience editor that makes the blast legible.
 */
export default function PlatformAnnouncementsScreen() {
  const theme = useTheme();
  const { session } = useAuth();
  const isMaster = isPlatformMaster(session);
  const [status, setStatus] = useState<AnnouncementStatus | undefined>(undefined);

  const query = usePlatformAnnouncements({ status }, { enabled: isMaster });
  const { data, isPending, isError, error } = query;
  const { onRefresh, refreshing } = useListRefresh(query, { enabled: !isError });

  const header = (
    <View>
      <AppHeader
        title="Comunicados de plataforma"
        eyebrow="Administración"
        subtitle="Mensajes que cruzan empresas."
      />
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: theme.spacing.xs,
          marginBottom: theme.spacing.md,
        }}
      >
        <Button
          label="Todos"
          size="compact"
          variant={status === undefined ? 'primary' : 'secondary'}
          onPress={() => setStatus(undefined)}
        />
        {ANNOUNCEMENT_STATUSES.map((option) => (
          <Button
            key={option}
            label={describeAnnouncementStatus(option).label}
            size="compact"
            variant={status === option ? 'primary' : 'secondary'}
            onPress={() => setStatus(option)}
          />
        ))}
      </View>
    </View>
  );

  if (!isMaster) {
    return (
      <>
        <Stack.Screen options={{ title: 'Plataforma' }} />
        <Screen scrollable contentContainerStyle={{ flexGrow: 1 }}>
          <EmptyState
            icon={icons.info}
            title="Sección de plataforma"
            message="Esta sección es de la administración de la plataforma. Los comunicados de tu empresa están en el área interna."
            actionLabel="Ir al área interna"
            onAction={() => router.replace('/internal')}
          />
        </Screen>
      </>
    );
  }

  if (isPending) {
    return (
      <>
        <Stack.Screen options={{ title: 'Plataforma' }} />
        <Screen scrollable>
          {header}
          <LoadingState label="Cargando comunicados" skeletonCount={3} />
        </Screen>
      </>
    );
  }

  if (isError) {
    return (
      <>
        <Stack.Screen options={{ title: 'Plataforma' }} />
        <Screen scrollable contentContainerStyle={{ flexGrow: 1 }}>
          {header}
          <ErrorState error={error} onRetry={() => void query.refetch()} />
        </Screen>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Plataforma' }} />
      <Screen padded={false}>
        <FlatList
          data={data?.items ?? []}
          keyExtractor={(item) => String(item.id)}
          ListHeaderComponent={header}
          renderItem={({ item }) => {
            const state = describeAnnouncementStatus(item.status);
            return (
              <Card variant="outlined">
                <View style={{ gap: theme.spacing.xs }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: theme.spacing.sm,
                    }}
                  >
                    <Text variant="headline" style={{ flex: 1 }}>
                      {item.title}
                    </Text>
                    <StatusBadge
                      label={state.label}
                      tone={state.tone}
                      size="small"
                      accessibilityPrefix="Estado del comunicado"
                    />
                  </View>
                  <Text variant="caption" color="textTertiary">
                    {item.publishedAt
                      ? `Publicado el ${formatDate(item.publishedAt)} · ${item.recipientCount} destinatarios`
                      : `Creado el ${formatDate(item.createdAt)}`}
                  </Text>
                  <Text variant="caption" color="textTertiary">
                    {item.author || 'sin autor registrado'}
                  </Text>
                </View>
              </Card>
            );
          }}
          ItemSeparatorComponent={() => <View style={{ height: theme.spacing.sm }} />}
          ListEmptyComponent={
            <EmptyState
              icon={icons.info}
              title="Sin comunicados de plataforma"
              message="No hay comunicados en este estado. Se redactan desde la consola web."
            />
          }
          contentContainerStyle={{
            paddingHorizontal: screenGutter,
            paddingBottom: theme.spacing.xxl,
            flexGrow: 1,
          }}
          onRefresh={onRefresh}
          refreshing={refreshing}
          showsVerticalScrollIndicator={false}
        />
      </Screen>
    </>
  );
}
