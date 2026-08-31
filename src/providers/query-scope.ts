/**
 * DEC-MOBILE-002 — tenant- and user-scoped server-state cache.
 *
 * THE PROBLEM. M0 keyed every query globally: `['products']`, `['orders']`,
 * `['company-brand']`. In a single-store pilot that is fine. In a SaaS it is a
 * cache bleed waiting to happen:
 *
 *   Company A's catalogue answering a request made by Company B's build.
 *   User A's orders still in memory when User B signs in.
 *
 * Neither needs a backend bug to occur — the cache alone is enough.
 *
 * THE RULE. Every query that is specific to a company carries a tenant
 * namespace, and every query containing PRIVATE data additionally carries a
 * stable user id.
 *
 * ⚠️  THIS IS A CACHE NAMESPACE, NOT AUTHORISATION. The tenant string comes
 * from build configuration (`EXPO_PUBLIC_COMPANY_SLUG`) and a slug has never
 * been a credential. Authority belongs to the server, which must scope its own
 * queryset — see BR-002. Partitioning the cache keeps one tenant's data out of
 * another tenant's screen; it does not decide who may fetch it.
 */

/**
 * The namespace a query belongs to.
 *
 * `user` is null for anonymous or public data. It is a stable ID, never an
 * email: an email can change, and it would put a personal identifier into every
 * cache key and every devtools dump.
 */
export type QueryScope = {
  /** Cache namespace for the tenant. NOT a permission. */
  tenant: string;
  /** Stable user id, or null when anonymous. */
  user: string | null;
};

/** Used when no tenant is configured. A release in that state fetches nothing. */
export const UNSCOPED_TENANT = 'unconfigured';

export function makeQueryScope(input: {
  tenantSlug: string | null;
  userId: string | number | null;
}): QueryScope {
  return {
    tenant: input.tenantSlug?.trim().toLowerCase() || UNSCOPED_TENANT,
    user: input.userId === null || input.userId === undefined ? null : String(input.userId),
  };
}

/**
 * Visibility classes. Only three, and each earns its place:
 *
 *   `public`  tenant-specific but not personal — catalogue, brand.
 *   `user`    tenant-specific AND personal — orders, repairs.
 *   `global`  belongs to no tenant. Nothing uses it yet; it exists so that a
 *             future genuinely-global query cannot be mistaken for a tenant one.
 */
export type QueryVisibility = 'public' | 'user' | 'global';

/** Marks a key as private, so logout can find and evict it by shape. */
export const USER_SEGMENT = 'user';
export const TENANT_SEGMENT = 'tenant';
export const PUBLIC_SEGMENT = 'public';
export const GLOBAL_SEGMENT = 'global';

/**
 * Build the namespace prefix for a key.
 *
 *   public → ['tenant', 'blackdog', 'public', …]
 *   user   → ['tenant', 'blackdog', 'user', '42', …]
 *   global → ['global', …]
 *
 * The shape is what makes eviction possible: `isPrivateQueryKey` recognises a
 * private key without a registry of which features are private, so adding a new
 * private query cannot forget to register itself.
 */
export function scopePrefix(scope: QueryScope, visibility: QueryVisibility): readonly string[] {
  if (visibility === 'global') return [GLOBAL_SEGMENT];
  if (visibility === 'public') return [TENANT_SEGMENT, scope.tenant, PUBLIC_SEGMENT];
  // A private query with no user is still namespaced, under an explicit
  // anonymous bucket, so it can never share a key with a signed-in user's data.
  return [TENANT_SEGMENT, scope.tenant, USER_SEGMENT, scope.user ?? 'anonymous'];
}

/** Whether a cached key holds user-private data. Drives logout eviction. */
export function isPrivateQueryKey(key: readonly unknown[]): boolean {
  return key[0] === TENANT_SEGMENT && key[2] === USER_SEGMENT;
}

/** Whether a cached key belongs to `tenant`. Drives a future tenant switch. */
export function belongsToTenant(key: readonly unknown[], tenant: string): boolean {
  return key[0] === TENANT_SEGMENT && key[1] === tenant;
}
