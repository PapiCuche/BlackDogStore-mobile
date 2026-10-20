import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getAuthRuntime } from '@/auth/auth-runtime';
import { InternalCapabilityMissingError } from '@/api/endpoints/internal-v1';
import type { FulfillmentStatus } from '@/domain/internal/types';
import type {
  RiskDecision,
  UnitMethodInput,
} from '@/domain/internal/order-unit-types';
import { queryKeys } from '@/providers/query-client';
import { useQueryScope } from '@/providers/use-query-scope';
import { V1InternalSalesRepository } from '@/repositories/api/v1-internal-sales-repository';

/**
 * The internal sales module's data.
 *
 * Built lazily from the shared auth runtime, so this repository uses the SAME
 * token graph as everything else. Two coordinators over one Keychain entry
 * would rotate the refresh token against each other — the bug M5 fixed and this
 * must not reintroduce.
 */
function repository(): V1InternalSalesRepository {
  return new V1InternalSalesRepository({ refreshCoordinator: getAuthRuntime().coordinator });
}

/**
 * Who this person is inside the company, freshly resolved.
 *
 * `retry: false` because the two interesting failures are both permanent
 * answers: 404 means "you do not belong here" and 403 means "you lack the
 * capability". Retrying either would just ask the same question again.
 */
export function useInternalContext(options: { enabled?: boolean } = {}) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.internalContext(scope),
    queryFn: ({ signal }) => repository().getContext(signal),
    enabled: options.enabled ?? true,
    retry: false,
    // Short, not infinite: a revoked permission should surface on the next
    // visit rather than at the next cold start.
    staleTime: 30_000,
  });
}

export function useInternalOrders(
  params: { search?: string; page?: number } = {},
  options: { enabled?: boolean } = {},
) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.internalOrders(scope, params),
    queryFn: ({ signal }) => repository().listOrders(params, signal),
    enabled: options.enabled ?? true,
    retry: false,
  });
}

export function useInternalOrder(id: number | undefined, options: { enabled?: boolean } = {}) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.internalOrder(scope, id ?? -1),
    queryFn: ({ signal }) => repository().getOrder(id!, signal),
    enabled: (options.enabled ?? true) && id !== undefined && Number.isFinite(id),
    retry: false,
  });
}

/**
 * Move an order's fulfilment state.
 *
 * On a 403 the INTERNAL cache is dropped — the permission was revoked while
 * this screen was open, and continuing to render company data the server has
 * just refused would be showing something the app is no longer entitled to.
 *
 * The customer cache is left alone. Losing an internal permission is not
 * losing a session: this person may still be a client of the same shop.
 */
export function useSetFulfillmentStatus() {
  const client = useQueryClient();
  const scope = useQueryScope();

  return useMutation({
    mutationFn: (input: { id: number; fulfillmentStatus: FulfillmentStatus; note?: string }) =>
      repository().setFulfillmentStatus(input),
    onSuccess: (detail) => {
      client.setQueryData(queryKeys.internalOrder(scope, detail.id), detail);
      void client.invalidateQueries({ queryKey: queryKeys.internalOrders(scope, {}) });
    },
    onError: (error) => {
      if (error instanceof InternalCapabilityMissingError) {
        void client.removeQueries({ queryKey: queryKeys.internalContext(scope) });
        void client.removeQueries({ queryKey: queryKeys.internalOrder(scope, 0).slice(0, -2) });
      }
    },
    retry: false,
  });
}

// ---------------------------------------------------------------------------
// SERIAL-PICK-01 — which device left with the order
// ---------------------------------------------------------------------------

/**
 * Which device does this code name?
 *
 * A MUTATION, not a query, although it writes nothing: it is an act somebody
 * performs with a device in hand, its answer is about one code typed once, and
 * caching it would mean a screen showing a candidate for a code the person has
 * already moved on from.
 */
export function useLookupOrderUnit(orderId: number) {
  return useMutation({
    mutationFn: ({ code, method }: { code: string; method: UnitMethodInput }) =>
      repository().lookupUnit(orderId, code, method),
    retry: false,
  });
}

/**
 * Commit the device being handed over, or take one back.
 *
 * Both answer with the WHOLE order — devices, remaining count, whether more
 * can still be named — so the cache is written from that answer and the screen
 * never computes any of it.
 *
 * Neither retries. Sending the same code twice is refused by the server (the
 * device is already on the order), and an automatic retry would turn one clear
 * refusal into a confusing second one.
 */
export function useIdentifyOrderUnit(orderId: number) {
  const client = useQueryClient();
  const scope = useQueryScope();

  return useMutation({
    mutationFn: ({ code, method }: { code: string; method: UnitMethodInput }) =>
      repository().identifyUnit(orderId, code, method),
    onSuccess: (detail) => {
      client.setQueryData(queryKeys.internalOrder(scope, detail.id), detail);
      void client.invalidateQueries({ queryKey: queryKeys.internalOrders(scope, {}) });
    },
    retry: false,
  });
}

export function useForgetOrderUnit(orderId: number) {
  const client = useQueryClient();
  const scope = useQueryScope();

  return useMutation({
    mutationFn: ({ orderUnitId }: { orderUnitId: number }) =>
      repository().forgetUnit(orderId, orderUnitId),
    onSuccess: (detail) => {
      client.setQueryData(queryKeys.internalOrder(scope, detail.id), detail);
      void client.invalidateQueries({ queryKey: queryKeys.internalOrders(scope, {}) });
    },
    retry: false,
  });
}

/**
 * Decide the review an order was waiting for — CLIENT-SEC-01.
 *
 * The server answers the ASSESSMENT ALONE, because `manage` does not imply
 * `view`: somebody who may only decide is not handed an order payload. So the
 * order is INVALIDATED rather than written from the answer — the next read
 * will carry the decided assessment, and it will carry it with whatever else
 * the reader is entitled to.
 *
 * Once: a review that is not waiting answers 409, which is the server saying
 * somebody else already looked. Nothing retries.
 */
export function useReviewOrderRisk(orderId: number) {
  const client = useQueryClient();
  const scope = useQueryScope();

  return useMutation({
    mutationFn: ({ decision, note }: { decision: RiskDecision; note: string }) =>
      repository().reviewRisk(orderId, decision, note),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.internalOrder(scope, orderId) });
      void client.invalidateQueries({ queryKey: queryKeys.internalOrders(scope, {}) });
    },
    retry: false,
  });
}
