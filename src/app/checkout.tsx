import { zodResolver } from '@hookform/resolvers/zod';
import { router, Stack } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { AppState, View } from 'react-native';

import { useCart } from '@/cart/cart-provider';
import {
  CUSTOMER_PAYMENT_UNAVAILABLE,
  customerPaymentAvailability,
} from '@/config/customer-payment';
import { Button, Card, EmptyState, icons, Input, Screen, Text } from '@/design-system';
import {
  PrivateActionPrompt,
  usePrivateActionState,
} from '@/features/auth/private-action-gate';
import { useCheckout } from '@/features/checkout/use-checkout';
import { useOrder } from '@/hooks/use-orders';
import { useTheme } from '@/theme/theme-provider';
import { formatCurrency } from '@/utils/format';
import {
  checkoutSchema,
  COUPON_CODE_MAX_LENGTH,
  type CheckoutFormValues,
} from '@/validation/checkout-schemas';

/**
 * Payment.
 *
 * THIS is where DEC-MOBILE-006 bites: everything up to here was public, and the
 * session is asked for now, at the moment money moves and the person can see
 * why.
 *
 * PAYING FROM THE APP IS BLOCKED FOR NOW (`config/customer-payment.ts`). The
 * backend's gateway is Izipay and this app has no supported way to open its
 * session yet (BR-010 / H-PAY-01). While that holds the screen says so and sends
 * nothing: no checkout request, no order, no payment attempt. The cart is kept.
 *
 * WHEN IT OPENS AGAIN, TWO RULES STAND. No card field exists in this app: the
 * gateway's own form takes card data. And a callback or a returning browser is
 * not a payment. The order's real state comes from the server, which learns it
 * from the gateway's signed notification, so the app REFETCHES the order and
 * believes that, and the basket survives anything short of a confirmed payment.
 */
