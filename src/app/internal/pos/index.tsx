import { Stack } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, View } from 'react-native';

import { posErrorMessage } from '@/api/endpoints/internal-pos-v1';
import {
  Button,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  icons,
  Input,
  LoadingState,
  Screen,
  SearchInput,
  SectionHeader,
  StatusBadge,
  Text,
} from '@/design-system';
import { makeIdempotencyKey } from '@/domain/idempotency';
import {
  CAP_SALES_POS_USE,
  type PosCartLine,
  type PosProduct,
} from '@/domain/internal/pos-types';
import { hasUxCapability } from '@/domain/internal/types';
import {
  useCreatePosSale,
  usePosContext,
  usePosProductSearch,
} from '@/hooks/use-internal-pos';
import { useInternalContext } from '@/hooks/use-internal-sales';
import { useTheme } from '@/theme/theme-provider';

/**
 * The counter till. IP1A.
 *
 * THIS SCREEN SELLS NOTHING BY ITSELF. It collects an intention — which shop,
 * which articles, how many, how it is being paid — and the server prices it,
 * applies whatever promotion is running, checks the shelf, takes the cash and
 * writes the sale. `pos_services.create_pos_sale`, the same function the Web
 * till calls.
 *
 * NO TOTAL IS COMPUTED HERE. Not for display, not "just to show a running
 * subtotal". A number added up on a phone can disagree with the till, and the
 * one that disagrees is the one a customer is being asked to pay. The screen
 * asks `preview/` for the figure, and shows what came back.
 *
 * THE BASKET IS LOCAL INTENTION, and it is not a cart. It shares no store with
 * the customer shop, persists nowhere, reserves nothing and survives no
 * restart. Somebody who walks away from the counter has abandoned a list, not
 * an order.
 *
 * NO OFFLINE QUEUE. A sale that left a phone hours later, against a shelf that
 * has moved and a price that may have changed, is not the sale anybody made.
 */
