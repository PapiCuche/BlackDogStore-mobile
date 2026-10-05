import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { FlatList, View } from 'react-native';

import {
  AppHeader,
  Button,
  EmptyState,
  ErrorState,
  icons,
  LoadingState,
  Screen,
  StaleDataNotice,
} from '@/design-system';
import { useConnectivity } from '@/connectivity/connectivity-provider';
import { NotificationCard } from '@/features/notifications/notification-card';
import { useInternalContext } from '@/hooks/use-internal-sales';
import { useListRefresh } from '@/hooks/use-list-refresh';
import {
  useInternalNotifications,
  useMarkAllInternalNotificationsRead,
  useMarkInternalNotificationRead,
} from '@/hooks/use-internal-notifications';
import { screenGutter } from '@/theme';
import { useTheme } from '@/theme/theme-provider';

/**
 * The staff inbox — M12B, internal audience.
 *
 * SEPARATE FROM THE CUSTOMER ONE all the way down: different endpoint,
 * different repository, different cache namespace, different screen. A single
 * screen that switched audience on a flag would be one bug away from showing a
 * colleague's assignment notice to a buyer.
 *
 * Gated on the internal CONTEXT rather than on a capability, because the
 * server gates it that way: an active membership is the whole requirement, and
 * your own notices are not administrative data about other people.
 *
 * Tapping marks read. It also NAVIGATES, but only for the one target this app
 * has a screen for: `announcement`, whose route re-checks that the message was
 * addressed to this person in this company and answers 404 otherwise. Every
 * other `target_type` still only marks read — a notification carries structured
 * coordinates, never a URL, and opening a destination that cannot re-ask the
 * server would be this screen deciding that a stale notice still grants access.
 */
export default function InternalNotificationsScreen() {
  const theme = useTheme();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const context = useInternalContext();
  const mayRead = context.data !== undefined;

  const query = useInternalNotifications({ unreadOnly }, { enabled: mayRead });
  const { data, isPending, isError, error } = query;
  const markRead = useMarkInternalNotificationRead();
  const markAllRead = useMarkAllInternalNotificationsRead();
  const { isOffline } = useConnectivity();
  const { onRefresh, refreshing } = useListRefresh(query, { enabled: !isError });

  const items = data?.items ?? [];
  const hasUnread = items.some((notification) => notification.readAt === null);

  const header = (
    <View>
      <AppHeader
        title="Avisos"
        eyebrow="Área interna"
        subtitle="Lo que la plataforma te ha comunicado."
      />
      <View style={{ marginBottom: theme.spacing.md, gap: theme.spacing.sm }}>
        {isOffline && items.length > 0 ? <StaleDataNotice /> : null}
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          <Button
            label={unreadOnly ? 'Ver todos' : 'Solo no leídos'}
            variant="secondary"
            size="compact"
            onPress={() => setUnreadOnly((value) => !value)}
          />
          {hasUnread ? (
            <Button
              label="Marcar todo leído"
              variant="ghost"
              size="compact"
              loading={markAllRead.isPending}
              onPress={() => markAllRead.mutate()}
            />
          ) : null}
        </View>
      </View>
    </View>
  );

  if (context.isPending) {
    return (
      <>
        <Stack.Screen options={{ title: 'Avisos' }} />
        <Screen scrollable>
          <LoadingState label="Cargando avisos" skeletonCount={3} />
        </Screen>
      </>
    );
  }

  if (context.isError) {
    return (
      <>
        <Stack.Screen options={{ title: 'Avisos' }} />
        <Screen scrollable contentContainerStyle={{ flexGrow: 1 }}>
          <ErrorState error={context.error} onRetry={() => void context.refetch()} />
        </Screen>
      </>
    );
  }

  if (isPending) {
    return (
      <>
        <Stack.Screen options={{ title: 'Avisos' }} />
        <Screen scrollable>
          {header}
          <LoadingState label="Cargando avisos" skeletonCount={3} />
        </Screen>
      </>
    );
  }

  if (isError) {
    return (
      <>
        <Stack.Screen options={{ title: 'Avisos' }} />
        <Screen scrollable contentContainerStyle={{ flexGrow: 1 }}>
          {header}
          <ErrorState error={error} onRetry={() => void query.refetch()} />
        </Screen>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Avisos' }} />
      <Screen padded={false}>
        <FlatList
          data={items}
          keyExtractor={(notification) => String(notification.id)}
          ListHeaderComponent={header}
          renderItem={({ item }) => (
            <NotificationCard
              notification={item}
              onPress={() => {
                if (item.readAt === null) markRead.mutate(item.id);
                if (item.targetType === 'announcement' && item.targetId !== null) {
                  router.push(`/internal/announcements/${item.targetId}`);
                }
              }}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: theme.spacing.sm }} />}
          ListEmptyComponent={
            <EmptyState
              icon={icons.info}
              title={unreadOnly ? 'Nada sin leer' : 'Sin avisos'}
              message={
                unreadOnly
                  ? 'Ya leíste todo lo que la plataforma te envió.'
                  : 'Aquí aparecerán las asignaciones y los comunicados que te toquen.'
              }
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
