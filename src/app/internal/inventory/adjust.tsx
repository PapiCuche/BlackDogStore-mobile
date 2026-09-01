import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';

import { inventoryErrorMessage } from '@/api/endpoints/internal-inventory-v1';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  icons,
  Input,
  LoadingState,
  Screen,
  SearchInput,
  Text,
} from '@/design-system';
import {
  CAP_INVENTORY_ADJUST,
  MANUAL_MOVEMENT_TYPES,
  type ManualMovementType,
} from '@/domain/internal/inventory-types';
import { hasUxCapability } from '@/domain/internal/types';
import { parseBranchParam } from '@/features/internal/branch-scope';
import { useAdjustStock, useInventoryStock } from '@/hooks/use-internal-inventory';
import { useInternalContext } from '@/hooks/use-internal-sales';
import { useTheme } from '@/theme/theme-provider';

/**
 * Record a manual entry or exit.
 *
 * THE FORM SENDS AN INTENTION, NEVER A RESULT. There is no "nuevo stock" field
 * here and there is no field for one in the contract: a final quantity typed on
 * a phone is a claim about a number a colleague may be changing at the same
 * moment. The app sends what MOVED; the server owns the arithmetic, under a row
 * lock, and returns the resulting total.
 *
 * The product is chosen from the stock the server already returned, so its slug
 * and its branch always exist together and always belong to this member. Typing
 * a slug by hand would be an invitation to guess at other people's shops.
 *
 * The movement types offered mirror `StockMovement.MANUAL_TYPES`. The server
 * rejects anything else regardless — `sale_exit` belongs to the payment
 * pipeline, and a hand-written transfer would be stock that vanished.
 */