export default function PosScreen() {
  const theme = useTheme();
  const { data: internal } = useInternalContext();
  const mayUse = hasUxCapability(internal ?? null, CAP_SALES_POS_USE);

  const context = usePosContext({ enabled: mayUse });
  const [branchId, setBranchId] = useState<number | null>(null);
  const [term, setTerm] = useState('');
  const [lines, setLines] = useState<PosCartLine[]>([]);
  const [cash, setCash] = useState('');
  const [method, setMethod] = useState<string>('cash');

  // Held in a ref, NOT in render state: a retry must resend the SAME key, and a
  // key that changed on re-render would be no key at all — which on this screen
  // means charging somebody twice.
  const keys = useRef(new Map<string, string>());

  // The branch the server chose, until somebody picks another. `defaultBranch`
  // is NULL when the server refused to pick — several shops and no authorised
  // default — and then the screen asks rather than guessing.
  const branch = branchId ?? context.data?.defaultBranch ?? null;

  const search = usePosProductSearch(branch, term, { enabled: mayUse });
  const sale = useCreatePosSale();

  const canSell = mayUse && branch !== null && lines.length > 0;

  function keyFor(): string {
    const shape = `${branch}:${lines
      .map((l) => `${l.product.id}x${l.quantity}`)
      .sort()
      .join(',')}:${method}:${cash.trim()}`;
    const existing = keys.current.get(shape);
    if (existing) return existing;
    // 8–64 printable characters, no spaces. The server REFUSES a short key
    // rather than padding it, so the generator's own length is the contract.
    const minted = makeIdempotencyKey(shape);
    keys.current.set(shape, minted);
    return minted;
  }

  function add(product: PosProduct) {
    setLines((current) => {
      const found = current.find((l) => l.product.id === product.id);
      if (found) {
        return current.map((l) =>
          l.product.id === product.id ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [...current, { product, quantity: 1 }];
    });
    setTerm('');
  }

  function setQuantity(productId: number, quantity: number) {
    setLines((current) =>
      quantity <= 0
        ? current.filter((l) => l.product.id !== productId)
        : current.map((l) =>
            l.product.id === productId ? { ...l, quantity } : l,
          ),
    );
  }

  function confirm() {
    if (branch === null) return;
    Alert.alert(
      'Cobrar',
      'El servidor calculará el total, aplicará las promociones vigentes y '
      + 'descontará el stock. Confirma que informaste las condiciones de venta.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar y cobrar',
          onPress: () =>
            sale.mutate(
              {
                branch,
                items: lines.map((l) => ({
                  product: l.product.id,
                  quantity: l.quantity,
                })),
                paymentMethod: method,
                amountReceived: cash.trim() || undefined,
                idempotencyKey: keyFor(),
                // Asserted by the operator, never inferred. Handing the article
                // over proves nothing was explained.
                termsConfirmed: true,
              },
              {
                onSuccess: (result) => {
                  setLines([]);
                  setCash('');
                  keys.current.clear();
                  Alert.alert(
                    result.created ? 'Venta registrada' : 'Esta venta ya estaba registrada',
                    `Total ${result.total} · vuelto ${result.changeAmount ?? '—'}`,
                  );
                },
                onError: (error) => {
                  Alert.alert('No se pudo cobrar', posErrorMessage(error));
                },
              },
            ),
        },
      ],
    );
  }

  const title = 'Punto de venta';

  if (!mayUse) {
    return (
      <>
        <Stack.Screen options={{ title }} />
        <Screen scrollable contentContainerStyle={{ flexGrow: 1 }}>
          <EmptyState
            icon={icons.info}
            title="Sin acceso a la caja"
            message="Tu cuenta no tiene permiso para vender en esta empresa."
          />
        </Screen>
      </>
    );
  }

  if (context.isPending) {
    return (
      <>
        <Stack.Screen options={{ title }} />
        <Screen scrollable>
          <LoadingState label="Abriendo la caja" skeletonCount={3} />
        </Screen>
      </>
    );
  }

  if (context.isError) {
    return (
      <>
        <Stack.Screen options={{ title }} />
        <Screen scrollable contentContainerStyle={{ flexGrow: 1 }}>
          <ErrorState error={context.error} onRetry={() => void context.refetch()} />
        </Screen>
      </>
    );
  }

  const ctx = context.data!;

  return (
    <>
      <Stack.Screen options={{ title }} />
      <Screen scrollable>
        <View style={{ gap: theme.spacing.lg }}>
          {/* The shops the SERVER says this person may sell from. Never derived
              here, and never "the first one" — selling from the wrong shop
              moves real units off a real shelf. */}
          <View>
            <SectionHeader title="Sucursal" />
            <Card variant="outlined">
              {branch === null ? (
                <Text variant="subhead" color="textSecondary">
                  Elige la sucursal desde la que vas a vender.
                </Text>
              ) : null}
              <View
                style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}
              >
                {ctx.branches.map((b) => (
                  <Button
                    key={b.id}
                    label={b.name}
                    variant={branch === b.id ? 'primary' : 'secondary'}
                    onPress={() => {
                      setBranchId(b.id);
                      // A basket priced in one shop means nothing in another.
                      setLines([]);
                      keys.current.clear();
                    }}
                    disabled={sale.isPending}
                  />
                ))}
              </View>
            </Card>
          </View>

          {branch !== null ? (
            <View>
              <SectionHeader title="Buscar" />
              <SearchInput
                value={term}
                onChangeText={setTerm}
                placeholder="Nombre o código de barras"
              />
              {search.isFetching ? (
                <Text variant="footnote" color="textTertiary">Buscando…</Text>
              ) : null}
              {(search.data ?? []).map((product) => (
                <Card key={product.id} variant="outlined">
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: theme.spacing.sm,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text variant="subhead">{product.name}</Text>
                      <Text variant="caption" color="textTertiary">
                        {/* The server's price and the server's count, printed. */}
                        {product.price} · {product.available} en esta sucursal
                      </Text>
                    </View>
                    <Button
                      label="Agregar"
                      onPress={() => add(product)}
                      disabled={sale.isPending}
                    />
                  </View>
                </Card>
              ))}
            </View>
          ) : null}

          {lines.length > 0 ? (
            <View>
              <SectionHeader title="Venta" />
              <Card variant="outlined">
                {lines.map((line) => (
                  <View key={line.product.id} style={{ gap: theme.spacing.xs }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: theme.spacing.sm,
                      }}
                    >
                      <Text variant="subhead" style={{ flex: 1 }}>
                        {line.product.name}
                      </Text>
                      <Text variant="caption" color="textTertiary">
                        {line.product.price} c/u
                      </Text>
                    </View>
                    <View
                      style={{ flexDirection: 'row', gap: theme.spacing.xs }}
                    >
                      <Button
                        label="−"
                        variant="secondary"
                        onPress={() => setQuantity(line.product.id, line.quantity - 1)}
                        disabled={sale.isPending}
                      />
                      <Text variant="headline">{line.quantity}</Text>
                      <Button
                        label="+"
                        variant="secondary"
                        onPress={() => setQuantity(line.product.id, line.quantity + 1)}
                        disabled={sale.isPending}
                      />
                    </View>
                    <Divider />
                  </View>
                ))}
                {/* NO TOTAL HERE, and its absence is the point: the only figure
                    this app shows is one the server sent. */}
                <Text variant="caption" color="textTertiary">
                  El total lo calcula el servidor al cobrar, con las promociones
                  vigentes.
                </Text>
              </Card>
            </View>
          ) : null}

          {lines.length > 0 ? (
            <View>
              <SectionHeader title="Pago" />
              <Card variant="outlined">
                <View
                  style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}
                >
                  {/* Whatever the server said a counter may pick. `online`
                      never arrives — it belongs to the storefront. */}
                  {ctx.paymentMethods.map((m) => (
                    <Button
                      key={m.value}
                      label={m.label}
                      variant={method === m.value ? 'primary' : 'secondary'}
                      onPress={() => setMethod(m.value)}
                      disabled={sale.isPending}
                    />
                  ))}
                </View>
                {method === 'cash' ? (
                  <Input
                    label="Efectivo recibido"
                    value={cash}
                    onChangeText={setCash}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                  />
                ) : null}
                <Divider />
                <Button
                  label="Cobrar"
                  onPress={confirm}
                  disabled={!canSell || sale.isPending}
                />
                {sale.isError ? (
                  <Text variant="footnote" color="danger">
                    {posErrorMessage(sale.error)}
                  </Text>
                ) : null}
              </Card>
            </View>
          ) : null}

          {ctx.canApplyDiscount || ctx.canAssignSeller ? (
            <Card variant="outlined">
              <StatusBadge label="Disponible en la Web" tone="info" />
              <Text variant="caption" color="textTertiary">
                {/* Honest rather than silent: the permissions exist and this
                    screen does not use them yet. Saying so beats a control that
                    is missing for no visible reason. */}
                Tu cuenta puede
                {ctx.canApplyDiscount ? ' aplicar descuentos' : ''}
                {ctx.canApplyDiscount && ctx.canAssignSeller ? ' y' : ''}
                {ctx.canAssignSeller ? ' asignar vendedor' : ''}
                . Esta pantalla todavía no lo ofrece; hazlo desde la consola Web.
              </Text>
            </Card>
          ) : null}
        </View>
      </Screen>
    </>
  );
}
