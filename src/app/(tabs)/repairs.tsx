import { router } from 'expo-router';
import { FlatList, View } from 'react-native';

import {
  AppHeader,
  EmptyState,
  ErrorState,
  icons,
  LoadingState,
  Screen,
  StaleDataNotice,
} from '@/design-system';
import { useConnectivity } from '@/connectivity/connectivity-provider';
import { useListRefresh } from '@/hooks/use-list-refresh';
import { MockDataNotice } from '@/features/home/mock-data-notice';
import { RepairCard } from '@/features/repairs/repair-card';
import { useRepairs } from '@/hooks/use-repairs';
import { screenGutter } from '@/theme';
import { useTheme } from '@/theme/theme-provider';

/**
 * The repairs list.
 *
 * All five states are handled: loading (skeletons), error, empty, success and —
 * via `ErrorState`'s offline branch — no connection. That is the point of
 * building the state components first; a screen that only renders the happy
 * path is not finished, it is started.
 *
 * `padded={false}` on the Screen and padding on the list instead, so the scroll
 * indicator sits at the true screen edge rather than inset by the gutter.
 */
export default function RepairsScreen() {
  const theme = useTheme();
  const query = useRepairs();
  const { data, isPending, isError, error } = query;
  const { isOffline } = useConnectivity();
  const hasCachedData = (data?.length ?? 0) > 0;
  const { onRefresh, refreshing } = useListRefresh(query, { enabled: !isError });

  const header = (
    <View>
      <AppHeader
        title="Reparaciones"
        eyebrow="Servicio técnico"
        subtitle="Sigue el estado de los equipos que dejaste en el taller."
      />
      <View style={{ marginBottom: theme.spacing.md, gap: theme.spacing.xs }}>
        {/* Cached data plus no network: keep the data, state the caveat. */}
        {isOffline && hasCachedData ? <StaleDataNotice /> : null}
        <MockDataNotice message="Datos de ejemplo. El backend aún no tiene un módulo de reparaciones." />
      </View>
    </View>
  );

  if (isPending) {
    return (
      <Screen scrollable>
        {header}
        <LoadingState label="Cargando reparaciones" skeletonCount={3} />
      </Screen>
    );
  }

  if (isError) {
    return (
      <Screen scrollable contentContainerStyle={{ flexGrow: 1 }}>
        {header}
        <ErrorState error={error} onRetry={() => void query.refetch()} />
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <FlatList
        data={data}
        keyExtractor={(repair) => repair.id}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <RepairCard repair={item} onPress={() => router.push(`/repairs/${item.id}`)} />
        )}
        ItemSeparatorComponent={() => <View style={{ height: theme.spacing.sm }} />}
        ListEmptyComponent={
          <EmptyState
            icon={icons.repairs}
            title="Sin reparaciones"
            message="Cuando dejes un equipo en el taller aparecerá aquí con su seguimiento."
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
  );
}