export default function InventoryAdjustScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ branch?: string }>();
  const branchId = parseBranchParam(params.branch);

  const { data: context, isPending: contextPending } = useInternalContext();
  const mayAdjust = hasUxCapability(context ?? null, CAP_INVENTORY_ADJUST);

  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<{
    productSlug: string;
    productName: string;
    branchId: number;
    branchName: string;
    quantity: number;
  } | null>(null);
  const [movementType, setMovementType] = useState<ManualMovementType>('manual_entry');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const stock = useInventoryStock(
    { branchId: branchId ?? undefined, search: search.trim() || undefined },
    { enabled: mayAdjust && selected === null },
  );
  const adjust = useAdjustStock();

  const quantityError = useMemo(() => {
    if (!submitted) return undefined;
    const parsed = Number(quantity);
    if (!Number.isInteger(parsed) || parsed < 1) return 'Indica una cantidad entera mayor que cero.';
    return undefined;
  }, [quantity, submitted]);

  const reasonError = submitted && reason.trim().length === 0
    ? 'El motivo queda en el Kardex. Escribe uno.'
    : undefined;

  const title = 'Registrar movimiento';

  if (contextPending) {
    return (
      <>
        <Stack.Screen options={{ title }} />
        <Screen scrollable>
          <LoadingState label="Cargando" skeletonCount={3} />
        </Screen>
      </>
    );
  }

  if (!mayAdjust) {
    return (
      <>
        <Stack.Screen options={{ title }} />
        <Screen scrollable contentContainerStyle={{ flexGrow: 1 }}>
          <EmptyState
            icon={icons.info}
            title="No puedes registrar movimientos"
            message="Tu cuenta puede ver el inventario, pero no moverlo."
            actionLabel="Volver al inventario"
            onAction={() => router.replace('/internal/inventory')}
          />
        </Screen>
      </>
    );
  }

  // ── Step 1: choose the product AND the branch, together ──────────────────
  if (selected === null) {
    return (
      <>
        <Stack.Screen options={{ title }} />
        <Screen scrollable>
          <View style={{ gap: theme.spacing.md }}>
            <Text variant="subhead" color="textSecondary">
              Elige el producto y la sucursal donde ocurrió el movimiento.
            </Text>
            <SearchInput
              value={search}
              onChangeText={setSearch}
              placeholder="Buscar producto"
            />

            {stock.isError ? (
              <ErrorState error={stock.error} onRetry={() => void stock.refetch()} />
            ) : stock.isPending ? (
              <LoadingState label="Buscando productos" skeletonCount={4} />
            ) : stock.data.results.length === 0 ? (
              <EmptyState
                icon={icons.empty}
                title="Sin resultados"
                message="Ningún producto con stock registrado coincide con esa búsqueda."
              />
            ) : (
              stock.data.results.map((row) => (
                <Card
                  key={row.id}
                  variant="outlined"
                  onPress={() =>
                    setSelected({
                      productSlug: row.productSlug,
                      productName: row.productName,
                      branchId: row.branchId,
                      branchName: row.branchName,
                      quantity: row.quantity,
                    })
                  }
                >
                  <View style={{ gap: 2 }}>
                    <Text variant="headline" numberOfLines={2}>
                      {row.productName}
                    </Text>
                    <Text variant="subhead" color="textSecondary">
                      {row.branchName} · {row.quantity} en stock
                    </Text>
                  </View>
                </Card>
              ))
            )}

            <Button
              label="Cancelar"
              variant="ghost"
              fullWidth
              onPress={() => router.back()}
            />
          </View>
        </Screen>
      </>
    );
  }

  // ── Step 2: what moved ───────────────────────────────────────────────────
  const submit = () => {
    setSubmitted(true);
    const parsed = Number(quantity);
    if (!Number.isInteger(parsed) || parsed < 1) return;
    if (reason.trim().length === 0) return;

    adjust.mutate(
      {
        productSlug: selected.productSlug,
        branchId: selected.branchId,
        movementType,
        quantity: parsed,
        reason: reason.trim(),
      },
      {
        onSuccess: (movement) => {
          Alert.alert(
            'Movimiento registrado',
            `${movement.productName} en ${movement.branchName}: ${movement.stockBefore} → ${movement.stockAfter}.`,
          );
          router.back();
        },
        // Deliberately no `onError` toast here: the message is rendered inline
        // below, where the person is already looking, and a rejected movement
        // is a normal business answer rather than a crash.
      },
    );
  };

  return (
    <>
      <Stack.Screen options={{ title }} />
      <Screen scrollable>
        <View style={{ gap: theme.spacing.md }}>
          <Card variant="outlined">
            <View style={{ gap: 2 }}>
              <Text variant="headline">{selected.productName}</Text>
              <Text variant="subhead" color="textSecondary">
                {selected.branchName} · {selected.quantity} en stock
              </Text>
              <Button
                label="Cambiar producto"
                variant="ghost"
                size="compact"
                onPress={() => setSelected(null)}
              />
            </View>
          </Card>

          <View style={{ gap: theme.spacing.xs }}>
            <Text variant="footnote" color="textTertiary">
              Tipo de movimiento
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: theme.spacing.xs }}
            >
              {MANUAL_MOVEMENT_TYPES.map((type) => (
                <Button
                  key={type.value}
                  label={type.label}
                  size="compact"
                  variant={movementType === type.value ? 'primary' : 'ghost'}
                  onPress={() => setMovementType(type.value)}
                />
              ))}
            </ScrollView>
          </View>

          <Input
            label="Cantidad"
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="number-pad"
            error={quantityError}
            hint="Siempre positiva. El tipo de movimiento decide si suma o resta."
          />

          <Input
            label="Motivo"
            value={reason}
            onChangeText={setReason}
            multiline
            error={reasonError}
            hint="Queda registrado en el Kardex junto a tu nombre."
          />

          {adjust.isError ? (
            <Card variant="outlined">
              <Text variant="subhead" color="danger">
                {inventoryErrorMessage(adjust.error)}
              </Text>
            </Card>
          ) : null}

          <Button
            label="Registrar movimiento"
            fullWidth
            loading={adjust.isPending}
            onPress={submit}
          />
          <Button label="Cancelar" variant="ghost" fullWidth onPress={() => router.back()} />
        </View>
      </Screen>
    </>
  );
}
