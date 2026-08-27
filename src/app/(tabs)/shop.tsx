import { router } from 'expo-router';
import { useDeferredValue, useState } from 'react';
import { FlatList, View } from 'react-native';

import {
  AppHeader,
  EmptyState,
  ErrorState,
  icons,
  LoadingState,
  Screen,
  SearchInput,
} from '@/design-system';
import { CategoryChips } from '@/features/catalog/category-chips';
import { ProductCard } from '@/features/catalog/product-card';
import { MockDataNotice } from '@/features/home/mock-data-notice';
import { useMockData } from '@/config/env';
import { useCategories, useProducts } from '@/hooks/use-catalog';
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
 */
export default function ShopScreen() {
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const [categorySlug, setCategorySlug] = useState<string | null>(null);

  const deferredSearch = useDeferredValue(search);

  const categoriesQuery = useCategories();
  const productsQuery = useProducts({
    search: deferredSearch.trim() || undefined,
    categorySlug: categorySlug ?? undefined,
  });

  const hasFilters = search.trim().length > 0 || categorySlug !== null;

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

      {useMockData ? (
        <View style={{ marginTop: theme.spacing.xxs, marginBottom: theme.spacing.xs }}>
          <MockDataNotice message="Datos de ejemplo. Los endpoints de catálogo existen, pero resuelven la empresa por dominio web." />
        </View>
      ) : null}
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
        onRefresh={() => void productsQuery.refetch()}
        refreshing={productsQuery.isRefetching}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  );
}
