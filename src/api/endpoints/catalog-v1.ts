import { companySlug } from '@/config/env';
import type { Category, Product } from '@/domain/products/types';

import { ApiError } from '../errors';
import { request } from '../client';

/**
 * The TENANT-SAFE catalogue — `/api/v1/storefront/<company_slug>/…`.
 *
 * Verified to exist on `PapiCuche/BlackDogStore-web` @ `origin/master`
 * `b301637b` (PR #1, "feat(api): add tenant-safe v1 public catalog"):
 *
 *   GET /api/v1/storefront/<slug>/products/
 *   GET /api/v1/storefront/<slug>/products/<product_slug>/
 *   GET /api/v1/storefront/<slug>/categories/
 *
 * WHY THE TENANT IS IN THE PATH
 *
 * The web storefront identifies its company by Host, set by DNS and the reverse
 * proxy. This app reaches one shared API host and has no such signal, so it must
 * name the storefront it wants.
 *
 * THAT SLUG IS A SELECTOR, NOT AUTHORIZATION.
 *
 * It chooses which public shop window to read. It grants nothing: the server
 * resolves an ACTIVE company from it and builds every queryset from that company
 * — and every private surface keeps deriving its company from the authenticated
 * user's membership instead (BR-001/BR-002). These endpoints are anonymous by
 * design and carry no credentials, which is why `request` is used here and never
 * `authenticatedRequest`: a Bearer token has no business on a shop window, and
 * `/api/v1/` being the Bearer-eligible prefix makes that worth stating out loud.
 *
 * Unknown, inactive and malformed tenants all answer with the same 404, so this
 * client cannot be used to discover which companies exist either.
 */

/**
 * Raised when a build with no resolved tenant tries to read a catalogue.
 *
 * Distinct from `ApiError`: nothing was wrong with the network, and nothing was
 * even sent. The build is misconfigured, and guessing a slug here is exactly
 * the silent-wrong-tenant failure the whole design exists to prevent.
 */
export class MissingTenantError extends Error {
  constructor() {
    super(
      'Esta build no tiene empresa configurada (EXPO_PUBLIC_COMPANY_SLUG). ' +
        'No se puede pedir un catálogo sin saber de qué empresa es.',
    );
    this.name = 'MissingTenantError';
  }
}

/**
 * Build the storefront prefix for this build's tenant.
 *
 * `encodeURIComponent` even though the resolved slug comes from validated
 * configuration: the day someone widens `resolveTenant` to accept a runtime
 * value, this line is already correct rather than one review away from a path
 * traversal.
 */
function storefrontPath(slug: string): string {
  return `/api/v1/storefront/${encodeURIComponent(slug)}`;
}

function requireTenant(): string {
  if (!companySlug) throw new MissingTenantError();
  return companySlug;
}

/** Query parameters the v1 product list actually reads. */
export type V1ProductQuery = {
  category?: string;
  search?: string;
  in_stock?: 'true';
  /** Allowlisted server-side: price, -price, name, -name, newest. */
  ordering?: 'price' | '-price' | 'name' | '-name' | 'newest';
};

/**
 * Map one serialized row.
 *
 * Explicit rather than a cast: the wire format is snake_case, the domain is
 * camelCase, and the defaults encode real nullability from the Django model —
 * `category` is `SET_NULL`, `image_url` is `blank=True, default=''`, and
 * `average_rating` is null until the first review exists.
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

export async function fetchV1Products(
  query: V1ProductQuery = {},
  signal?: AbortSignal,
): Promise<Product[]> {
  const rows = await request<unknown[]>(`${storefrontPath(requireTenant())}/products/`, {
    query,
    signal,
  });
  return Array.isArray(rows) ? rows.map(toProduct) : [];
}

export async function fetchV1Categories(signal?: AbortSignal): Promise<Category[]> {
  const rows = await request<unknown[]>(`${storefrontPath(requireTenant())}/categories/`, {
    signal,
  });
  return Array.isArray(rows) ? rows.map(toCategory) : [];
}

/**
 * One product, addressed by slug.
 *
 * v1 looks products up by slug, so this is a real detail endpoint rather than
 * the legacy `?slug=` list trick.
 *
 * A 404 returns null instead of throwing, because "this product is gone" is an
 * empty state the screen already renders. Note that the SERVER answers 404 for
 * an unknown tenant too — which is deliberate on its side (it refuses to reveal
 * which companies exist) and harmless here, since a build whose tenant does not
 * resolve is a misconfiguration that `MissingTenantError` catches before any
 * request is sent.
 */
export async function fetchV1ProductBySlug(
  slug: string,
  signal?: AbortSignal,
): Promise<Product | null> {
  const path = `${storefrontPath(requireTenant())}/products/${encodeURIComponent(slug)}/`;
  try {
    return toProduct(await request<unknown>(path, { signal }));
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}
