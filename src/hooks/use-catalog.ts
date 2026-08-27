import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/providers/query-client';
import { repositories } from '@/repositories';
import { featureUnavailable } from '@/repositories/errors';

/**
 * Catalogue queries.
 *
 * Screens call these; they never touch `repositories` directly. That keeps the
 * query key and the repository call in one place, so a cache invalidation
 * cannot go looking for a key nobody writes.
 *
 * M0.2 — `repositories.catalog` can be `null`. That happens whenever this build
 * is not allowed to serve a catalogue: any release build (the legacy endpoint
 * is not tenant-safe), and a development build that has neither mocks nor the
 * explicit legacy opt-in.
 *
 * When it is null the query rejects with a `FeatureUnavailableError` instead of
 * resolving to `[]`. "El catálogo todavía no está disponible" and "esta tienda
 * no tiene productos" are different statements, and showing the second when the
 * first is true tells the customer something false about the business.
 */

/**
 * Customer-facing copy. Deliberately free of BR numbers, endpoint names and
 * tenant jargon — the technical detail belongs in Profile → Estado de
 * integración, not in front of a shopper.
 */
const CATALOG_UNAVAILABLE =
  'Estamos preparando la conexión segura con el catálogo de esta empresa. Vuelve a intentarlo más adelante.';

export function useProducts(params: { search?: string; categorySlug?: string } = {}) {
  const repository = repositories.catalog;
  return useQuery({
    queryKey: queryKeys.products(params),
    queryFn: ({ signal }) =>
      repository
        ? repository.listProducts(params, signal)
        : featureUnavailable('catalog', CATALOG_UNAVAILABLE),
    retry: false,
  });
}

export function useCategories() {
  const repository = repositories.catalog;
  return useQuery({
    queryKey: queryKeys.categories(),
    queryFn: ({ signal }) =>
      repository ? repository.listCategories(signal) : featureUnavailable('catalog', CATALOG_UNAVAILABLE),
    // Categories change on the order of weeks, not minutes.
    staleTime: 30 * 60_000,
    retry: false,
  });
}

export function useProduct(slug: string | undefined) {
  const repository = repositories.catalog;
  return useQuery({
    queryKey: queryKeys.product(slug ?? ''),
    queryFn: ({ signal }) =>
      repository
        ? repository.getProductBySlug(slug!, signal)
        : featureUnavailable('catalog', CATALOG_UNAVAILABLE),
    enabled: Boolean(slug),
    retry: false,
  });
}

/** Whether this build has any catalogue at all. Drives the Shop screen's chrome. */
export function isCatalogAvailable(): boolean {
  return repositories.catalog !== null;
}
