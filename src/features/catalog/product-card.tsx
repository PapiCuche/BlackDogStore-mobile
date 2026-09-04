import { Image } from 'expo-image';
import { View } from 'react-native';

import { Card, Icon, icons, statusToneColor, Text } from '@/design-system';
import { describeAvailability } from '@/domain/products/availability';
import { productAvailability, type Product } from '@/domain/products/types';
import { useTheme } from '@/theme/theme-provider';
import { formatCurrency } from '@/utils/format';

export type ProductCardProps = {
  product: Product;
  onPress: () => void;
};

/**
 * One product in the catalogue.
 *
 * `image_url` is `blank=True, default=''` in Django, so an empty image is the
 * NORMAL case, not a failure — the placeholder is a first-class branch rather
 * than a broken-image icon.
 */
export function ProductCard({ product, onPress }: ProductCardProps) {
  const theme = useTheme();
  // Label AND tone from the domain, so the list and the detail screen cannot
  // disagree about what "Últimas unidades" means.
  const availability = describeAvailability(product);
  const isOutOfStock = productAvailability(product) === 'out_of_stock';

  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`${product.name}, ${formatCurrency(product.price)}, ${availability.label}`}
      accessibilityHint="Abre el detalle del producto"
    >
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'center' }}>
        <View
          style={{
            width: theme.sizes.thumbnail,
            height: theme.sizes.thumbnail,
            borderRadius: theme.radius.md,
            backgroundColor: theme.colors.surfaceSubtle,
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            opacity: isOutOfStock ? 0.5 : 1,
          }}
        >
          {product.imageUrl ? (
            <Image
              source={{ uri: product.imageUrl }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              transition={150}
              accessible={false}
            />
          ) : (
            <Icon name={icons.shop} size={theme.sizes.iconLg} color={theme.colors.textTertiary} />
          )}
        </View>

        <View style={{ flex: 1, gap: 4 }}>
          {product.category ? (
            <Text variant="overline" color="textTertiary" style={{ textTransform: 'uppercase' }}>
              {product.category.name}
            </Text>
          ) : null}

          <Text variant="callout" numberOfLines={2} style={{ fontWeight: '600' }}>
            {product.name}
          </Text>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: theme.spacing.xs,
            }}
          >
            <Text variant="headline">{formatCurrency(product.price)}</Text>
            <Text
              variant="caption"
              style={{
                color: theme.colors[statusToneColor(availability.tone)],
                fontWeight: '600',
              }}
            >
              {availability.label}
            </Text>
          </View>
        </View>
      </View>
    </Card>
  );
}
