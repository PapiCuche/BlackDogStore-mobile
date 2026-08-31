import {
  fetchLegacyCategories,
  fetchLegacyProductBySlug,
  fetchLegacyProducts,
} from '@/api/endpoints/legacy-catalog';
import { assertLegacyCatalogAllowed } from '@/api/legacy-catalog-guard';
import type { Category, Product } from '@/domain/products/types';
import type { CatalogRepository } from '@/repositories/types';

/**
 * The catalogue, backed by the LEGACY Django endpoints.
 *
 * ⚠️  Renamed in M0.2. It used to be called `ApiCatalogRepository`, which read
 * like "the product's official API contract". It is not: it is one specific,
 * pre-SaaS endpoint pair that returns **every company's** products. Calling it
 * `Api…` made it look approved, and that name is exactly how something like
 * this ends up switched on in a release.
 *
 * WHEN THIS MAY RUN — all three must hold (see `resolveLegacyCatalogPolicy`):
 *   1. `appEnvironment === 'development'`
 *   2. mocks are off
 *   3. `EXPO_PUBLIC_ENABLE_LEGACY_CATALOG=true`
 *
 * In staging and production it is refused outright, whatever the flag says.
 *
 * The composition root already withholds this class from a release build. The
 * `assertLegacyCatalogAllowed()` calls below are the second line of defence:
 * one place deciding is one edit away from being wrong, so the rule is
 * re-checked at the boundary that matters — before the network call.
 *
 * This is NOT `/api/v1/`. The tenant-safe contract is a proposal (BR-002,
 * BR-007). When it lands, this class is deleted, not adapted.
 */
export class LegacyApiCatalogRepository implements CatalogRepository {
  async listProducts(
    params: { search?: string; categorySlug?: string } = {},
    signal?: AbortSignal,
  ): Promise<Product[]> {
    assertLegacyCatalogAllowed();
    return fetchLegacyProducts({ search: params.search, category: params.categorySlug }, signal);
  }

  async listCategories(signal?: AbortSignal): Promise<Category[]> {
    assertLegacyCatalogAllowed();
    return fetchLegacyCategories(signal);
  }

  async getProductBySlug(slug: string, signal?: AbortSignal): Promise<Product | null> {
    assertLegacyCatalogAllowed();
    return fetchLegacyProductBySlug(slug, signal);
  }
}
