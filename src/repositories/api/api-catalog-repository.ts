import { fetchCategories, fetchProductBySlug, fetchProducts } from '@/api/endpoints/catalog';
import type { Category, Product } from '@/domain/products/types';
import type { CatalogRepository } from '@/repositories/types';

/**
 * Catalogue backed by the real Django endpoints.
 *
 * Both endpoints are VERIFIED to exist and to be public. This implementation is
 * nonetheless NOT the default (see `src/repositories/index.ts`) for one
 * concrete reason: `store.tenancy.resolve_storefront_company` resolves the
 * tenant from the request Host and explicitly refuses the `api`, `app`, `www`
 * and `admin` subdomains. A mobile client calling `api.<domain>` therefore
 * receives an EMPTY catalogue — correctly, by the backend's own design.
 *
 * Turning this on is `EXPO_PUBLIC_USE_MOCK_DATA=false`, which is useful against
 * a local Django where the single-active-company fallback applies. It becomes
 * the default once BR-002 lands.
 */
export class ApiCatalogRepository implements CatalogRepository {
  async listProducts(
    params: { search?: string; categorySlug?: string } = {},
    signal?: AbortSignal,
  ): Promise<Product[]> {
    return fetchProducts({ search: params.search, category: params.categorySlug }, signal);
  }

  async listCategories(signal?: AbortSignal): Promise<Category[]> {
    return fetchCategories(signal);
  }

  async getProductBySlug(slug: string, signal?: AbortSignal): Promise<Product | null> {
    return fetchProductBySlug(slug, signal);
  }
}
