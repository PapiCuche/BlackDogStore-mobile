import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, View } from 'react-native';

import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  icons,
  LoadingState,
  Screen,
  SearchInput,
  StatusBadge,
  Text,
} from '@/design-system';
import { CAP_INVENTORY_VIEW } from '@/domain/internal/inventory-types';
import { hasUxCapability } from '@/domain/internal/types';
import { parseBranchParam } from '@/features/internal/branch-scope';
import { useInventoryStock } from '@/hooks/use-internal-inventory';
import { useInternalContext } from '@/hooks/use-internal-sales';
import { useTheme } from '@/theme/theme-provider';

type Filter = 'all' | 'low' | 'out';

/**
 * Current stock, one row per product AND BRANCH.
 *
 * Every row names its shop even when a single branch is selected. A quantity
 * without a place is the mistake `Product.inventory` used to encode, and a
 * screen that dropped the branch name would be re-encoding it in the UI.
 *
 * The low-stock flag comes from the server: it owns the threshold and each
 * product's minimum. Recomputing it here would drift the day either changes.
 */
export default function InventoryStockScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ branch?: string }>();
  const branchId = parseBranchParam(params.branch);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const { data: context, isPending: contextPending } = useInternalContext();
  const mayView = hasUxCapability(context ?? null, CAP_INVENTORY_VIEW);

  const query = useInventoryStock(
    {
      branchId: branchId ?? undefined,
      search: search.trim() || undefined,
      lowStock: filter === 'low' || undefined,
      outOfStock: filter === 'out' || undefined,
    },
    { enabled: mayView },
  );
  const { data, isPending, isError, error } = query;

  const title = 'Stock';

  if (contextPending) {
    return (
      <>
        <Stack.Screen options={{ title }} />
        <Screen scrollable>
          <LoadingState label="Cargando stock" skeletonCount={5} />
        </Screen>
      </>
    );
  }

  if (!mayView) {
    return (
      <>
        <Stack.Screen options={{ title }} />
        <Screen scrollable contentContainerStyle={{ flexGrow: 1 }}>
          <EmptyState
            icon={icons.info}
            title="Ya no tienes acceso a este módulo"
            message="Tu cuenta no tiene permiso para ver el inventario de esta empresa."
            actionLabel="Volver al área interna"
            onAction={() => router.replace('/internal')}
          />
        </Screen>
      </>
    );
  }

  if (isError) {
    return (
      <>
        <Stack.Screen options={{ title }} />
        <Screen scrollable contentContainerStyle={{ flexGrow: 1 }}>
          <ErrorState error={error} onRetry={() => void query.refetch()} />
        </Screen>
      </>
    );
  }

  if (isPending) {
    return (
      <>
        <Stack.Screen options={{ title }} />
        <Screen scrollable>
          <LoadingState label="Cargando stock" skeletonCount={5} />
        </Screen>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title }} />
      <Screen padded={false}>
        <FlatList
          data={data.results}
          keyExtractor={(row) => String(row.id)}
          ListHeaderComponent={
            <View style={{ gap: theme.spacing.sm, marginBottom: theme.spacing.md }}>
              <Text variant="footnote" color="textTertiary">
                {data.count} {data.count === 1 ? 'registro' : 'registros'}
              </Text>
              <SearchInput
                value={search}
                onChangeText={setSearch}
                placeholder="Buscar producto"
              />
              <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
                <Button
                  label="Todos"
                  size="compact"
                  variant={filter === 'all' ? 'primary' : 'ghost'}
                  onPress={() => setFilter('all')}
                />
                <Button
                  label="Bajo mínimo"
                  size="compact"
                  variant={filter === 'low' ? 'primary' : 'ghost'}
                  onPress={() => setFilter('low')}
                />
                <Button
                  label="Sin stock"
                  size="compact"
                  variant={filter === 'out' ? 'primary' : 'ghost'}
                  onPress={() => setFilter('out')}
                />
              </View>
            </View>
          }
          renderItem={({ item }) => (
            <Card variant="outlined">
              <View style={{ gap: 4 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    gap: theme.spacing.sm,
                  }}
                >
                  <Text variant="headline" style={{ flex: 1 }} numberOfLines={2}>
                    {item.productName}
                  </Text>
                  <Text variant="headline">{item.quantity}</Text>
                </View>
                <Text variant="subhead" color="textSecondary">
                  {item.branchName}
                </Text>
                {item.isOutOfStock ? (
                  <StatusBadge
                    label="Sin stock"
                    tone="danger"
                    size="small"
                    accessibilityPrefix="Estado del stock"
                  />
                ) : item.isLowStock ? (
                  <StatusBadge
                    label={`Bajo mínimo (${item.minimumStock})`}
                    tone="warning"
                    size="small"
                    accessibilityPrefix="Estado del stock"
                  />
                ) : null}
              </View>
            </Card>
          )}
          ItemSeparatorComponent={() => <View style={{ height: theme.spacing.sm }} />}
          contentContainerStyle={{
            padding: theme.spacing.md,
            flexGrow: 1,
          }}
          ListEmptyComponent={
            <EmptyState
              icon={icons.empty}
              title="Sin resultados"
              message={
                filter === 'all'
                  ? 'No hay productos con stock registrado en esta selección.'
                  : 'Ningún producto cumple ese filtro en esta selección.'
              }
            />
          }
          refreshing={query.isFetching}
          onRefresh={() => void query.refetch()}
        />
      </Screen>
    </>
  );
}
