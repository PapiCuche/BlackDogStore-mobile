import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { InternalCapabilityMissingError } from '@/api/endpoints/internal-v1';
import type {
  InventoryMovementQuery,
  InventoryStockQuery,
} from '@/api/endpoints/internal-inventory-v1';
import { getAuthRuntime } from '@/auth/auth-runtime';
import type { StockAdjustmentInput } from '@/domain/internal/inventory-types';
import { queryKeys } from '@/providers/query-client';
import { useQueryScope } from '@/providers/use-query-scope';
import { V1InternalInventoryRepository } from '@/repositories/api/v1-internal-inventory-repository';

/**
 * The internal inventory module's data.
 *
 * Built lazily from the shared auth runtime, so this repository uses the SAME
 * token graph as everything else. Two coordinators over one Keychain entry
 * would rotate the refresh token against each other — the bug M5 fixed, and
 * every new repository has to keep not reintroducing it.
 */
function repository(): V1InternalInventoryRepository {
  return new V1InternalInventoryRepository({
    refreshCoordinator: getAuthRuntime().coordinator,
  });
}

/**
 * `retry: false` throughout.
 *
 * The three interesting failures are all permanent answers: 404 means the
 * company is closed to you, 404-with-a-branch means that shop is not yours, and
 * 403 means the capability is gone. Retrying asks the same question again and
 * delays the honest screen.
 */
export function useInventorySummary(
  branchId: number | null,
  options: { enabled?: boolean } = {},
) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.internalInventorySummary(scope, branchId),
    queryFn: ({ signal }) =>
      repository().getSummary({ branchId: branchId ?? undefined }, signal),
    enabled: options.enabled ?? true,
    retry: false,
  });
}

export function useInventoryStock(
  query: InventoryStockQuery = {},
  options: { enabled?: boolean } = {},
) {
  const scope = useQueryScope();
  const { branchId, ...rest } = query;
  return useQuery({
    queryKey: queryKeys.internalInventoryStock(scope, branchId ?? null, rest),
    queryFn: ({ signal }) => repository().listStock(query, signal),
    enabled: options.enabled ?? true,
    retry: false,
  });
}

export function useInventoryMovements(
  query: InventoryMovementQuery = {},
  options: { enabled?: boolean } = {},
) {
  const scope = useQueryScope();
  const { branchId, ...rest } = query;
  return useQuery({
    queryKey: queryKeys.internalInventoryMovements(scope, branchId ?? null, rest),
    queryFn: ({ signal }) => repository().listMovements(query, signal),
    enabled: options.enabled ?? true,
    // Stock moves while someone is looking at it. A short freshness window
    // makes reopening the Kardex show the movement a colleague just recorded.
    staleTime: 15_000,
    retry: false,
  });
}

/**
 * Record a manual movement.
 *
 * On success the ENTIRE inventory namespace is invalidated, not just the branch
 * that moved. A summary is an aggregate across branches, a stock list may be
 * filtered by `low_stock`, and the Kardex has a new first row — surgically
 * patching three shapes to save one refetch is how a screen ends up showing a
 * total that no longer matches the rows under it.
 *
 * On a 403 the internal caches are DROPPED: the capability was revoked while
 * this screen was open, and continuing to render company stock the server has
 * just refused would be showing something the app is no longer entitled to.
 * The customer cache is left alone — losing an internal permission is not
 * losing a session, and this person may still be a client of the same shop.
 */
export function useAdjustStock() {
  const client = useQueryClient();
  const scope = useQueryScope();

  return useMutation({
    mutationFn: (input: StockAdjustmentInput) => repository().adjustStock(input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.internalInventoryRoot(scope) });
    },
    onError: (error) => {
      if (error instanceof InternalCapabilityMissingError) {
        client.removeQueries({ queryKey: queryKeys.internalInventoryRoot(scope) });
        client.removeQueries({ queryKey: queryKeys.internalContext(scope) });
      }
    },
    // A movement is not idempotent: a retried POST is a second movement, and
    // the Kardex would carry two entries for one physical event.
    retry: false,
  });
}
