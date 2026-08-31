import {
  fetchV1Categories,
  fetchV1ProductBySlug,
  fetchV1Products,
} from '@/api/endpoints/catalog-v1';
import type { Category, Product } from '@/domain/products/types';
import type { CatalogRepository } from '@/repositories/types';

/**
 * The catalogue, backed by the TENANT-SAFE `/api/v1/` contract.
 *
 * M2 — the first real integration. This replaces `LegacyApiCatalogRepository`,
 * which was deleted rather than kept as a fallback: two "temporary" paths to the
 * same data is how the unsafe one survives, and the legacy endpoint returned
 * every company's products.
 *
 * The server resolves the tenant from the path segment and builds every queryset
 * from that company, so there is nothing to filter here — and deliberately no
 * client-side filtering at all. A client that trims someone else's rows out of a
 * response has already received them.
 */
export class V1ApiCatalogRepository implements CatalogRepository {
  async listProducts(
    params: { search?: string; categorySlug?: string } = {},
    signal?: AbortSignal,
  ): Promise<Product[]> {
    return fetchV1Products({ search: params.search, category: params.categorySlug }, signal);
  }

  async listCategories(signal?: AbortSignal): Promise<Category[]> {
    return fetchV1Categories(signal);
  }

  async getProductBySlug(slug: string, signal?: AbortSignal): Promise<Product | null> {
    return fetchV1ProductBySlug(slug, signal);
  }
}