export default function CheckoutScreen() {
  const theme = useTheme();
  const access = usePrivateActionState();
  const { cart, totals, clearPurchased } = useCart();
  const { state, submit } = useCheckout();

  const orderId = state.status === 'awaiting-payment' ? state.orderId : undefined;
  const { data: order, refetch } = useOrder(orderId, { enabled: access === 'ready' });

  // Remembered so the basket is emptied exactly once, on the transition to paid.
  const cleared = useRef(false);

  const { control, handleSubmit, formState } = useForm<CheckoutFormValues>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      customerName: '',
      customerPhone: '',
      documentNumber: '',
      couponCode: '',
    },
    mode: 'onTouched',
  });

  // Coming back from the hosted page: ask the SERVER what happened.
  useEffect(() => {
    if (orderId === undefined) return;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refetch();
    });
    return () => subscription.remove();
  }, [orderId, refetch]);

  useEffect(() => {
    if (!order || cleared.current) return;
    if (order.paymentStatus !== 'paid') return;
    // ONLY after the server confirms. Clearing on "the browser closed" would
    // lose a basket for someone who abandoned the payment page.
    cleared.current = true;
    clearPurchased(cart.lines.map((line) => line.productSlug));
  }, [order, cart.lines, clearPurchased]);

  const onSubmit = handleSubmit(async (values) => {
    await submit({
      customerName: values.customerName,
      customerPhone: values.customerPhone,
      documentType: 'dni',
      documentNumber: values.documentNumber,
      deliveryMethod: 'pickup_store',
      receiptType: 'boleta',
      acceptedTerms: true,
      acceptedWarrantyPolicy: true,
      // Omitted when empty, exactly as the endpoint omits every blank optional.
      couponCode: values.couponCode.trim() || undefined,
    });
    // Nothing is opened here. The response's payment session is not read while
    // paying from the app is blocked, and `useCheckout` refuses before sending.
  });

  // Ahead of the session gate on purpose: nobody should be asked to sign in only
  // to be told they cannot pay.
  if (customerPaymentAvailability !== 'available') {
    return (
      <>
        <Stack.Screen options={{ title: 'Pagar' }} />
        <Screen scrollable contentContainerStyle={{ flexGrow: 1 }}>
          <PaymentUnavailable />
        </Screen>
      </>
    );
  }

  if (access !== 'ready' && access !== 'pending') {
    return (
      <>
        <Stack.Screen options={{ title: 'Pagar' }} />
        <Screen scrollable contentContainerStyle={{ flexGrow: 1 }}>
          <PrivateActionPrompt
            state={access}
            message={
              access === 'sign-in-required'
                ? 'Inicia sesión para completar tu compra. Tu carrito se conserva.'
                : undefined
            }
          />
        </Screen>
      </>
    );
  }

  if (cart.lines.length === 0 && state.status === 'idle') {
    return (
      <>
        <Stack.Screen options={{ title: 'Pagar' }} />
        <Screen scrollable contentContainerStyle={{ flexGrow: 1 }}>
          <EmptyState
            icon={icons.cart}
            title="No hay nada que pagar"
            message="Agrega productos a tu carrito para continuar."
            actionLabel="Explorar tienda"
            onAction={() => router.push('/(tabs)/shop')}
          />
        </Screen>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Pagar' }} />
      <Screen scrollable>
        <View style={{ gap: theme.spacing.md }}>
          {order ? <OrderStatusCard order={order} onRetry={() => void refetch()} /> : null}

          <Controller
            control={control}
            name="customerName"
            render={({ field, fieldState }) => (
              <Input
                label="Nombre completo"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
                autoComplete="name"
                returnKeyType="next"
              />
            )}
          />

          <Controller
            control={control}
            name="customerPhone"
            render={({ field, fieldState }) => (
              <Input
                label="Teléfono"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
                keyboardType="phone-pad"
                autoComplete="tel"
                returnKeyType="next"
              />
            )}
          />

          <Controller
            control={control}
            name="documentNumber"
            render={({ field, fieldState }) => (
              <Input
                label="DNI"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
                keyboardType="number-pad"
                returnKeyType="go"
                onSubmitEditing={onSubmit}
              />
            )}
          />

          {/* A COUPON IS INPUT, NOT A RESULT. No v1 route prices a code before
              the purchase, so this field promises nothing: the code travels with
              the checkout, the server decides whether it applies and by how
              much, and a refusal comes back in the server's own words.
              `autoCapitalize` is a keyboard hint; the value is sent as typed. */}
          <Controller
            control={control}
            name="couponCode"
            render={({ field, fieldState }) => (
              <Input
                label="Código de cupón (opcional)"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
                hint="La tienda lo comprueba al iniciar el pago."
                autoCapitalize="characters"
                autoCorrect={false}
                autoComplete="off"
                spellCheck={false}
                maxLength={COUPON_CODE_MAX_LENGTH}
                returnKeyType="go"
                onSubmitEditing={onSubmit}
              />
            )}
          />

          <Card variant="outlined">
            <View style={{ gap: theme.spacing.xs }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="headline">Subtotal estimado</Text>
                <Text variant="headline">{formatCurrency(totals.estimatedSubtotal)}</Text>
              </View>
              <Text variant="footnote" color="textTertiary">
                El total definitivo, con el cupón si corresponde, lo calcula la tienda al
                procesar el pago.
              </Text>
            </View>
          </Card>

          {state.status === 'rejected' ? (
            <Card variant="outlined">
              <View style={{ gap: theme.spacing.xs }}>
                <Text variant="headline">{state.message}</Text>
                {state.reasons.map((reason) => (
                  <Text key={reason} variant="subhead" color="textSecondary">
                    {reason}
                  </Text>
                ))}
                <Button
                  label="Volver al carrito"
                  variant="secondary"
                  onPress={() => router.push('/cart')}
                />
              </View>
            </Card>
          ) : null}

          {state.status === 'conflict' || state.status === 'error' ? (
            <Card variant="outlined">
              <Text variant="subhead" color="textSecondary">
                {state.message}
              </Text>
            </Card>
          ) : null}

          <Button
            label="Continuar al pago"
            variant="primary"
            fullWidth
            loading={state.status === 'submitting'}
            disabled={formState.isSubmitting || state.status === 'submitting'}
            onPress={onSubmit}
            accessibilityHint="Abre la página segura de pago"
          />
        </View>
      </Screen>
    </>
  );
}

/**
 * What the SERVER says about this order.
 *
 * Rendered from the refetched order rather than from anything the app assumed,
 * because the app cannot know whether a payment succeeded: only the gateway's
 * signed notification can tell the server, and only the server can tell us.
 */
function OrderStatusCard({
  order,
  onRetry,
}: {
  order: { id: number; paymentStatusLabel: string; fulfillmentStatusLabel: string; paymentStatus: string };
  onRetry: () => void;
}) {
  const paid = order.paymentStatus === 'paid';
  return (
    <Card variant="outlined">
      <View style={{ gap: 6 }}>
        <Text variant="headline">
          {paid ? '¡Pago confirmado!' : `Pedido #${order.id} en proceso`}
        </Text>
        <Text variant="subhead" color="textSecondary">
          Pago: {order.paymentStatusLabel || order.paymentStatus}
        </Text>
        {order.fulfillmentStatusLabel ? (
          <Text variant="subhead" color="textSecondary">
            Entrega: {order.fulfillmentStatusLabel}
          </Text>
        ) : null}
        {paid ? (
          <Button label="Ver mis pedidos" variant="secondary" onPress={() => router.push('/(tabs)/orders')} />
        ) : (
          <Button label="Actualizar estado" variant="ghost" onPress={onRetry} />
        )}
      </View>
    </Card>
  );
}

/**
 * Paying from the app is blocked. Said once, plainly, with the ways back.
 *
 * No form, no "Continuar al pago" and no order card: this screen has created
 * nothing and must not look as if it had. No gateway, SDK or ticket name
 * either: those explain the pause to us, not to a customer.
 */
function PaymentUnavailable() {
  const theme = useTheme();
  return (
    <Card variant="outlined">
      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="headline">{CUSTOMER_PAYMENT_UNAVAILABLE.title}</Text>
        <Text variant="subhead" color="textSecondary">
          {CUSTOMER_PAYMENT_UNAVAILABLE.checkout}
        </Text>
        <Button
          label="Volver al carrito"
          variant="primary"
          fullWidth
          onPress={() => router.push('/cart')}
        />
        <Button
          label="Explorar tienda"
          variant="secondary"
          fullWidth
          onPress={() => router.push('/(tabs)/shop')}
        />
      </View>
    </Card>
  );
}
