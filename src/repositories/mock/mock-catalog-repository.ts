import type { Category, Product } from '@/domain/products/types';
import type { CatalogRepository } from '@/repositories/types';

import { mockCategories, mockProducts } from './fixtures';
import { simulateLatency } from './latency';

/**
 * Catalogue backed by fixtures.
 *
 * Filtering mirrors what `ProductViewSet.get_queryset` actually does server
 * side — `name__icontains` for search and `category__slug` for the category —
 * so that switching to `LegacyApiCatalogRepository` does not change what the
 * screen shows. A mock that filters more cleverly than the real endpoint is a
 * mock that hides a missing backend feature.
 */
export class MockCatalogRepository implements CatalogRepository {
  private readonly products: readonly Product[];
  private readonly categories: readonly Category[];

  constructor(
    products: readonly Product[] = mockProducts,
    categories: readonly Category[] = mockCategories,
  ) {
    this.products = products;
    this.categories = categories;
  }

  async listProducts(
    params: { search?: string; categorySlug?: string } = {},
    signal?: AbortSignal,
  ): Promise<Product[]> {
    await simulateLatency(signal);
    const search = params.search?.trim().toLowerCase();
    return this.products.filter((product) => {
      if (params.categorySlug && product.category?.slug !== params.categorySlug) return false;
      if (search && !product.name.toLowerCase().includes(search)) return false;
      return true;
    });
  }

  async listCategories(signal?: AbortSignal): Promise<Category[]> {
    await simulateLatency(signal);
    return [...this.categories];
  }

  async getProductBySlug(slug: string, signal?: AbortSignal): Promise<Product | null> {
    await simulateLatency(signal);
    return this.products.find((product) => product.slug === slug) ?? null;
  }
}
