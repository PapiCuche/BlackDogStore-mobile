import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
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
import { productAvailability } from '@/domain/products/types';
import { MockDataNotice } from '@/features/home/mock-data-notice';
import { useMockData } from '@/config/env';
import { useProduct } from '@/hooks/use-catalog';
import { useTheme } from '@/theme/theme-provider';
import { formatCurrency } from '@/utils/format';

/**
 * Product detail.
 *
 * Read-only. There is no "add to cart" button, and that is deliberate: Django's
 * cart is keyed on a `session_key` issued to a browser session, and checkout
 * goes through Stripe Checkout in a web context. Putting a buy button here
 * would be a promise the app cannot keep in M0. Purchasing is an M1+ decision
 * that needs a real contract first.
 */
export default function ProductDetailScreen() {
  const theme = useTheme();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { data: product, isPending, isError, error, refetch } = useProduct(slug);

  if (isPending) {
    return (
      <Screen scrollable>
        <LoadingState label="Cargando producto" />
      </Screen>
    );
  }

  if (isError) {
    return (
      <Screen scrollable contentContainerStyle={{ flexGrow: 1 }}>
        <ErrorState error={error} onRetry={() => void refetch()} />
      </Screen>
    );
  }

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
            label="Consultar por WhatsApp"
            variant="primary"
            fullWidth
            disabled={isOutOfStock}
            onPress={() => {
              // Intentionally inert in M0. Wiring this to the tenant's support
              // channel needs the brand endpoint (BR-006) so it is not the
              // pilot's number hardcoded into every tenant's build.
            }}
            accessibilityHint="Disponible en una próxima versión"
          />

          {useMockData ? (
            <MockDataNotice message="Producto de ejemplo. La compra desde la app aún no está disponible." />
          ) : null}
        </View>
      </Screen>
    </>
  );
}
