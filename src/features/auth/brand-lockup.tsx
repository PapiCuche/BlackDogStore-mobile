import { Image } from 'expo-image';
import { View } from 'react-native';

import { Skeleton, Text } from '@/design-system';
import type { CompanyBrandState } from '@/domain/company/types';
import { useAppTheme } from '@/theme/theme-provider';

/**
 * The company logo and tagline.
 *
 * M0.1 CHANGE — the bundled pilot logo is gated on the brand SOURCE.
 *
 * It used to render `require('@/assets/brand/blackdog-logo.png')` whenever
 * `brand.logoUrl` was empty, which made the Black Dog mark the universal
 * fallback. In a build for any other tenant that would put one customer's logo
 * inside another customer's app. Now the bundled asset is drawn only when the
 * brand actually came from the pilot fixture; anything else uses the tenant's
 * own `logoUrl`, and a brand we do not have yet renders as a neutral
 * placeholder rather than borrowing someone's identity.
 *
 * The pilot artwork is BLACK INK ON TRANSPARENT — the real asset from the Web
 * repository, unmodified, as the brand rules require ("No modificar la forma
 * del logo"). Black ink is invisible on a dark page, so dark mode tints it
 * white via `expo-image`'s `tintColor`. That is an approved colourway, not a
 * change to the mark. A remote logo is assumed to already be theme-correct and
 * is never tinted.
 */
export function BrandLockup({
  state,
  size = 'md',
  showTagline = true,
}: {
  state: CompanyBrandState;
  size?: 'sm' | 'md';
  showTagline?: boolean;
}) {
  const { theme, scheme } = useAppTheme();
  const height = size === 'sm' ? 40 : 68;

  if (state.status !== 'ready') {
    // Neutral placeholder. Deliberately anonymous: a build whose brand has not
    // resolved must not look like any particular company.
    return (
      <View style={{ alignItems: 'center', gap: theme.spacing.xs }}>
        <Skeleton width={height * 1.6} height={height} radius={theme.radius.md} />
        {showTagline ? <Skeleton width={180} height={12} /> : null}
      </View>
    );
  }

  const { brand, source } = state;
  const isPilotArtwork = source === 'pilot-fixture' && !brand.logoUrl;

  return (
    <View style={{ alignItems: 'center', gap: theme.spacing.xs }}>
      {isPilotArtwork ? (
        <Image
          source={require('@/assets/brand/blackdog-logo.png')}
          style={{ width: height * 1.6, height }}
          contentFit="contain"
          tintColor={scheme === 'dark' ? theme.colors.textPrimary : undefined}
          accessible
          accessibilityRole="image"
          accessibilityLabel={brand.name}
        />
      ) : brand.logoUrl ? (
        <Image
          source={{ uri: brand.logoUrl }}
          style={{ width: height * 1.6, height }}
          contentFit="contain"
          accessible
          accessibilityRole="image"
          accessibilityLabel={brand.name}
        />
      ) : (
        // A tenant with no logo gets its NAME set in the display face. Better
        // than a placeholder graphic, and it is unmistakably theirs.
        <Text variant="title2" center accessibilityRole="header">
          {brand.name}
        </Text>
      )}

      {showTagline && brand.tagline ? (
        <Text variant="footnote" color="textSecondary" center>
          {brand.tagline}
        </Text>
      ) : null}
    </View>
  );
}
