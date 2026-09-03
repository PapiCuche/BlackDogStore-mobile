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
/** Audience segments under the private namespace. See `queryKeys` below. */
export const CUSTOMER_AUDIENCE = 'customer';
export const INTERNAL_AUDIENCE = 'internal';

function customerPrefix(scope: QueryScope): readonly string[] {
  return [...scopePrefix(scope, 'user'), CUSTOMER_AUDIENCE];
}

/**
 * The INTERNAL namespace, in use from M6.
 *
 * `INTERNAL_AUDIENCE` was declared when the segment was introduced and had no
 * caller yet. It has one now, and the separation is what stops a company-wide
 * order list from landing in a cache slot a customer screen reads.
 */
function internalPrefix(scope: QueryScope): readonly string[] {
  return [...scopePrefix(scope, 'user'), INTERNAL_AUDIENCE];
}

export const queryKeys = {
  // ── tenant-public ────────────────────────────────────────────────────────
  products: (scope: QueryScope, params: { search?: string; categorySlug?: string } = {}) =>
    [...scopePrefix(scope, 'public'), 'products', params.search ?? '', params.categorySlug ?? ''] as const,
  product: (scope: QueryScope, slug: string) =>
    [...scopePrefix(scope, 'public'), 'product', slug] as const,
  categories: (scope: QueryScope) => [...scopePrefix(scope, 'public'), 'categories'] as const,
  companyBrand: (scope: QueryScope) =>
    [...scopePrefix(scope, 'public'), 'company-brand'] as const,
  storefrontConfig: (scope: QueryScope) =>
    [...scopePrefix(scope, 'public'), 'storefront-config'] as const,

  // ── tenant + user private, CUSTOMER audience ─────────────────────────────
  //
  // M4 added the `customer` segment ahead of the surface that will need it.
  // Backend now has three audiences (DEC-API-001), and the internal one will
  // read the SAME company through a different endpoint with different
  // permissions and a wider serializer. Two audiences sharing a cache key would
  // mean the first screen to load decides what the second one shows — and the
  // dangerous direction is internal data landing in a customer view.
  //
  // Adding the segment now costs one array element. Retrofitting it later would
  // mean auditing every key already in flight.
  repairs: (scope: QueryScope) => [...customerPrefix(scope), 'repairs'] as const,
  repair: (scope: QueryScope, id: number) => [...customerPrefix(scope), 'repair', id] as const,
  // BR-005B. NESTED under the repair's own key rather than a flat
  // `'repair-quote'` segment, so invalidating the repair sweeps its quote too —
  // answering a quote changes the repair's status, and the two must never be
  // refetched half a step apart.
  repairQuote: (scope: QueryScope, repairId: number) =>
    [...customerPrefix(scope), 'repair', repairId, 'quote'] as const,
  // M12B. Nested under the repair for the same reason the quote is: approving a
  // quote changes what is owed, and a balance that survived the repair's
  // invalidation would show a customer a figure the shop no longer agrees with.
  repairPaymentSummary: (scope: QueryScope, repairId: number) =>
    [...customerPrefix(scope), 'repair', repairId, 'payment-summary'] as const,
  orders: (scope: QueryScope) => [...customerPrefix(scope), 'orders'] as const,
  order: (scope: QueryScope, id: number) => [...customerPrefix(scope), 'order', id] as const,

  // ── tenant + user private, INTERNAL audience ─────────────────────────────
  internalContext: (scope: QueryScope) => [...internalPrefix(scope), 'context'] as const,
  internalOrders: (scope: QueryScope, params: Record<string, unknown> = {}) =>
    [...internalPrefix(scope), 'orders', JSON.stringify(params)] as const,
  internalOrder: (scope: QueryScope, id: number) =>
    [...internalPrefix(scope), 'order', id] as const,

  // Inventory keys carry the BRANCH, because the same person asking about two
  // shops is asking two different questions. Without it, switching branches
  // would read the previous shop's numbers out of the cache and show them under
  // the new shop's name — a wrong figure that looks authoritative.
  // `null` is its own slot: "everything I may see" is not branch zero.
  internalInventorySummary: (scope: QueryScope, branchId: number | null) =>
    [...internalPrefix(scope), 'inventory', 'summary', branchId] as const,
  internalInventoryStock: (
    scope: QueryScope,
    branchId: number | null,
    params: Record<string, unknown> = {},
  ) =>
    [...internalPrefix(scope), 'inventory', 'stock', branchId, JSON.stringify(params)] as const,
  internalInventoryMovements: (
    scope: QueryScope,
    branchId: number | null,
    params: Record<string, unknown> = {},
  ) =>
    [...internalPrefix(scope), 'inventory', 'movements', branchId, JSON.stringify(params)] as const,
  /** The whole module, for invalidation after a movement. */
  internalInventoryRoot: (scope: QueryScope) =>
    [...internalPrefix(scope), 'inventory'] as const,

  // ── INTERNAL service (M8) ────────────────────────────────────────────────
  //
  // A separate namespace from `repairs`, which is the CUSTOMER's view of the
  // same workshop. The two carry different fields — one has internal notes and
  // a technician, the other must never — and sharing a cache slot would mean
  // the first screen to load decides what the second one shows.
  internalServiceContext: (scope: QueryScope) =>
    [...internalPrefix(scope), 'service', 'context'] as const,
  internalServiceOrders: (
    scope: QueryScope,
    branchId: number | null,
    params: Record<string, unknown> = {},
  ) =>
    [...internalPrefix(scope), 'service', 'orders', branchId, JSON.stringify(params)] as const,
  internalServiceOrder: (scope: QueryScope, id: number) =>
    [...internalPrefix(scope), 'service', 'order', id] as const,
  internalServiceAssignment: (scope: QueryScope, id: number) =>
    [...internalPrefix(scope), 'service', 'assignment', id] as const,
  internalServiceCustomers: (scope: QueryScope, search: string) =>
    [...internalPrefix(scope), 'service', 'customers', search] as const,
  internalServiceDevices: (
    scope: QueryScope,
    customerId: number | null,
    search: string,
  ) =>
    [...internalPrefix(scope), 'service', 'devices', customerId, search] as const,
  // BR-005B. NESTED under the order they belong to, so invalidating an order
  // sweeps its diagnosis and its quotes: publishing changes all three, and
  // refetching one without the others shows a screen that disagrees with itself.
  internalServiceDiagnostics: (scope: QueryScope, orderId: number) =>
    [...internalPrefix(scope), 'service', 'order', orderId, 'diagnostics'] as const,
  internalServiceQuotes: (scope: QueryScope, orderId: number) =>
    [...internalPrefix(scope), 'service', 'order', orderId, 'quotes'] as const,
  // M10. The bench and the parts hang off the same order, for the same reason:
  // consuming a part changes the parts list, the execution that owns it and —
  // when it is the last one — nothing else, but a reversal or a completion
  // changes the order's status too.
  internalServiceExecution: (scope: QueryScope, orderId: number) =>
    [...internalPrefix(scope), 'service', 'order', orderId, 'execution'] as const,
  internalServiceParts: (scope: QueryScope, orderId: number) =>
    [...internalPrefix(scope), 'service', 'order', orderId, 'parts'] as const,
  internalServicePartCandidates: (scope: QueryScope, orderId: number) =>
    [...internalPrefix(scope), 'service', 'order', orderId, 'part-candidates'] as const,
  // M11. The inspection and its history hang off the same order. A pass or a
  // fail changes the order's status, its executions AND its checks at once, so
  // every write invalidates the service root rather than one of these.
  internalServiceQuality: (scope: QueryScope, orderId: number) =>
    [...internalPrefix(scope), 'service', 'order', orderId, 'quality'] as const,
  internalServiceQualityHistory: (scope: QueryScope, orderId: number) =>
    [...internalPrefix(scope), 'service', 'order', orderId, 'quality-history'] as const,
  // M12. The handover. One per order, and once it exists it never changes —
  // the server refuses updates — so this key is only ever refetched because a
  // write elsewhere invalidated the whole service root.
  internalServiceDelivery: (scope: QueryScope, orderId: number) =>
    [...internalPrefix(scope), 'service', 'order', orderId, 'delivery'] as const,
  // M12B. The ledger and the balance hang off the same order. A payment or a
  // reversal changes BOTH — and the order's deliverability with them — so every
  // write invalidates the service root rather than one of these.
  internalServicePayments: (scope: QueryScope, orderId: number) =>
    [...internalPrefix(scope), 'service', 'order', orderId, 'payments'] as const,
  internalServicePaymentSummary: (scope: QueryScope, orderId: number) =>
    [...internalPrefix(scope), 'service', 'order', orderId, 'payment-summary'] as const,
  // IP1A — the till. `context` and a product SEARCH are two different lifetimes:
  // the context changes when somebody's access does, a search changes with every
  // keystroke. Selling invalidates the POS root AND the inventory root, because
  // a sale moves a shelf that the inventory module is showing.
  internalPosContext: (scope: QueryScope) =>
    [...internalPrefix(scope), 'pos', 'context'] as const,
  internalPosSearch: (scope: QueryScope, branchId: number, term: string) =>
    [...internalPrefix(scope), 'pos', 'search', branchId, term] as const,
  internalPosRoot: (scope: QueryScope) =>
    [...internalPrefix(scope), 'pos'] as const,
  /** The whole module, for invalidation after a write. */
  internalServiceRoot: (scope: QueryScope) =>
    [...internalPrefix(scope), 'service'] as const,
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
