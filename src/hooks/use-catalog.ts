import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/providers/query-client';
import { repositories } from '@/repositories';

/**
 * Catalogue queries.
 *
 * Screens call these; they never touch `repositories` directly. That keeps the
 * query key and the repository call in one place, so a cache invalidation
 * cannot go looking for a key nobody writes.
 */

export function useProducts(params: { search?: string; categorySlug?: string } = {}) {
  return useQuery({
    queryKey: queryKeys.products(params),
    queryFn: ({ signal }) => repositories.catalog.listProducts(params, signal),
  });
}

export function useCategories() {
  return useQuery({
    queryKey: queryKeys.categories(),
    queryFn: ({ signal }) => repositories.catalog.listCategories(signal),
    // Categories change on the order of weeks, not minutes.
    staleTime: 30 * 60_000,
  });
}

export function useProduct(slug: string | undefined) {
  return useQuery({
    queryKey: queryKeys.product(slug ?? ''),
    queryFn: ({ signal }) => repositories.catalog.getProductBySlug(slug!, signal),
    enabled: Boolean(slug),
  });
}
