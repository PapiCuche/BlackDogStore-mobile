import { assertLegacyCatalogAllowed } from '@/api/legacy-catalog-guard';
import type { Category, Product } from '@/domain/products/types';

import { request } from '../client';

/**
 * The LEGACY catalogue endpoints.
 *
 * ⚠️  LEGACY · PUBLIC · **NOT TENANT-SAFE** · NOT APPROVED FOR MOBILE RELEASE
 *
 * Verified to exist and be public on `PapiCuche/BlackDogStore-web`
 * @ `origin/master` `2624d478`:
 *
 *   GET /api/products/    ProductViewSet   (ReadOnlyModelViewSet, AllowAny)
 *   GET /api/categories/  CategoryViewSet  (ReadOnlyModelViewSet, AllowAny)
 *
 * They work. They are also GLOBAL: `ProductViewSet.get_queryset()` returns
 * `Product.objects…filter(is_active=True)` and `CategoryViewSet.queryset` is
 * `Category.objects.all()`. Neither model has a `company` field on `master`,
 * and the backend's own `resolve_company_from_host` docstring reads "DESIGNED,
 * not yet wired up … no public view calls it yet".
 *
 * For a single-store pilot that is fine. For a multi-tenant mobile client it is
 * a cross-tenant leak: every company's products, to every company's app.
 *
 * This is therefore NOT `/api/v1/` and must not be mistaken for it. The
 * tenant-safe contract is a proposal (BR-002, BR-007) and does not exist yet.
 * Every function here calls `assertLegacyCatalogAllowed()` first, so a build
 * that is not permitted cannot reach the network even by calling these
 * directly.
 *
 * Both endpoints return a RAW ARRAY, not a paginated envelope — pagination is
 * disabled globally with an explicit comment saying the web frontend expects
 * arrays. See BR-004.
 */

/** Query parameters `ProductViewSet.get_queryset` actually reads. */
export type LegacyProductQuery = {
  slug?: string;
  category?: string;
  search?: string;
  in_stock?: 'true';
  /** Whitelisted server-side: price, -price, name, -name, newest. */
  ordering?: 'price' | '-price' | 'name' | '-name' | 'newest';
};

/**
 * Map one serialized row.
 *
 * Mapping is explicit rather than a cast because the wire format is snake_case
 * and the domain is camelCase, and because the defaults below encode real
 * nullability from the Django model — `category` is `SET_NULL`, `image_url` is
 * `blank=True, default=''`, and `average_rating` is null until a review exists.
 */
function toProduct(raw: unknown): Product {
  const row = raw as Record<string, unknown>;
  return {
    id: Number(row.id),
    name: String(row.name ?? ''),
    slug: String(row.slug ?? ''),
    description: String(row.description ?? ''),
    price: String(row.price ?? '0'),
    inventory: Number(row.inventory ?? 0),
    category: row.category ? toCategory(row.category) : null,
    imageUrl: String(row.image_url ?? ''),
    averageRating:
      row.average_rating === null || row.average_rating === undefined
        ? null
        : Number(row.average_rating),
    reviewCount: Number(row.review_count ?? 0),
  };
}

function toCategory(raw: unknown): Category {
  const row = raw as Record<string, unknown>;
  return {
    id: Number(row.id),
    name: String(row.name ?? ''),
    slug: String(row.slug ?? ''),
  };
}

export async function fetchLegacyProducts(
  query: LegacyProductQuery = {},
  signal?: AbortSignal,
): Promise<Product[]> {
  assertLegacyCatalogAllowed();
  const rows = await request<unknown[]>('/api/products/', { query, signal });
  return Array.isArray(rows) ? rows.map(toProduct) : [];
}

export async function fetchLegacyCategories(signal?: AbortSignal): Promise<Category[]> {
  assertLegacyCatalogAllowed();
  const rows = await request<unknown[]>('/api/categories/', { signal });
  return Array.isArray(rows) ? rows.map(toCategory) : [];
}

/**
 * A single product.
 *
 * Goes through the list endpoint with `?slug=`, because that is what the
 * ViewSet supports — `retrieve` is keyed on the numeric PK, and the app routes
 * on slug. Returns null rather than throwing when nothing matches, since "this
 * product is gone" is an empty state, not an error.
 */
export async function fetchLegacyProductBySlug(
  slug: string,
  signal?: AbortSignal,
): Promise<Product | null> {
  const products = await fetchLegacyProducts({ slug }, signal);
  return products[0] ?? null;
}
