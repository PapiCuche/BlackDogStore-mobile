import { zodResolver } from '@hookform/resolvers/zod';
import { router, Stack } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { AppState, View } from 'react-native';

import { useCart } from '@/cart/cart-provider';
import { Button, Card, EmptyState, icons, Input, Screen, Text } from '@/design-system';
import {
  PrivateActionPrompt,
  usePrivateActionState,
} from '@/features/auth/private-action-gate';
import { useCheckout } from '@/features/checkout/use-checkout';
import { useOrder } from '@/hooks/use-orders';
import { useTheme } from '@/theme/theme-provider';
import { openExternalLink } from '@/utils/external-links';
import { formatCurrency } from '@/utils/format';
import { checkoutSchema, type CheckoutFormValues } from '@/validation/checkout-schemas';

/**
 * Payment.
 *
 * THIS is where DEC-MOBILE-006 bites: everything up to here was public, and the
 * session is asked for now, at the moment money moves and the person can see
 * why.
 *
 * THE PAYMENT PAGE IS HOSTED BY STRIPE. No card field exists in this app, and
 * none should: card data never touching the client is the entire reason the
 * hosted page exists. The app opens an HTTPS URL the server minted and waits.
 *
 * "THE BROWSER CAME BACK" IS NOT A PAYMENT. Returning to the foreground proves
 * only that the user closed a tab. The order's real state comes from the server,
 * which learns it from Stripe's webhook — so on return the app REFETCHES the
 * order and believes that, and the basket survives anything short of a
 * confirmed payment.
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
    const result = await submit({
      customerName: values.customerName,
      customerPhone: values.customerPhone,
      documentType: 'dni',
      documentNumber: values.documentNumber,
      deliveryMethod: 'pickup_store',
      receiptType: 'boleta',
      acceptedTerms: true,
      acceptedWarrantyPolicy: true,
    });
    // `checkoutUrl` is validated as an HTTPS Stripe URL before it gets here; a
    // null one means the session expired and the order status is the answer.
    if (result?.checkoutUrl) await openExternalLink(result.checkoutUrl);
  });

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

          <Card variant="outlined">
            <View style={{ gap: theme.spacing.xs }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="headline">Subtotal estimado</Text>
                <Text variant="headline">{formatCurrency(totals.estimatedSubtotal)}</Text>
              </View>
              <Text variant="footnote" color="textTertiary">
                El total definitivo lo calcula la tienda al procesar el pago.
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
 * because the app cannot know whether a payment succeeded — only Stripe's
 * webhook can tell the server, and only the server can tell us.
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
