import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

type Wrapper = (props: { children: ReactNode }) => ReactNode;

import { QuoteAlreadyDecidedError } from '@/api/endpoints/customer-repairs-v1';
import { ServiceOutOfScopeError } from '@/api/endpoints/internal-service-v1';
import type { RepairQuote } from '@/domain/repairs/quote';
import { usePublishQuote } from '@/hooks/use-internal-service';
import { useDecideQuote, useRepairQuote } from '@/hooks/use-repairs';
import { queryKeys } from '@/providers/query-client';
import { makeQueryScope } from '@/providers/query-scope';

/**
 * M9 — what happens AROUND a decision.
 *
 * Answering a quote is the only write a customer makes in this whole app, and
 * it is not idempotent from the client's side: it can lose a race with the
 * counter. These pin down that losing it is handled rather than retried.
 */

/**
 * A signed-in scope, so the cache keys under test are the ones a real customer
 * gets. `makeQueryScope` is used rather than a literal: the scope is a branded
 * value, and a hand-written object silently degrades to the anonymous key.
 */
jest.mock('@/providers/use-query-scope', () => {
  const { makeQueryScope: make } = jest.requireActual('@/providers/query-scope');
  const scope = make({ tenantSlug: 'blackdog', userId: 42 });
  return { useQueryScope: () => scope };
});

const SCOPE = makeQueryScope({ tenantSlug: 'blackdog', userId: 42 });

const mockDecideQuote = jest.fn();
const mockGetRepairQuote = jest.fn();
const mockPublish = jest.fn();

jest.mock('@/repositories', () => ({
  repositories: {
    get repairs() {
      return { decideQuote: mockDecideQuote, getRepairQuote: mockGetRepairQuote };
    },
  },
}));

jest.mock('@/api/endpoints/internal-service-v1', () => ({
  ...jest.requireActual('@/api/endpoints/internal-service-v1'),
  postServiceQuotePublish: (...args: unknown[]) => mockPublish(...args),
}));

const QUOTE: RepairQuote = {
  id: 5001, revision: 1, status: 'sent', statusLabel: 'Enviada', currency: 'PEN',
  subtotal: '225.00', discountAmount: '0.00', taxAmount: '0.00', total: '225.00',
  validUntil: null, isExpired: false, canBeDecided: true, customerNotes: '',
  items: [], decision: null, sentAt: '2026-09-01T16:02:00-05:00',
};

const clients: QueryClient[] = [];
const mounted: (() => void)[] = [];

/**
 * Render a hook and remember how to take it down again.
 *
 * RNTL's auto-cleanup does not await an async unmount, and a view left mounted
 * with a live QueryClient keeps this file's worker alive after the last
 * assertion — which Jest reports as the whole run leaking.
 */
async function mount<T>(hook: () => T, wrapper: Wrapper) {
  const view = await renderHook(hook, { wrapper });
  mounted.push(view.unmount);
  return view;
}

