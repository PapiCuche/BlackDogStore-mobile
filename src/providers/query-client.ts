import { QueryClient } from '@tanstack/react-query';

import { ApiError } from '@/api/errors';

/**
 * Server-state configuration.
 *
 * TanStack Query owns everything that comes from a repository. There is no
 * Redux/Zustand mirror of products, orders or repairs — a second copy of server
 * data is a second thing to invalidate, and it always drifts.
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
        gcTime: 5 * ONE_MINUTE,
        retry: (failureCount, error) => {
          // Retrying a 401 or a 404 just burns battery and rate limit. Only
          // transient failures are worth a second attempt.
          if (error instanceof ApiError && !error.isRetryable) return false;
          return failureCount < 2;
        },
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
        // React Native has no window focus. Refetch-on-mount covers the real
        // case (navigating back to a screen) without extra wiring.
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

/**
 * Query keys, centralised.
 *
 * Invalidation is only reliable when every caller spells the key the same way,
 * and a typo'd key fails silently — the query simply never invalidates.
 */
export const queryKeys = {
  products: (params: { search?: string; categorySlug?: string } = {}) =>
    ['products', params.search ?? '', params.categorySlug ?? ''] as const,
  product: (slug: string) => ['product', slug] as const,
  categories: () => ['categories'] as const,
  repairs: () => ['repairs'] as const,
  repair: (id: string) => ['repair', id] as const,
  orders: () => ['orders'] as const,
  order: (id: number) => ['order', id] as const,
  companyBrand: () => ['company-brand'] as const,
} as const;
