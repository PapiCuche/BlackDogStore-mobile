import { Stack } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, View } from 'react-native';

import {
  PosInsufficientStockError,
  posErrorMessage,
} from '@/api/endpoints/internal-pos-v1';
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
  conditionsSignature,
  type PosConditions,
} from '@/features/internal/pos-conditions';
import {
  useCreatePosSale,
  usePosContext,
  usePosPreview,
  usePosProductSearch,
} from '@/hooks/use-internal-pos';
import { useInternalContext } from '@/hooks/use-internal-sales';
import { useTheme } from '@/theme/theme-provider';

/**
 * The counter till. IP1A, completed in IP2A.
 *
 * THIS SCREEN SELLS NOTHING BY ITSELF. It collects an intention — which shop,
 * which articles, how many, which conditions, how it is paid — and the server
 * prices it, applies whatever promotion is running, checks the shelf, takes the
 * cash and writes the sale. `pos_services.create_pos_sale`, the same function
 * the Web till calls.
 *
 * NO TOTAL IS COMPUTED HERE. Not for display, not "just a running subtotal". A
 * number added up on a phone can disagree with the till, and the one that
 * disagrees is the one a customer is being asked to pay. Every figure on this
 * screen arrived in a response.
 *
 * NOTHING IS CHARGED THAT WAS NOT PRICED FIRST — the addition IP2A makes. The
 * charge button appears only once `preview/` has answered for THESE conditions,
 * and it disappears the moment any of them change. A stale total is worse than
 * no total: it is a number the operator read aloud and the server never agreed
 * to. What the preview does NOT do is authorise: the sale recomputes from
 * scratch, and if the answer moved, the screen shows the server's, not its own.
 *
 * THE BASKET IS LOCAL INTENTION, and it is not a cart. It shares no store with
 * the customer shop, persists nowhere, reserves nothing, survives no restart.
 * Somebody who walks away from the counter abandoned a list, not an order.
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

  // The conditions that change what the basket COSTS. Every one of them blanks
  // the priced total when it moves — see `pos-conditions.ts`.
  const [coupon, setCoupon] = useState('');
  const [discountType, setDiscountType] = useState<'' | 'percent' | 'amount'>('');
  const [discountValue, setDiscountValue] = useState('');
  const [discountReason, setDiscountReason] = useState('');
  const [seller, setSeller] = useState<number | null>(null);

  // Held in a ref, NOT in render state: a retry must resend the SAME key, and a
  // key that changed on re-render would be no key at all — which on this screen
  // means charging somebody twice.
  const keys = useRef(new Map<string, string>());

  // The signature the figure on screen was priced under. Null means nothing has
  // been priced, which is also the state after any condition changes.
  const [pricedUnder, setPricedUnder] = useState<string | null>(null);

  const branch = branchId ?? context.data?.defaultBranch ?? null;

  const search = usePosProductSearch(branch, term, { enabled: mayUse });
  const preview = usePosPreview();
  const sale = useCreatePosSale();

  const conditions: PosConditions = {
    branch,
    lines,
    couponCode: coupon,
    manualDiscountType: discountType,
    manualDiscountValue: discountValue,
    discountReason,
    seller,
  };
  const signature = conditionsSignature(conditions);
  const priced = pricedUnder === signature ? preview.data ?? null : null;

  const canPrice = mayUse && branch !== null && lines.length > 0;
  const canSell = canPrice && priced !== null;

  /** Anything that moves the price invalidates the figure on screen. */
  function repriceNeeded() {
    setPricedUnder(null);
  }

  function keyFor(): string {
    const shape = `${signature}:${method}:${cash.trim()}`;
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
    repriceNeeded();
  }

  function setQuantity(productId: number, quantity: number) {
    setLines((current) =>
      quantity <= 0
        ? current.filter((l) => l.product.id !== productId)
        : current.map((l) =>
            l.product.id === productId ? { ...l, quantity } : l,
          ),
    );
    repriceNeeded();
  }

  function clearAfterSale() {
    setLines([]);
    setCash('');
    setCoupon('');
    setDiscountType('');
    setDiscountValue('');
    setDiscountReason('');
    setSeller(null);
    setPricedUnder(null);
    keys.current.clear();
  }

  function price() {
    if (branch === null) return;
    const taken = signature;
    preview.mutate(
      {
        branch,
        items: lines.map((l) => ({ product: l.product.id, quantity: l.quantity })),
        paymentMethod: method,
        couponCode: coupon.trim() || undefined,
        seller: seller ?? undefined,
        manualDiscountType: discountType || undefined,
        manualDiscountValue: discountValue.trim() || undefined,
        discountReason: discountReason.trim() || undefined,
      },
      {
        // Stamped with the signature the request was BUILT from, not the one
        // live when it returns. Somebody who edits the basket while the request
        // is in flight must not be handed the older basket's total.
        onSuccess: () => setPricedUnder(taken),
        onError: () => setPricedUnder(null),
      },
    );
  }

  function confirm() {
    if (branch === null || priced === null) return;
    Alert.alert(
      'Cobrar',
      `Total ${priced.total}. El servidor vuelve a calcularlo al cobrar y `
      + 'descuenta el stock. Confirma que informaste las condiciones de venta.',
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
                couponCode: coupon.trim() || undefined,
                seller: seller ?? undefined,
                manualDiscountType: discountType || undefined,
                manualDiscountValue: discountValue.trim() || undefined,
                discountReason: discountReason.trim() || undefined,
                idempotencyKey: keyFor(),
                // NO price, NO subtotal, NO total, NO commission, NO promotion
                // result. A till is TOLD what to charge; it is never asked, and
                // sending back the preview's total would turn a figure this app
                // is merely displaying into a figure it is asserting.
                termsConfirmed: true,
              },
              {
                onSuccess: (result) => {
                  clearAfterSale();
                  Alert.alert(
                    result.created
                      ? 'Venta registrada'
                      : 'Esta venta ya estaba registrada',
                    // The FINAL figures, from the sale. If the shelf or a
                    // promotion moved between pricing and charging, this is the
                    // number that happened.
                    `Total ${result.total} · vuelto ${result.changeAmount ?? '—'}`,
                  );
                },
                onError: (error) => {
                  Alert.alert('No se pudo cobrar', saleFailureMessage(error));
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
  const busy = preview.isPending || sale.isPending;

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
                      repriceNeeded();
                    }}
                    disabled={busy}
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
                      disabled={busy}
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
                    <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
                      <Button
                        label="−"
                        variant="secondary"
                        onPress={() => setQuantity(line.product.id, line.quantity - 1)}
                        disabled={busy}
                      />
                      <Text variant="headline">{line.quantity}</Text>
                      <Button
                        label="+"
                        variant="secondary"
                        onPress={() => setQuantity(line.product.id, line.quantity + 1)}
                        disabled={busy}
                      />
                    </View>
                    <Divider />
                  </View>
                ))}
              </Card>
            </View>
          ) : null}

          {lines.length > 0 ? (
            <View>
              <SectionHeader title="Condiciones" />
              <Card variant="outlined">
                {/* A COUPON NEEDS NO PERMISSION, and that is the server's
                    decision, not a gap here: the company configured the
                    promotion in advance, so honouring it is not something the
                    cashier is deciding. */}
                <Input
                  label="Código promocional"
                  value={coupon}
                  onChangeText={(value) => { setCoupon(value); repriceNeeded(); }}
                  autoCapitalize="characters"
                  placeholder="Opcional"
                />

                {/* A MANUAL DISCOUNT IS A DECISION, so it needs the authority to
                    make it and a reason recorded next to it. Drawn only when
                    the server said this account may; the server refuses it
                    again anyway, and would 403 a control offered by mistake. */}
                {ctx.canApplyDiscount ? (
                  <>
                    <Divider />
                    <Text variant="footnote" color="textSecondary">
                      Descuento manual
                    </Text>
                    <View
                      style={{ flexDirection: 'row', gap: theme.spacing.xs }}
                    >
                      {([
                        ['', 'Ninguno'],
                        ['percent', '%'],
                        ['amount', 'Monto'],
                      ] as const).map(([value, label]) => (
                        <Button
                          key={label}
                          label={label}
                          variant={discountType === value ? 'primary' : 'secondary'}
                          onPress={() => {
                            setDiscountType(value);
                            if (!value) {
                              setDiscountValue('');
                              setDiscountReason('');
                            }
                            repriceNeeded();
                          }}
                          disabled={busy}
                        />
                      ))}
                    </View>
                    {discountType ? (
                      <>
                        <Input
                          label={discountType === 'percent' ? 'Porcentaje' : 'Monto'}
                          value={discountValue}
                          onChangeText={(value) => {
                            setDiscountValue(value);
                            repriceNeeded();
                          }}
                          keyboardType="decimal-pad"
                          placeholder="0"
                        />
                        {/* Required by the server, so required here. A discount
                            without a recorded reason is a hole in the till that
                            nobody can explain afterwards. */}
                        <Input
                          label="Motivo"
                          value={discountReason}
                          onChangeText={(value) => {
                            setDiscountReason(value);
                            repriceNeeded();
                          }}
                          placeholder="Obligatorio"
                        />
                      </>
                    ) : null}
                  </>
                ) : null}

                {/* Attribution. The list arrives EMPTY for anybody without the
                    capability — a roster of colleagues is staffing information,
                    and somebody who cannot reassign a sale has no reason to
                    hold one. */}
                {ctx.canAssignSeller && ctx.sellers.length > 0 ? (
                  <>
                    <Divider />
                    <Text variant="footnote" color="textSecondary">Vendedor</Text>
                    <View
                      style={{
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        gap: theme.spacing.xs,
                      }}
                    >
                      <Button
                        label={ctx.seller.name || 'Yo'}
                        variant={seller === null ? 'primary' : 'secondary'}
                        onPress={() => { setSeller(null); repriceNeeded(); }}
                        disabled={busy}
                      />
                      {ctx.sellers.map((s) => (
                        <Button
                          key={s.id}
                          label={s.name}
                          variant={seller === s.id ? 'primary' : 'secondary'}
                          onPress={() => { setSeller(s.id); repriceNeeded(); }}
                          disabled={busy}
                        />
                      ))}
                    </View>
                  </>
                ) : null}
              </Card>
            </View>
          ) : null}

          {lines.length > 0 ? (
            <View>
              <SectionHeader title="Total" />
              <Card variant="outlined">
                {priced === null ? (
                  <>
                    <Text variant="subhead" color="textSecondary">
                      {preview.isPending
                        ? 'Calculando…'
                        : 'Pide el total antes de cobrar.'}
                    </Text>
                    {preview.isError ? (
                      <Text variant="footnote" color="danger">
                        {/* The server's own words. A promotion that will not
                            stack with a coupon says so here, and this app must
                            not paraphrase a policy it does not own. */}
                        {posErrorMessage(preview.error)}
                      </Text>
                    ) : null}
                    <Button
                      label="Calcular total"
                      fullWidth
                      onPress={price}
                      disabled={!canPrice || busy}
                    />
                  </>
                ) : (
                  <>
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                      }}
                    >
                      <Text variant="subhead" color="textSecondary">Subtotal</Text>
                      <Text variant="subhead">{priced.subtotal}</Text>
                    </View>

                    {/* Promotions the SERVER applied on its own, named so the
                        counter can explain the reduction instead of showing a
                        figure that dropped for no visible reason. This app
                        neither chooses nor computes them. */}
                    {priced.promotions.map((promo) => (
                      <View
                        key={promo.id}
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          gap: theme.spacing.sm,
                        }}
                      >
                        <Text variant="caption" color="textTertiary" style={{ flex: 1 }}>
                          {promo.name}
                          {promo.applications > 1 ? ` ×${promo.applications}` : ''}
                        </Text>
                        <Text variant="caption" color="textTertiary">
                          −{promo.discountAmount}
                        </Text>
                      </View>
                    ))}

                    {priced.discountSource !== 'none' ? (
                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                        }}
                      >
                        <Text variant="caption" color="textTertiary">
                          {priced.discountSource === 'coupon'
                            ? `Cupón ${priced.couponCode}`
                            : 'Descuento manual'}
                        </Text>
                        <Text variant="caption" color="textTertiary">
                          −{priced.discount}
                        </Text>
                      </View>
                    ) : null}

                    <Divider />
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                      }}
                    >
                      <Text variant="headline">Total</Text>
                      <Text variant="headline">{priced.total}</Text>
                    </View>

                    {priced.seller.id !== null ? (
                      <Text variant="caption" color="textTertiary">
                        Vendedor: {priced.seller.name}
                      </Text>
                    ) : null}

                    {/* Shown ONLY because the payload carried it. The server
                        sends null to anybody without `sales.commissions.view`,
                        so its absence is the permission working — never
                        something to infer from a role name. */}
                    {priced.commission ? (
                      <Text variant="caption" color="textTertiary">
                        Comisión {priced.commission.ratePercent}% ·{' '}
                        {priced.commission.amount}
                      </Text>
                    ) : null}

                    <Text variant="caption" color="textTertiary">
                      Calculado por el servidor. Se vuelve a calcular al cobrar.
                    </Text>
                  </>
                )}
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
                      disabled={busy}
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
                  disabled={!canSell || busy}
                />
                {!canSell && canPrice ? (
                  <Text variant="footnote" color="textTertiary">
                    Calcula el total antes de cobrar.
                  </Text>
                ) : null}
                {sale.isError ? (
                  <Text variant="footnote" color="danger">
                    {saleFailureMessage(sale.error)}
                  </Text>
                ) : null}
              </Card>
            </View>
          ) : null}

          {ctx.canManageCustomers ? (
            <Card variant="outlined">
              <StatusBadge label="Disponible en la Web" tone="info" />
              <Text variant="caption" color="textTertiary">
                {/* Honest rather than silent: the permission exists and this
                    screen does not use it yet. Saying so beats a control that
                    is missing for no visible reason. */}
                Tu cuenta puede registrar clientes. Esta pantalla todavía no lo
                ofrece; hazlo desde la consola Web.
              </Text>
            </Card>
          ) : null}
        </View>
      </Screen>
    </>
  );
}

/**
 * What to put in front of the person who pressed the button.
 *
 * A shelf that ran out is the one refusal with somewhere to go: the server says
 * which other shops still hold the article, and repeating that is the whole
 * difference between "no se pudo cobrar" and a counter that sends the customer
 * two streets over. Carried since IP2A — see `PosInsufficientStockError`.
 */
function saleFailureMessage(error: unknown): string {
  const base = posErrorMessage(error);
  if (error instanceof PosInsufficientStockError && error.availableElsewhere.length > 0) {
    const elsewhere = error.availableElsewhere
      .map((row) => `${row.branchName}: ${row.available}`)
      .join(' · ');
    return `${base}\n\nHay en: ${elsewhere}`;
  }
  return base;
}
