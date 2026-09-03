import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';

import {
  Badge,
  Button,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  icons,
  LoadingState,
  Screen,
  Text,
} from '@/design-system';
import {
  CAP_INVENTORY_ADJUST,
  CAP_INVENTORY_VIEW,
} from '@/domain/internal/inventory-types';
import { hasUxCapability } from '@/domain/internal/types';
import { branchLabel, parseBranchParam } from '@/features/internal/branch-scope';
import { useInventorySummary } from '@/hooks/use-internal-inventory';
import { useInternalContext } from '@/hooks/use-internal-sales';
import { useTheme } from '@/theme/theme-provider';
import { formatCurrency } from '@/utils/format';

/**
 * The inventory module's entrance.
 *
 * THE BRANCH IS THE FIRST QUESTION, not a filter added later. Stock only exists
 * in a place; a company-wide number would be an average nobody can act on, and
 * `Product.inventory` — the field that used to be one — has been a compatibility
 * aggregate since the backend's Phase 2D.
 *
 * The picker is drawn from `available_branches` in the SERVER's response, never
 * from a cached list: access to a shop can be withdrawn between two visits, and
 * offering a branch that now 404s would look like a broken app rather than a
 * changed permission.
 */
export default function InventoryHomeScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ branch?: string }>();
  const branchId = parseBranchParam(params.branch);

  const { data: context, isPending: contextPending } = useInternalContext();
  const mayView = hasUxCapability(context ?? null, CAP_INVENTORY_VIEW);
  const mayAdjust = hasUxCapability(context ?? null, CAP_INVENTORY_ADJUST);

  const query = useInventorySummary(branchId, { enabled: mayView });
  const { data, isPending, isError, error } = query;

  const title = 'Inventario';

  if (contextPending) {
    return (
      <>
        <Stack.Screen options={{ title }} />
        <Screen scrollable>
          <LoadingState label="Cargando inventario" skeletonCount={3} />
        </Screen>
      </>
    );
  }

  // Checked BEFORE `isPending`: the summary query is disabled without the
  // capability, so it stays pending forever and a loading spinner would be the
  // last thing this person ever saw.
  if (!mayView) {
    // Reached when the capability was revoked between drawing the tile and
    // opening it. Honest, and not an error: nothing is broken.
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
          <LoadingState label="Cargando inventario" skeletonCount={3} />
        </Screen>
      </>
    );
  }

  const branches = data.availableBranches;

  return (
    <>
      <Stack.Screen options={{ title }} />
      <Screen scrollable>
        <View style={{ gap: theme.spacing.md }}>
          <View style={{ gap: 2 }}>
            <Text variant="overline" color="textTertiary" style={{ textTransform: 'uppercase' }}>
              {context?.company.name ?? 'Inventario'}
            </Text>
            <Text variant="title2" accessibilityRole="header">
              {branchLabel(branchId, branches)}
            </Text>
          </View>

          {/* Only when there is a choice to make. One branch is not a picker. */}
          {branches.length > 1 ? (
            <View style={{ gap: theme.spacing.xs }}>
              <Text variant="footnote" color="textTertiary">
                Sucursal
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: theme.spacing.xs }}
              >
                <Button
                  label="Todas"
                  size="compact"
                  variant={branchId === null ? 'primary' : 'ghost'}
                  onPress={() => router.setParams({ branch: undefined })}
                />
                {branches.map((branch) => (
                  <Button
                    key={branch.id}
                    label={branch.name}
                    size="compact"
                    variant={branchId === branch.id ? 'primary' : 'ghost'}
                    onPress={() => router.setParams({ branch: String(branch.id) })}
                  />
                ))}
              </ScrollView>
            </View>
          ) : null}

          {/* A member with SELECTED access and no grants. A legitimate state of
              the company, not a failed request — so it is said plainly rather
              than shown as an error. */}
          {branches.length === 0 ? (
            <EmptyState
              icon={icons.info}
              title="Sin sucursales asignadas"
              message="Tu cuenta puede ver inventario, pero todavía no tiene ninguna sucursal asignada. Pídeselo a quien administra la empresa."
            />
          ) : (
            <>
              <Card variant="outlined">
                <View style={{ gap: theme.spacing.sm }}>
                  <Metric label="Unidades en stock" value={String(data.totalUnits)} theme={theme} />
                  <Divider />
                  <Metric
                    label="Productos con stock"
                    value={`${data.stockedCount} de ${data.activeProducts}`}
                    theme={theme}
                  />
                  <Divider />
                  <Metric
                    label="Bajo mínimo"
                    value={String(data.lowStockCount)}
                    theme={theme}
                    tone={data.lowStockCount > 0 ? 'warning' : undefined}
                  />
                  <Divider />
                  <Metric
                    label="Sin stock"
                    value={String(data.outOfStockCount)}
                    theme={theme}
                    tone={data.outOfStockCount > 0 ? 'warning' : undefined}
                  />
                </View>
              </Card>

              <Card variant="outlined">
                <View style={{ gap: 4 }}>
                  <Text variant="footnote" color="textTertiary">
                    Valor del inventario
                  </Text>
                  <Text variant="title3">{formatCurrency(data.inventoryValue)}</Text>
                  {/* The basis comes from the server. There is no cost model in
                      the system, so calling this "capital invertido" would be a
                      false name on a real number. */}
                  {data.inventoryValueBasis === 'sale_price' ? (
                    <Text variant="caption" color="textTertiary">
                      Calculado a precio de venta, no a costo.
                    </Text>
                  ) : null}
                </View>
              </Card>

              <Button
                label="Ver stock"
                variant="secondary"
                fullWidth
                onPress={() =>
                  router.push(
                    branchId === null
                      ? '/internal/inventory/stock'
                      : `/internal/inventory/stock?branch=${branchId}`,
                  )
                }
              />
              {/* Transfers read with `inventory.view`, so the entrance is
                  offered to anybody who reached this screen. What they may DO
                  once inside is the server's answer, asked again there. */}
              <Button
                label="Transferencias entre sucursales"
                variant="secondary"
                fullWidth
                onPress={() => router.push('/internal/inventory/transfers')}
              />
              <Button
                label="Ver movimientos"
                variant="secondary"
                fullWidth
                onPress={() =>
                  router.push(
                    branchId === null
                      ? '/internal/inventory/movements'
                      : `/internal/inventory/movements?branch=${branchId}`,
                  )
                }
              />

              {/* Drawn only for `inventory.adjust`. Seeing stock and moving it
                  are two capabilities, and the server treats them as two. */}
              {mayAdjust ? (
                <Button
                  label="Registrar movimiento"
                  fullWidth
                  onPress={() =>
                    router.push(
                      branchId === null
                        ? '/internal/inventory/adjust'
                        : `/internal/inventory/adjust?branch=${branchId}`,
                    )
                  }
                />
              ) : null}
            </>
          )}

          <Button
            label="Volver al área interna"
            variant="ghost"
            fullWidth
            onPress={() => router.replace('/internal')}
          />
        </View>
      </Screen>
    </>
  );
}

function Metric({
  label,
  value,
  theme,
  tone,
}: {
  label: string;
  value: string;
  theme: ReturnType<typeof useTheme>;
  tone?: 'warning';
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: theme.spacing.sm,
      }}
    >
      <Text variant="subhead" color="textSecondary">
        {label}
      </Text>
      {tone === 'warning' ? (
        <Badge label={value} tone="accent" />
      ) : (
        <Text variant="headline">{value}</Text>
      )}
    </View>
  );
}
