import { router, Stack, useLocalSearchParams } from 'expo-router';
import { FlatList, View } from 'react-native';

import {
  Card,
  EmptyState,
  ErrorState,
  icons,
  LoadingState,
  Screen,
  Text,
} from '@/design-system';
import {
  CAP_INVENTORY_VIEW,
  movementDirection,
} from '@/domain/internal/inventory-types';
import { hasUxCapability } from '@/domain/internal/types';
import { parseBranchParam } from '@/features/internal/branch-scope';
import { useInventoryMovements } from '@/hooks/use-internal-inventory';
import { useInternalContext } from '@/hooks/use-internal-sales';
import { useTheme } from '@/theme/theme-provider';
import { formatDate } from '@/utils/format';

/**
 * The Kardex — every change to stock, newest first.
 *
 * READ-ONLY, and it always will be: a movement is immutable by design on the
 * backend. Correcting a mistake means recording a correction, which is why
 * `correction_positive` and `correction_negative` exist as movement types
 * rather than an edit button existing here.
 *
 * `stockBefore` / `stockAfter` are THIS BRANCH's totals, not the company's.
 */
export default function InventoryMovementsScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ branch?: string; product?: string }>();
  const branchId = parseBranchParam(params.branch);
  const productSlug = typeof params.product === 'string' ? params.product : undefined;

  const { data: context, isPending: contextPending } = useInternalContext();
  const mayView = hasUxCapability(context ?? null, CAP_INVENTORY_VIEW);

  const query = useInventoryMovements(
    { branchId: branchId ?? undefined, productSlug },
    { enabled: mayView },
  );
  const { data, isPending, isError, error } = query;

  const title = 'Movimientos';

  if (contextPending) {
    return (
      <>
        <Stack.Screen options={{ title }} />
        <Screen scrollable>
          <LoadingState label="Cargando movimientos" skeletonCount={5} />
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
          <LoadingState label="Cargando movimientos" skeletonCount={5} />
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
            <Text
              variant="footnote"
              color="textTertiary"
              style={{ marginBottom: theme.spacing.md }}
            >
              {data.count} {data.count === 1 ? 'movimiento' : 'movimientos'}
            </Text>
          }
          renderItem={({ item }) => {
            const direction = movementDirection(item.movementType);
            const sign = direction === 'in' ? '+' : direction === 'out' ? '−' : '';
            return (
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
                    <Text
                      variant="headline"
                      color={direction === 'out' ? 'danger' : 'textPrimary'}
                    >
                      {sign}
                      {item.quantity}
                    </Text>
                  </View>
                  <Text variant="subhead" color="textSecondary">
                    {item.movementTypeLabel} · {item.branchName}
                  </Text>
                  <Text variant="footnote" color="textTertiary">
                    {item.stockBefore} → {item.stockAfter} · {formatDate(item.createdAt)}
                  </Text>
                  {item.reason ? (
                    <Text variant="footnote" color="textSecondary" numberOfLines={3}>
                      {item.reason}
                    </Text>
                  ) : null}
                  {/* A display name. The server never sends the actor's email,
                      and this screen has no business inventing one. */}
                  {item.actorName ? (
                    <Text variant="caption" color="textTertiary">
                      {item.actorName}
                    </Text>
                  ) : null}
                </View>
              </Card>
            );
          }}
          ItemSeparatorComponent={() => <View style={{ height: theme.spacing.sm }} />}
          contentContainerStyle={{ padding: theme.spacing.md, flexGrow: 1 }}
          ListEmptyComponent={
            <EmptyState
              icon={icons.empty}
              title="Sin movimientos"
              message="Todavía no hay movimientos registrados en esta selección."
            />
          }
          refreshing={query.isFetching}
          onRefresh={() => void query.refetch()}
        />
      </Screen>
    </>
  );
}
