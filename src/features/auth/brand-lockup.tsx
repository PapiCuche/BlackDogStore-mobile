import { Image } from 'expo-image';
import { View } from 'react-native';

import { Text } from '@/design-system';
import type { CompanyBrand } from '@/domain/company/types';
import { useAppTheme } from '@/theme/theme-provider';

/**
 * The company logo and tagline.
 *
 * The pilot logo is BLACK ARTWORK ON A TRANSPARENT BACKGROUND — the real asset
 * from the Web repository, unmodified, as the brand rules require ("No
 * modificar la forma del logo"). Black ink is invisible on a dark page, so dark
 * mode tints it white via `expo-image`'s `tintColor`. That is a colourway, not
 * a change to the mark, and it is exactly the "versiones cromáticas aprobadas
 * del logo para fondo claro y oscuro" the brand document asks for.
 *
 * `brand.logoUrl` takes precedence when the backend starts serving one
 * (BR-006); a remote logo is assumed to already be theme-correct and is not
 * tinted.
 */
export function BrandLockup({
  brand,
  size = 'md',
  showTagline = true,
}: {
  brand: CompanyBrand;
  size?: 'sm' | 'md';
  showTagline?: boolean;
}) {
  const { theme, scheme } = useAppTheme();
  const height = size === 'sm' ? 40 : 68;

  return (
    <View style={{ alignItems: 'center', gap: theme.spacing.xs }}>
      <Image
        source={
          brand.logoUrl
            ? { uri: brand.logoUrl }
            : require('@/assets/brand/blackdog-logo.png')
        }
        style={{ width: height * 1.6, height }}
        contentFit="contain"
        tintColor={!brand.logoUrl && scheme === 'dark' ? theme.colors.textPrimary : undefined}
        accessible
        accessibilityRole="image"
        accessibilityLabel={brand.name}
      />

      {showTagline ? (
        <Text variant="footnote" color="textSecondary" center>
          {brand.tagline}
        </Text>
      ) : null}
    </View>
  );
}
