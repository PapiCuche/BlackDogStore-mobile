import { router } from 'expo-router';
import { useDeferredValue, useState } from 'react';
import { FlatList, View } from 'react-native';

import { useMockData } from '@/config/env';
import {
  AppHeader,
  EmptyState,
  ErrorState,
  icons,
  LoadingState,
  Screen,
  SearchInput,
  StaleDataNotice,
} from '@/design-system';
import { CategoryChips } from '@/features/catalog/category-chips';
import { ProductCard } from '@/features/catalog/product-card';
import { MockDataNotice } from '@/features/home/mock-data-notice';
import { useConnectivity } from '@/connectivity/connectivity-provider';
import { isCatalogAvailable, useCategories, useProducts } from '@/hooks/use-catalog';
import { useListRefresh } from '@/hooks/use-list-refresh';
import { FeatureUnavailableError } from '@/repositories/errors';
import { screenGutter } from '@/theme';
import { useTheme } from '@/theme/theme-provider';

/**
 * The catalogue.
 *
 * Search and category filtering are sent to the repository rather than applied
 * to an in-memory array, because that is what the real endpoint does —
 * `ProductViewSet` filters server-side on `search` and `category`. Filtering
 * locally would work beautifully against six fixtures and then fall over on the
 * first real catalogue.
 *
 * `useDeferredValue` keeps typing responsive: the field updates on every
 * keystroke while the query lags a frame behind, with no debounce timer to tune.
 *
 * M0.2 — THREE outcomes, not two. The screen must tell apart:
 *
 *   UNAVAILABLE  this build has no catalogue source at all
 *   EMPTY        there is a catalogue, and it has nothing to show
 *   NOT FOUND    there is a catalogue, and the filters matched nothing
 *
 * Collapsing the first into the second would tell a shopper "esta tienda no
 * tiene productos" when the truth is that the app cannot reach a safe catalogue
 * yet. That is a statement about the business, and it would be false.
 */
export default function ShopScreen() {
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const [categorySlug, setCategorySlug] = useState<string | null>(null);

  const deferredSearch = useDeferredValue(search);

  const catalogAvailable = isCatalogAvailable();

  const categoriesQuery = useCategories();
  const productsQuery = useProducts({
    search: deferredSearch.trim() || undefined,
    categorySlug: categorySlug ?? undefined,
  });

  const hasFilters = search.trim().length > 0 || categorySlug !== null;
  const isUnavailable = productsQuery.error instanceof FeatureUnavailableError;

  const { isOffline } = useConnectivity();
  const hasCachedProducts = (productsQuery.data?.length ?? 0) > 0;
  const { onRefresh, refreshing } = useListRefresh(productsQuery, {
    enabled: !isUnavailable && catalogAvailable,
  });

  // No catalogue means no searching and no filtering. Leaving a search field on
  // screen invites the shopper to type into something that cannot answer.
  if (isUnavailable || !catalogAvailable) {
    return (
      <Screen scrollable contentContainerStyle={{ flexGrow: 1 }}>
        <AppHeader title="Tienda" eyebrow="Catálogo" />
        <ErrorState
          error={
            productsQuery.error ??
            new FeatureUnavailableError(
              'catalog',
              'Estamos preparando la conexión segura con el catálogo de esta empresa. Vuelve a intentarlo más adelante.',
            )
          }
          title="Catálogo no disponible todavía"
        />
      </Screen>
    );
  }

  const header = (
    <View style={{ gap: theme.spacing.sm }}>
      <AppHeader title="Tienda" eyebrow="Catálogo" />

      <SearchInput value={search} onChangeText={setSearch} />

      {categoriesQuery.data && categoriesQuery.data.length > 0 ? (
        <CategoryChips
          categories={categoriesQuery.data}
          selectedSlug={categorySlug}
          onSelect={setCategorySlug}
        />
      ) : null}

      <View style={{ marginTop: theme.spacing.xxs, marginBottom: theme.spacing.xs, gap: theme.spacing.xs }}>
        {isOffline && hasCachedProducts ? <StaleDataNotice /> : null}
        {useMockData ? (
          <MockDataNotice message="Datos de ejemplo. El catálogo real todavía no está integrado." />
        ) : null}
      </View>
    </View>
  );

  return (
    <Screen padded={false}>
      <FlatList
        data={productsQuery.data}
        keyExtractor={(product) => String(product.id)}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <ProductCard product={item} onPress={() => router.push(`/products/${item.slug}`)} />
        )}
        ItemSeparatorComponent={() => <View style={{ height: theme.spacing.sm }} />}
        ListEmptyComponent={
          productsQuery.isPending ? (
            <LoadingState label="Cargando productos" skeletonCount={4} />
          ) : productsQuery.isError ? (
            <ErrorState error={productsQuery.error} onRetry={() => void productsQuery.refetch()} />
          ) : (
            <EmptyState
              icon={icons.search}
              title={hasFilters ? 'Sin resultados' : 'Catálogo vacío'}
              message={
                hasFilters
                  ? 'Prueba con otro término de búsqueda o quita los filtros.'
                  : 'Todavía no hay productos publicados para esta tienda.'
              }
              actionLabel={hasFilters ? 'Quitar filtros' : undefined}
              onAction={
                hasFilters
                  ? () => {
                      setSearch('');
                      setCategorySlug(null);
                    }
                  : undefined
              }
            />
          )
        }
        contentContainerStyle={{
          paddingHorizontal: screenGutter,
          paddingBottom: theme.spacing.xxl,
          flexGrow: 1,
        }}
        onRefresh={onRefresh}
        refreshing={refreshing}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  );
}
