import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/providers/query-client';
import { useQueryScope } from '@/providers/use-query-scope';
import type { QuoteDecision } from '@/domain/repairs/quote';
import { repositories } from '@/repositories';
import { featureUnavailable } from '@/repositories/errors';

/**
 * A customer's own repairs.
 *
 * M8 — real, over `/api/v1/customer/<company>/repairs/`. `repositories.repairs`
 * is null only when there is no session runtime at all (no API url, no mocks);
 * the query then rejects with a `FeatureUnavailableError` and the screen says
 * so, rather than showing an empty list that reads as "you have no repairs".
 *
 * These are PRIVATE queries. `retry: false` because the interesting failure —
 * "not a client of this company" — is a permanent answer, and asking again
 * only delays the honest screen.
 */
const UNAVAILABLE =
  'Las reparaciones no están disponibles en esta versión de la app.';

export function useRepairs() {
  const repository = repositories.repairs;
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.repairs(scope),
    queryFn: ({ signal }) =>
      repository ? repository.listRepairs(signal) : featureUnavailable('repairs', UNAVAILABLE),
    retry: false,
  });
}

export function useRepair(id: number | undefined) {
  const repository = repositories.repairs;
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.repair(scope, id ?? -1),
    queryFn: ({ signal }) =>
      repository ? repository.getRepairById(id!, signal) : featureUnavailable('repairs', UNAVAILABLE),
    enabled: id !== undefined && Number.isFinite(id),
    retry: false,
  });
}

/**
 * The quote on one of my repairs, or null.
 *
 * SECONDARY to the repair itself: the detail screen renders its own inline
 * pending and error states for this and never gates the whole page on it. Most
 * of a repair's life has no quote, and a screen that failed to load because an
 * absent thing failed to load would be worse than the absence.
 */
export function useRepairQuote(id: number | undefined, options: { enabled?: boolean } = {}) {
  const repository = repositories.repairs;
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.repairQuote(scope, id ?? -1),
    queryFn: ({ signal }) =>
      repository
        ? repository.getRepairQuote(id!, signal)
        : featureUnavailable('repairs', UNAVAILABLE),
    enabled: (options.enabled ?? true) && id !== undefined && Number.isFinite(id),
    retry: false,
  });
}

/**
 * What I owe on one of my repairs. M12B.
 *
 * SECONDARY, like the quote: the detail screen renders it inline and never
 * gates the page on it. A repair with no agreed price is the normal case, and a
 * screen that failed to load because a balance failed to load would be worse
 * than the balance being absent.
 */
export function useRepairPaymentSummary(
  id: number | undefined,
  options: { enabled?: boolean } = {},
) {
  const repository = repositories.repairs;
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.repairPaymentSummary(scope, id ?? -1),
    queryFn: ({ signal }) =>
      repository
        ? repository.getPaymentSummary(id!, signal)
        : featureUnavailable('repairs', UNAVAILABLE),
    enabled: (options.enabled ?? true) && id !== undefined && Number.isFinite(id),
    retry: false,
  });
}

/**
 * Answer the quote.
 *
 * NO RETRY AND NO OFFLINE QUEUE. The server is idempotent for a repeat of the
 * same answer, but that is a safety net rather than a licence: a decision is
 * the customer authorising work, and a client that resent one on its own would
 * be deciding on their behalf when the network hiccuped.
 *
 * On success the whole repair key is invalidated — the quote AND the repair's
 * status and timeline all moved, and refetching one without the others would
 * show a screen that disagrees with itself.
 */
export function useDecideQuote(repairId: number | undefined) {
  const client = useQueryClient();
  const scope = useQueryScope();

  return useMutation({
    mutationFn: (input: { quoteId: number; decision: QuoteDecision; reason?: string }) => {
      const repository = repositories.repairs;
      if (!repository || repairId === undefined) {
        return featureUnavailable('repairs', UNAVAILABLE);
      }
      return repository.decideQuote({ repairId, ...input });
    },
    onSettled: () => {
      // On SETTLED, not on success: a 409 means somebody already answered, and
      // the screen has to show what the quote really says rather than the state
      // it was drawn from.
      if (repairId === undefined) return;
      void client.invalidateQueries({ queryKey: queryKeys.repair(scope, repairId) });
      void client.invalidateQueries({ queryKey: queryKeys.repairs(scope) });
    },
    retry: false,
  });
}
