import { Image } from 'expo-image';
import { router, Stack } from 'expo-router';
import { View } from 'react-native';

import { useCart } from '@/cart/cart-provider';
import {
  Button,
  Card,
  Divider,
  EmptyState,
  icons,
  IconButton,
  LoadingState,
  Screen,
  Text,
} from '@/design-system';
import { radius } from '@/theme';
import { useTheme } from '@/theme/theme-provider';
import { formatCurrency } from '@/utils/format';

/**
 * The basket.
 *
 * PUBLIC. No session is needed to look at it, change it or empty it
 * (DEC-MOBILE-006). The login is asked for one screen later, when the money
 * moves.
 *
 * EVERY FIGURE HERE IS AN ESTIMATE, and the screen says so. Prices come from
 * what the catalogue reported when each line was added; the server recomputes
 * all of it at checkout. Presenting a local number as the price would be the
 * app making a promise the shop has not made (DEC-MOBILE-009).
 */
export default function CartScreen() {
  const theme = useTheme();
  const { cart, totals, isReady, setQuantity, remove } = useCart();

  if (!isReady) {
    return (
      <>
        <Stack.Screen options={{ title: 'Carrito' }} />
        <Screen scrollable>
          <LoadingState label="Cargando carrito" skeletonCount={2} />
        </Screen>
      </>
    );
  }

  if (cart.lines.length === 0) {
    return (
      <>
        <Stack.Screen options={{ title: 'Carrito' }} />
        <Screen scrollable contentContainerStyle={{ flexGrow: 1 }}>
          <EmptyState
            icon={icons.shop}
            title="Tu carrito está vacío"
            message="Agrega productos desde la tienda y aparecerán aquí."
            actionLabel="Explorar tienda"
            onAction={() => router.push('/(tabs)/shop')}
          />
        </Screen>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Carrito' }} />
      <Screen scrollable>
        <View style={{ gap: theme.spacing.md }}>
          {cart.lines.map((line) => (
            <Card key={line.productSlug} variant="outlined">
              <View style={{ flexDirection: 'row', gap: theme.spacing.md, alignItems: 'center' }}>
                {line.imageUrl ? (
                  <Image
                    source={{ uri: line.imageUrl }}
                    style={{ width: 64, height: 64, borderRadius: radius.md }}
                    contentFit="cover"
                    transition={150}
                  />
                ) : null}

                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="headline" numberOfLines={2}>
                    {line.name || line.productSlug}
                  </Text>
                  <Text variant="subhead" color="textSecondary">
                    {formatCurrency(line.lastSeenPrice)} c/u
                  </Text>
                </View>

                <View style={{ alignItems: 'center', gap: theme.spacing.xs }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                    <IconButton
                      icon={icons.minus}
                      accessibilityLabel={`Quitar uno de ${line.name || line.productSlug}`}
                      onPress={() => setQuantity(line.productSlug, line.quantity - 1)}
                    />
                    <Text variant="headline" accessibilityLabel={`Cantidad ${line.quantity}`}>
                      {line.quantity}
                    </Text>
                    <IconButton
                      icon={icons.plus}
                      accessibilityLabel={`Agregar uno de ${line.name || line.productSlug}`}
                      onPress={() => setQuantity(line.productSlug, line.quantity + 1)}
                    />
                  </View>
                  <IconButton
                    icon={icons.trash}
                    accessibilityLabel={`Eliminar ${line.name || line.productSlug}`}
                    onPress={() => remove(line.productSlug)}
                  />
                </View>
              </View>
            </Card>
          ))}

          <Divider />

          <View style={{ gap: theme.spacing.xs }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="headline">Subtotal estimado</Text>
              <Text variant="headline">{formatCurrency(totals.estimatedSubtotal)}</Text>
            </View>
            {/* Not fine print for its own sake: the server prices the order, and
                a customer who sees a different total at payment deserves to have
                been told it could happen. */}
            <Text variant="footnote" color="textTertiary">
              El total definitivo, con descuentos y envío, se calcula al pagar.
            </Text>
          </View>

          <Button
            label="Ir a pagar"
            variant="primary"
            fullWidth
            onPress={() => router.push('/checkout')}
            accessibilityHint="Continúa al pago"
          />
        </View>
      </Screen>
    </>
  );
}
