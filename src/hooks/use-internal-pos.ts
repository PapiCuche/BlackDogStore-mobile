import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { InternalCapabilityMissingError } from '@/api/endpoints/internal-v1';
import { getAuthRuntime } from '@/auth/auth-runtime';
import type { PosSaleInput } from '@/domain/internal/pos-types';
import { queryKeys } from '@/providers/query-client';
import { useQueryScope } from '@/providers/use-query-scope';
import { V1InternalPosRepository } from '@/repositories/api/v1-internal-pos-repository';

/**
 * The till's data.
 *
 * Built lazily from the shared auth runtime, so this repository uses the SAME
 * token graph as everything else — two coordinators over one Keychain entry
 * would rotate the refresh token against each other.
 */
function repository(): V1InternalPosRepository {
  return new V1InternalPosRepository({
    refreshCoordinator: getAuthRuntime().coordinator,
  });
}

/**
 * What this till may do. Asked once, when the screen opens.
 *
 * `retry: false`: 404 means the company is closed to this person and 403 means
 * the capability is gone. Both are permanent answers, and asking again only
 * delays the honest screen.
 */
export function usePosContext(options: { enabled?: boolean } = {}) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.internalPosContext(scope),
    queryFn: ({ signal }) => repository().getContext(signal),
    enabled: options.enabled ?? true,
    retry: false,
  });
}

/**
 * Search, scoped to a branch.
 *
 * Disabled below two characters — the same threshold the server enforces, so a
 * keystroke that would come back empty never leaves the phone.
 */
export function usePosProductSearch(
  branchId: number | null,
  term: string,
  options: { enabled?: boolean } = {},
) {
  const scope = useQueryScope();
  const trimmed = term.trim();
  return useQuery({
    queryKey: queryKeys.internalPosSearch(scope, branchId ?? -1, trimmed),
    queryFn: ({ signal }) =>
      repository().searchProducts({ q: trimmed, branch: branchId! }, signal),
    enabled:
      (options.enabled ?? true) && branchId !== null && trimmed.length >= 2,
    retry: false,
  });
}

/**
 * Resolve a scanned code, in one shop, at the moment the operator submits it.
 *
 * THE ADAPTER EXISTED AND NOTHING REACHED IT. `lookupPosProduct` and the
 * repository method had shipped since IP1A, and the integration status called
 * barcode reading integrated — but no hook wrapped it and no screen could call
 * it. This is the missing half, and it adds no behaviour the Web till does not
 * already have: its `handleScan` asks the same resolver on Enter.
 *
 * A READ ON DEMAND, NOT A MUTATION AND NOT A SUBSCRIPTION. It is a GET, so it
 * lives in the query cache under a key scoped to tenant, user, shop and code —
 * and it runs only when asked, because a keyboard-wedge scanner types the whole
 * payload before it presses Enter and every intermediate prefix is noise.
 *
 * `staleTime: 0` and `gcTime: 0`: a second scan of the same label asks the
 * server again. `available` is the shelf as it is NOW, and a cached answer from
 * a minute ago is how a till sells the last unit twice.
 *
 * `retry: false`: a 400 (a shop this person may not sell from) and a 404 (no
 * such code here) are answers, not failures.
 *
 * A 404 comes back as `null` from the endpoint, for a code that exists nowhere
 * AND for one belonging to another company — the server makes those
 * indistinguishable on purpose, and so does the Web till.
 *
 * A 403 evicts the till's cache exactly as a refused sale does, so the screen
 * re-resolves what this person may do instead of offering a scanner they no
 * longer hold. Nobody is signed out by it: that is the auth layer's decision,
 * and it only makes it on a 401.
 */
export function usePosLookup() {
  const client = useQueryClient();
  const scope = useQueryScope();

  return async function lookup(branchId: number, code: string) {
    try {
      return await client.fetchQuery({
        queryKey: queryKeys.internalPosLookup(scope, branchId, code),
        queryFn: ({ signal }) =>
          repository().lookupProduct({ code, branch: branchId }, signal),
        retry: false,
        staleTime: 0,
        gcTime: 0,
      });
    } catch (error) {
      if (error instanceof InternalCapabilityMissingError) {
        client.removeQueries({ queryKey: queryKeys.internalPosRoot(scope) });
        client.removeQueries({ queryKey: queryKeys.internalContext(scope) });
      }
      throw error;
    }
  };
}

/**
 * What the basket costs. THE ONLY SOURCE OF A TOTAL IN THIS APP.
 *
 * A mutation rather than a query because it is a POST with a body, and because
 * it should run when the operator asks — not on every re-render of a basket
 * somebody is still building.
 */
export function usePosPreview() {
  return useMutation({
    mutationFn: (input: Parameters<V1InternalPosRepository['preview']>[0]) =>
      repository().preview(input),
    retry: false,
  });
}

/**
 * Complete the sale.
 *
 * `retry: false`, and it matters more here than anywhere else in the app. A
 * retried POST the user did not ask for is a second charge and two units off a
 * shelf; the server's idempotency key protects the SERVER from a duplicate, not
 * the user from an intention they never had.
 *
 * On success it invalidates the POS root AND the inventory root: a sale moved
 * a shelf, and the inventory module is showing that shelf. The two modules do
 * not share a single type — only an invalidation crosses between them.
 */
export function useCreatePosSale() {
  const client = useQueryClient();
  const scope = useQueryScope();

  return useMutation({
    mutationFn: (input: PosSaleInput) => repository().createSale(input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.internalPosRoot(scope) });
      void client.invalidateQueries({
        queryKey: queryKeys.internalInventoryRoot(scope),
      });
    },
    onError: (error) => {
      if (error instanceof InternalCapabilityMissingError) {
        client.removeQueries({ queryKey: queryKeys.internalPosRoot(scope) });
        client.removeQueries({ queryKey: queryKeys.internalContext(scope) });
      }
    },
    retry: false,
  });
}
