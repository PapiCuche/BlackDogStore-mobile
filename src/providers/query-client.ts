import { QueryClient, type QueryClient as QueryClientType } from '@tanstack/react-query';

import {
  MUTATION_RETRY,
  queryRetryDelay,
  shouldRetryQuery,
} from './retry-policy';
import {
  isPrivateQueryKey,
  scopePrefix,
  type QueryScope,
} from './query-scope';

/**
 * Server-state configuration.
 *
 * TanStack Query owns everything that comes from a repository. There is no
 * Redux/Zustand mirror of products, orders or repairs — a second copy of server
 * data is a second thing to invalidate, and it always drifts.
 *
 * ⚠️  MEMORY ONLY. No persister, by decision (DEC-MOBILE-003). Persisting this
 * cache needs tenant partitioning on disk, session partitioning, an eviction
 * story for logout, an encryption decision for personal data, and a schema
 * version — none of which exist yet. See docs/OFFLINE_STRATEGY.md.
 */

const ONE_MINUTE = 60_000;

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Mobile users background and foreground the app constantly. A minute
        // of freshness avoids a refetch storm on every app switch while still
        // feeling live.
        staleTime: ONE_MINUTE,
        // Five minutes of retention after the last observer unmounts. Long
        // enough that tab-switching keeps its data, short enough that a phone
        // under memory pressure is not holding several screens of stale JSON.
        gcTime: 5 * ONE_MINUTE,
        retry: shouldRetryQuery,
        retryDelay: queryRetryDelay,
        // React Native has no window focus. `focusManager` is driven from
        // AppState instead — see query-lifecycle.tsx.
        refetchOnWindowFocus: true,
        // On reconnect, revalidate what is stale. `onlineManager` decides when
        // "reconnect" happens, from real connectivity.
        refetchOnReconnect: true,
      },
      mutations: {
        retry: MUTATION_RETRY,
      },
    },
  });
}

/**
 * Query keys, centralised and SCOPED.
 *
 * Every key that belongs to a company is namespaced by tenant, and every key
 * holding personal data is additionally namespaced by user — DEC-MOBILE-002.
 *
 * The scope is the FIRST argument on purpose: it is impossible to write one of
 * these calls and forget it.
 */
export const queryKeys = {
  // ── tenant-public ────────────────────────────────────────────────────────
  products: (scope: QueryScope, params: { search?: string; categorySlug?: string } = {}) =>
    [...scopePrefix(scope, 'public'), 'products', params.search ?? '', params.categorySlug ?? ''] as const,
  product: (scope: QueryScope, slug: string) =>
    [...scopePrefix(scope, 'public'), 'product', slug] as const,
  categories: (scope: QueryScope) => [...scopePrefix(scope, 'public'), 'categories'] as const,
  companyBrand: (scope: QueryScope) =>
    [...scopePrefix(scope, 'public'), 'company-brand'] as const,

  // ── tenant + user private ────────────────────────────────────────────────
  repairs: (scope: QueryScope) => [...scopePrefix(scope, 'user'), 'repairs'] as const,
  repair: (scope: QueryScope, id: string) => [...scopePrefix(scope, 'user'), 'repair', id] as const,
  orders: (scope: QueryScope) => [...scopePrefix(scope, 'user'), 'orders'] as const,
  order: (scope: QueryScope, id: number) => [...scopePrefix(scope, 'user'), 'order', id] as const,
} as const;

/**
 * Evict everything personal.
 *
 * Called when the signed-in identity changes — sign-out, a different user, or a
 * future tenant switch. Cancelling first matters as much as removing: an
 * in-flight request for the previous user would otherwise land afterwards and
 * repopulate the cache it was just cleared from.
 *
 * Public tenant data (catalogue, brand) is deliberately left alone. It contains
 * nothing personal, and dropping it would make every sign-out re-download the
 * shop for no security benefit.
 */
export async function clearPrivateQueries(client: QueryClientType): Promise<void> {
  const predicate = (query: { queryKey: readonly unknown[] }) => isPrivateQueryKey(query.queryKey);
  await client.cancelQueries({ predicate });
  client.removeQueries({ predicate });
}

/**
 * Evict everything belonging to a tenant, public data included.
 *
 * For a future company switch: Company B must never see Company A's catalogue,
 * brand or orders, so the whole namespace goes.
 */
export async function clearTenantQueries(
  client: QueryClientType,
  tenant: string,
): Promise<void> {
  const predicate = (query: { queryKey: readonly unknown[] }) =>
    query.queryKey[0] === 'tenant' && query.queryKey[1] === tenant;
  await client.cancelQueries({ predicate });
  client.removeQueries({ predicate });
}
