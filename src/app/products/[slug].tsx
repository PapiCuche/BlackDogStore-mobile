import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Icon,
  icons,
  LoadingState,
  Screen,
  Text,
} from '@/design-system';
import { useCart } from '@/cart/cart-provider';
import { useStorefrontConfig } from '@/hooks/use-storefront-config';
import { productAvailability } from '@/domain/products/types';
import { openExternalLink } from '@/utils/external-links';
import { hapticSuccess } from '@/utils/haptics';
import { MockDataNotice } from '@/features/home/mock-data-notice';
import { useMockData } from '@/config/env';
import { useProduct } from '@/hooks/use-catalog';
import { FeatureUnavailableError } from '@/repositories/errors';
import { useTheme } from '@/theme/theme-provider';
import { formatCurrency } from '@/utils/format';

/**
 * Product detail.
 *
 * M5 — this can finally BUY. Adding to the basket needs no session
 * (DEC-MOBILE-006): browsing and choosing are public, and the login is asked
 * for at the moment of payment, not at the door.
 *
 * The basket is local intent (DEC-MOBILE-009). The price shown here is what the
 * catalogue reported; the server recomputes every figure at checkout, so a
 * price that moved between browsing and paying is caught there rather than
 * honoured from a stale local copy.
 */
export default function ProductDetailScreen() {
  const theme = useTheme();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { data: product, isPending, isError, error, refetch } = useProduct(slug);
  // Hooks first, unconditionally: the early returns below would otherwise change
  // the hook order between renders.
  const { add, tenantSlug } = useCart();
  const { whatsappLink } = useStorefrontConfig();
  const canAddToCart = tenantSlug !== null;

  if (isPending) {
    return (
      <Screen scrollable>
        <LoadingState label="Cargando producto" />
      </Screen>
    );
  }

  // FEATURE UNAVAILABLE — the app has no catalogue at all in this build.
  if (error instanceof FeatureUnavailableError) {
    return (
      <>
        <Stack.Screen options={{ title: 'Tienda' }} />
        <Screen scrollable contentContainerStyle={{ flexGrow: 1 }}>
          <ErrorState error={error} title="Catálogo no disponible todavía" />
        </Screen>
      </>
    );
  }

  if (isError) {
    return (
      <Screen scrollable contentContainerStyle={{ flexGrow: 1 }}>
        <ErrorState error={error} onRetry={() => void refetch()} />
      </Screen>
    );
  }

  // NOT FOUND — there IS a catalogue; this particular product is not in it.
  if (!product) {
    return (
      <Screen contentContainerStyle={{ flexGrow: 1 }}>
        <EmptyState
          icon={icons.search}
          title="Producto no encontrado"
          message="Es posible que ya no esté disponible en el catálogo."
        />
      </Screen>
    );
  }

  const availability = productAvailability(product);
  const isOutOfStock = availability === 'out_of_stock';

  return (
    <>
      <Stack.Screen options={{ title: product.category?.name ?? 'Producto' }} />

      <Screen scrollable>
        <View style={{ gap: theme.spacing.lg, paddingTop: theme.spacing.sm }}>
          <View
            style={{
              width: '100%',
              aspectRatio: 1,
              borderRadius: theme.radius.xl,
              backgroundColor: theme.colors.surfaceSubtle,
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            {product.imageUrl ? (
              <Image
                source={{ uri: product.imageUrl }}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
                transition={200}
                accessible
                accessibilityLabel={product.name}
              />
            ) : (
              <Icon name={icons.shop} size={64} color={theme.colors.textTertiary} />
            )}
          </View>

          <View style={{ gap: theme.spacing.xs }}>
            {product.category ? <Badge label={product.category.name} uppercase /> : null}

            <Text variant="title1" accessibilityRole="header">
              {product.name}
            </Text>

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'baseline',
                gap: theme.spacing.sm,
                flexWrap: 'wrap',
              }}
            >
              <Text variant="display">{formatCurrency(product.price)}</Text>

              <Text
                variant="subhead"
                style={{
                  fontWeight: '600',
                  color: isOutOfStock ? theme.colors.textTertiary : theme.colors.statusSuccess,
                }}
              >
                {isOutOfStock
                  ? 'Agotado'
                  : availability === 'low_stock'
                    ? `Últimas ${product.inventory} unidades`
                    : 'Disponible'}
              </Text>
            </View>

            {product.averageRating !== null ? (
              <Text
                variant="footnote"
                color="textSecondary"
                accessibilityLabel={`Calificación ${product.averageRating} de 5, basada en ${product.reviewCount} reseñas`}
              >
                ★ {product.averageRating} · {product.reviewCount}{' '}
                {product.reviewCount === 1 ? 'reseña' : 'reseñas'}
              </Text>
            ) : null}
          </View>

          {product.description ? (
            <Card variant="outlined">
              <Text variant="callout" color="textSecondary">
                {product.description}
              </Text>
            </Card>
          ) : null}

          <Button
            label={isOutOfStock ? 'Sin stock' : 'Agregar al carrito'}
            variant="primary"
            fullWidth
            disabled={isOutOfStock || !canAddToCart}
            onPress={() => {
              add(product);
              hapticSuccess();
              router.push('/cart');
            }}
            accessibilityHint="Agrega este producto a tu carrito"
          />

          {/* BR-006 CLOSED. The link is the tenant's own, published by the
              server — never the pilot's number hardcoded into every build. It
              is only rendered when that tenant actually published one. */}
          {whatsappLink ? (
            <Button
              label="Consultar por WhatsApp"
              variant="secondary"
              fullWidth
              onPress={() => void openExternalLink(whatsappLink)}
              accessibilityHint="Abre WhatsApp con la tienda"
            />
          ) : null}

          {useMockData ? (
            <MockDataNotice message="Producto de ejemplo. No es una compra real." />
          ) : null}
        </View>
      </Screen>
    </>
  );
}