function harness() {
  const client = new QueryClient({
    defaultOptions: {
      // `gcTime: 0` on BOTH caches. The mutation cache's default is five
      // minutes, and a settled mutation schedules that timer — which keeps this
      // file's worker alive long after the last assertion.
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  clients.push(client);
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  const wrapper: Wrapper = ({ children }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper, invalidate };
}

afterEach(async () => {
  for (const unmount of mounted.splice(0)) await unmount();
  for (const client of clients.splice(0)) client.clear();
});

beforeEach(() => {
  mockDecideQuote.mockReset();
  mockGetRepairQuote.mockReset();
  mockPublish.mockReset();
});

describe('answering the quote', () => {
  it('sends the repair id the screen is on, not one the caller chose', async () => {
    // The hook is bound to the route's repair. A mutation that took the repair
    // id as an argument could answer a quote on a different one.
    mockDecideQuote.mockResolvedValue(QUOTE);
    const { wrapper } = harness();
    const { result } = await mount(() => useDecideQuote(42), wrapper);

    result.current.mutate({ quoteId: 5001, decision: 'approve' });
    await waitFor(() => expect(mockDecideQuote).toHaveBeenCalled());

    expect(mockDecideQuote).toHaveBeenCalledWith({
      repairId: 42, quoteId: 5001, decision: 'approve',
    });
  });

  it('refetches the repair AND the quote after a decision lands', async () => {
    // Approving changes the quote, the repair's status and its timeline. Three
    // things move; refetching one of them shows a screen disagreeing with itself.
    mockDecideQuote.mockResolvedValue({ ...QUOTE, status: 'approved' });
    const { wrapper, invalidate } = harness();
    const { result } = await mount(() => useDecideQuote(42), wrapper);

    result.current.mutate({ quoteId: 5001, decision: 'approve' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = invalidate.mock.calls.map((call) => JSON.stringify(call[0]?.queryKey));
    expect(keys).toContain(JSON.stringify(queryKeys.repair(SCOPE, 42)));
    expect(keys).toContain(JSON.stringify(queryKeys.repairs(SCOPE)));
  });
});

describe('losing the race with the counter', () => {
  it('REFETCHES on a 409 instead of leaving a stale screen', async () => {
    // The counter answered by phone a second earlier. The customer must end up
    // looking at the real state — which is why invalidation is onSettled and
    // not onSuccess.
    mockDecideQuote.mockRejectedValue(new QuoteAlreadyDecidedError());
    const { wrapper, invalidate } = harness();
    const { result } = await mount(() => useDecideQuote(42), wrapper);

    result.current.mutate({ quoteId: 5001, decision: 'approve' });
    await waitFor(() => expect(result.current.isError).toBe(true));

    const keys = invalidate.mock.calls.map((call) => JSON.stringify(call[0]?.queryKey));
    expect(keys).toContain(JSON.stringify(queryKeys.repair(SCOPE, 42)));
  });

  it('NEVER retries a decision', async () => {
    // A retry is the app answering a second time on somebody's behalf. If the
    // first attempt reached the server and the response was lost, the retry
    // either duplicates an answer or races the person's own change of mind.
    mockDecideQuote.mockRejectedValue(new QuoteAlreadyDecidedError());
    const { wrapper } = harness();
    const { result } = await mount(() => useDecideQuote(42), wrapper);

    result.current.mutate({ quoteId: 5001, decision: 'approve' });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(mockDecideQuote).toHaveBeenCalledTimes(1);
  });

  it('keeps the error typed, so the screen can say what happened', async () => {
    mockDecideQuote.mockRejectedValue(new QuoteAlreadyDecidedError());
    const { wrapper } = harness();
    const { result } = await mount(() => useDecideQuote(42), wrapper);

    result.current.mutate({ quoteId: 5001, decision: 'approve' });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeInstanceOf(QuoteAlreadyDecidedError);
  });
});

describe('a repair with no quote is not an error', () => {
  it('resolves to null and keeps the screen calm', async () => {
    // Most repairs have no quote for most of their life. Treating that as a
    // failure would put an error card on a perfectly healthy screen.
    mockGetRepairQuote.mockResolvedValue(null);
    const { wrapper } = harness();
    const { result } = await mount(() => useRepairQuote(42), wrapper);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('does not ask at all without a repair id', async () => {
    const { wrapper } = harness();
    await mount(() => useRepairQuote(undefined), wrapper);

    await waitFor(() => expect(mockGetRepairQuote).not.toHaveBeenCalled());
  });
});

describe('the internal side refuses to retry a write too', () => {
  it('publishes once and stops, even though publishing is the one that matters', async () => {
    // A retried publish is a second quote sent to a customer who already got
    // one — with a different revision number and a different price.
    mockPublish.mockRejectedValue(new ServiceOutOfScopeError());
    const { wrapper } = harness();
    const { result } = await mount(() => usePublishQuote(7), wrapper);

    result.current.mutate({ quoteId: 21 });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(mockPublish).toHaveBeenCalledTimes(1);
    expect(mockPublish.mock.calls[0]!.slice(0, 2)).toEqual([7, 21]);
  });

  it('refetches the whole service subtree once a write lands', async () => {
    // Publishing changes the quote, the order's status and its history at once.
    // Invalidating the service ROOT is what keeps those three agreeing.
    mockPublish.mockResolvedValue({ id: 21, status: 'sent' });
    const { wrapper, invalidate } = harness();
    const { result } = await mount(() => usePublishQuote(7), wrapper);

    result.current.mutate({ quoteId: 21 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidate.mock.calls.map((call) => JSON.stringify(call[0]?.queryKey)))
      .toContain(JSON.stringify(queryKeys.internalServiceRoot(SCOPE)));
  });
});
