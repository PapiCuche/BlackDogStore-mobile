import type { Category, Product } from '@/domain/products/types';

import { request } from '../client';

/**
 * The catalogue endpoints.
 *
 * VERIFIED to exist in the Web repository's `store/urls.py`:
 *   GET /api/products/    ProductViewSet   (ReadOnlyModelViewSet, AllowAny)
 *   GET /api/categories/  CategoryViewSet  (ReadOnlyModelViewSet, AllowAny)
 *
 * Both return a RAW ARRAY, not a paginated envelope — pagination is disabled
 * globally in `REST_FRAMEWORK` with an explicit comment saying the frontend
 * expects arrays. That is why the mappers below take `unknown[]` and not a
 * `{ results: [] }` shape. See BR-004 for why this needs to change.
 *
 * These are the ONLY endpoints this app calls. Nothing else is invented.
 */

/** Query parameters `ProductViewSet.get_queryset` actually reads. */
export type ProductQuery = {
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
    averageRating: row.average_rating === null || row.average_rating === undefined
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

export async function fetchProducts(
  query: ProductQuery = {},
  signal?: AbortSignal,
): Promise<Product[]> {
  const rows = await request<unknown[]>('/api/products/', { query, signal });
  return Array.isArray(rows) ? rows.map(toProduct) : [];
}

export async function fetchCategories(signal?: AbortSignal): Promise<Category[]> {
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
export async function fetchProductBySlug(
  slug: string,
  signal?: AbortSignal,
): Promise<Product | null> {
  const products = await fetchProducts({ slug }, signal);
  return products[0] ?? null;
}
