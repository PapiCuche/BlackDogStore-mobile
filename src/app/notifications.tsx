import { Stack } from 'expo-router';
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
import {
  PrivateActionPrompt,
  usePrivateActionState,
} from '@/features/auth/private-action-gate';
import { NotificationCard } from '@/features/notifications/notification-card';
import { useListRefresh } from '@/hooks/use-list-refresh';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from '@/hooks/use-notifications';
import { screenGutter } from '@/theme';
import { useTheme } from '@/theme/theme-provider';

/**
 * The customer's own inbox — M12B.
 *
 * PRIVATE, like orders and repairs: the gate comes before any query state,
 * because a disabled query leaves `isPending` true forever and an anonymous
 * visitor would watch a spinner that never resolves.
 *
 * Tapping a notice marks it read and nothing else. A notification carries
 * `target_type`/`target_id`, never a URL, and routing on it would mean this
 * screen deciding that a stale notice still opens its destination — the
 * destination re-checks authority, so navigation waits until each target has a
 * screen that asks the server again.
 *
 * The filter is the SERVER's `unread` parameter, not a local predicate: the
 * page is twenty rows out of however many exist, and filtering in hand would
 * show "ningún aviso sin leer" to somebody whose unread ones are on page two.
 */
export default function NotificationsScreen() {
  const theme = useTheme();
  const access = usePrivateActionState();
  const [unreadOnly, setUnreadOnly] = useState(false);

  const query = useNotifications({ unreadOnly }, { enabled: access === 'ready' });
  const { data, isPending, isError, error } = query;
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const { isOffline } = useConnectivity();
  const { onRefresh, refreshing } = useListRefresh(query, { enabled: !isError });

  const items = data?.items ?? [];
  const hasUnread = items.some((notification) => notification.readAt === null);

  const header = (
    <View>
      <AppHeader
        title="Avisos"
        eyebrow="Tu cuenta"
        subtitle="Lo que la tienda te ha comunicado."
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

  if (access !== 'ready' && access !== 'pending') {
    return (
      <>
        <Stack.Screen options={{ title: 'Avisos' }} />
        <Screen scrollable contentContainerStyle={{ flexGrow: 1 }}>
          {header}
          <PrivateActionPrompt state={access} />
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
              onPress={
                item.readAt === null ? () => markRead.mutate(item.id) : undefined
              }
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: theme.spacing.sm }} />}
          ListEmptyComponent={
            <EmptyState
              icon={icons.info}
              title={unreadOnly ? 'Nada sin leer' : 'Aún no tienes avisos'}
              message={
                unreadOnly
                  ? 'Ya leíste todo lo que la tienda te envió.'
                  : 'Aquí aparecerán los avisos sobre tus pedidos y reparaciones.'
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
