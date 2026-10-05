import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { FlatList, View } from 'react-native';

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
  CAP_COMMUNICATIONS_MANAGE,
  describeAnnouncementStatus,
  type AnnouncementStatus,
} from '@/domain/internal/announcement-types';
import { hasUxCapability } from '@/domain/internal/types';
import { useAnnouncements } from '@/hooks/use-internal-communications';
import { useInternalContext } from '@/hooks/use-internal-sales';
import { useListRefresh } from '@/hooks/use-list-refresh';
import { screenGutter } from '@/theme';
import { useTheme } from '@/theme/theme-provider';
import { formatDate } from '@/utils/format';

/**
 * What this company has told its own people — M12C, read side.
 *
 * `communications.manage` gates the whole screen, because this is the SENDER's
 * view: it lists drafts and discarded messages, which are nobody else's
 * business. Reading a message addressed to you lives at
 * `/internal/announcements/<id>` and asks for no capability at all.
 *
 * COMPOSING IS NOT HERE. Writing a communiqué means choosing an audience out of
 * branches, roles, capabilities and named people, and publishing freezes that
 * choice into one notification row per recipient. That editor belongs on the
 * console; this screen is for seeing what went out and how far it got.
 */
export default function CommunicationsScreen() {
  const theme = useTheme();
  const [status, setStatus] = useState<AnnouncementStatus | undefined>(undefined);
  const { data: context, isPending: contextPending } = useInternalContext();
  const mayManage = hasUxCapability(context ?? null, CAP_COMMUNICATIONS_MANAGE);

  const query = useAnnouncements({ status }, { enabled: mayManage });
  const { data, isPending, isError, error } = query;
  const { onRefresh, refreshing } = useListRefresh(query, { enabled: !isError });

  const header = (
    <View>
      <AppHeader
        title="Comunicados"
        eyebrow="Área interna"
        subtitle="Lo que la empresa ha comunicado a su personal."
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

  if (contextPending) {
    return (
      <>
        <Stack.Screen options={{ title: 'Comunicados' }} />
        <Screen scrollable>
          <LoadingState label="Cargando comunicados" skeletonCount={3} />
        </Screen>
      </>
    );
  }

  // The capability is the server's answer, and the server will refuse anyway.
  // Saying so plainly beats an empty list that reads as "nothing was ever sent".
  if (!mayManage) {
    return (
      <>
        <Stack.Screen options={{ title: 'Comunicados' }} />
        <Screen scrollable contentContainerStyle={{ flexGrow: 1 }}>
          {header}
          <EmptyState
            icon={icons.info}
            title="No administras comunicados"
            message="Esta sección es para quien redacta y envía los comunicados de la empresa. Los que te envían a ti llegan a tus avisos."
            actionLabel="Ver mis avisos"
            onAction={() => router.push('/internal/notifications')}
          />
        </Screen>
      </>
    );
  }

  if (isPending) {
    return (
      <>
        <Stack.Screen options={{ title: 'Comunicados' }} />
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
        <Stack.Screen options={{ title: 'Comunicados' }} />
        <Screen scrollable contentContainerStyle={{ flexGrow: 1 }}>
          {header}
          <ErrorState error={error} onRetry={() => void query.refetch()} />
        </Screen>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Comunicados' }} />
      <Screen padded={false}>
        <FlatList
          data={data?.items ?? []}
          keyExtractor={(item) => String(item.id)}
          ListHeaderComponent={header}
          renderItem={({ item }) => {
            const state = describeAnnouncementStatus(item.status);
            return (
              <Card
                variant="outlined"
                onPress={() => router.push(`/internal/communications/${item.id}`)}
                accessibilityLabel={item.title}
                accessibilityHint="Abre el comunicado"
              >
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
              title="Sin comunicados"
              message="Todavía no hay comunicados en este estado. Se redactan desde la consola web."
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
