import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import {
  ServiceIdempotencyConflictError,
  ServiceStockUnavailableError,
} from '@/api/endpoints/internal-service-v1';
import {
  useRecordPartUsage,
  useReversePartUsage,
  useStartRepair,
} from '@/hooks/use-internal-service';
import { queryKeys } from '@/providers/query-client';
import { makeQueryScope } from '@/providers/query-scope';

/**
 * M10 — what happens AROUND a part leaving a shelf.
 *
 * Consuming a part is the only write in this app that changes a physical
 * object. These pin down that it happens once, that a failure changes nothing,
 * and that the other module's cache learns about it.
 */

type Wrapper = (props: { children: ReactNode }) => ReactNode;

jest.mock('@/providers/use-query-scope', () => {
  const { makeQueryScope: make } = jest.requireActual('@/providers/query-scope');
  const scope = make({ tenantSlug: 'blackdog', userId: 42 });
  return { useQueryScope: () => scope };
});

const SCOPE = makeQueryScope({ tenantSlug: 'blackdog', userId: 42 });

const mockRecord = jest.fn();
const mockReverse = jest.fn();
const mockStart = jest.fn();

jest.mock('@/repositories/api/v1-internal-service-repository', () => ({
  V1InternalServiceRepository: class {
    recordPartUsage(...args: unknown[]) { return mockRecord(...args); }
    reversePartUsage(...args: unknown[]) { return mockReverse(...args); }
    startRepair(...args: unknown[]) { return mockStart(...args); }
  },
}));

jest.mock('@/auth/auth-runtime', () => ({
  getAuthRuntime: () => ({ coordinator: {} }),
}));

const clients: QueryClient[] = [];
const mounted: (() => void)[] = [];

async function mount<T>(hook: () => T, wrapper: Wrapper) {
  const view = await renderHook(hook, { wrapper });
  mounted.push(view.unmount);
  return view;
}

function harness() {
  const client = new QueryClient({
    defaultOptions: {
      // `gcTime: 0` on BOTH caches: the mutation cache's default is five
      // minutes, and a settled mutation schedules that timer.
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
  mockRecord.mockReset();
  mockReverse.mockReset();
  mockStart.mockReset();
});

const keys = (spy: jest.SpyInstance) =>
  spy.mock.calls.map((call) => JSON.stringify(call[0]?.queryKey));

describe('consuming a part', () => {
  it('sends the order the screen is on, not one the caller chose', async () => {
    mockRecord.mockResolvedValue({ id: 1 });
    const { wrapper } = harness();
    const { result } = await mount(() => useRecordPartUsage(7), wrapper);

    result.current.mutate({ quoteItemId: 21, quantity: 2, idempotencyKey: 'k1' });
    await waitFor(() => expect(mockRecord).toHaveBeenCalled());

    expect(mockRecord.mock.calls[0]![0]).toBe(7);
    expect(mockRecord.mock.calls[0]![1]).toEqual({
      quoteItemId: 21, quantity: 2, idempotencyKey: 'k1',
    });
  });

  it('NEVER retries', async () => {
    // A retry the user did not ask for is a second battery off the shelf. The
    // server's idempotency key protects the server; it does not supply the
    // user's intention.
    mockRecord.mockRejectedValue(new ServiceStockUnavailableError());
    const { wrapper } = harness();
    const { result } = await mount(() => useRecordPartUsage(7), wrapper);

    result.current.mutate({ quoteItemId: 21, quantity: 2, idempotencyKey: 'k1' });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(mockRecord).toHaveBeenCalledTimes(1);
  });

  it('keeps the stock error typed, so the screen can say what happened', async () => {
    mockRecord.mockRejectedValue(new ServiceStockUnavailableError());
    const { wrapper } = harness();
    const { result } = await mount(() => useRecordPartUsage(7), wrapper);

    result.current.mutate({ quoteItemId: 21, quantity: 9, idempotencyKey: 'k1' });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeInstanceOf(ServiceStockUnavailableError);
  });

  it('keeps the idempotency conflict distinct from it', async () => {
    mockRecord.mockRejectedValue(new ServiceIdempotencyConflictError());
    const { wrapper } = harness();
    const { result } = await mount(() => useRecordPartUsage(7), wrapper);

    result.current.mutate({ quoteItemId: 21, quantity: 1, idempotencyKey: 'k1' });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeInstanceOf(ServiceIdempotencyConflictError);
    expect(result.current.error).not.toBeInstanceOf(ServiceStockUnavailableError);
  });

  it('does NOT invalidate anything when it failed', async () => {
    // Nothing moved. Refetching would only make the screen flicker while
    // proving the same numbers.
    mockRecord.mockRejectedValue(new ServiceStockUnavailableError());
    const { wrapper, invalidate } = harness();
    const { result } = await mount(() => useRecordPartUsage(7), wrapper);

    result.current.mutate({ quoteItemId: 21, quantity: 9, idempotencyKey: 'k1' });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(keys(invalidate)).not.toContain(
      JSON.stringify(queryKeys.internalInventoryRoot(SCOPE)),
    );
  });
});

describe('a stock write reaches the OTHER module', () => {
  it('invalidates the service subtree AND the inventory one', async () => {
    // A part off a shelf changes what Inventory would show for that branch.
    // Somebody holding both modules must not open Inventory to a number that
    // is one battery stale.
    mockRecord.mockResolvedValue({ id: 1 });
    const { wrapper, invalidate } = harness();
    const { result } = await mount(() => useRecordPartUsage(7), wrapper);

    result.current.mutate({ quoteItemId: 21, quantity: 1, idempotencyKey: 'k1' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(keys(invalidate)).toContain(
      JSON.stringify(queryKeys.internalServiceRoot(SCOPE)),
    );
    expect(keys(invalidate)).toContain(
      JSON.stringify(queryKeys.internalInventoryRoot(SCOPE)),
    );
  });

  it('does the same for a reversal, which also moves stock', async () => {
    mockReverse.mockResolvedValue({ id: 1 });
    const { wrapper, invalidate } = harness();
    const { result } = await mount(() => useReversePartUsage(7), wrapper);

    result.current.mutate({ usageId: 700 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(keys(invalidate)).toContain(
      JSON.stringify(queryKeys.internalInventoryRoot(SCOPE)),
    );
  });

  it('does NOT touch inventory for a write that moved no stock', async () => {
    // Starting a repair changes a lifecycle, not a shelf. Invalidating the
    // inventory module for it would train the app to refetch for nothing.
    mockStart.mockResolvedValue({ id: 1 });
    const { wrapper, invalidate } = harness();
    const { result } = await mount(() => useStartRepair(7), wrapper);

    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(keys(invalidate)).toContain(
      JSON.stringify(queryKeys.internalServiceRoot(SCOPE)),
    );
    expect(keys(invalidate)).not.toContain(
      JSON.stringify(queryKeys.internalInventoryRoot(SCOPE)),
    );
  });

  it('crosses the boundary with INVALIDATION only, never with data', async () => {
    // The service hook holds no inventory repository and reads no inventory
    // type. It marks the other cache dirty and lets that module fetch its own
    // numbers when somebody opens it.
    mockRecord.mockResolvedValue({ id: 1 });
    const { wrapper } = harness();
    const { result } = await mount(() => useRecordPartUsage(7), wrapper);

    result.current.mutate({ quoteItemId: 21, quantity: 1, idempotencyKey: 'k1' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const fs = jest.requireActual('fs') as { readFileSync(p: string, e: 'utf8'): string };
    const source = fs.readFileSync('src/hooks/use-internal-service.ts', 'utf8');
    expect(source).not.toMatch(/InventoryRepository|fetchInventory|BranchStock/);
  });
});

describe('reversing', () => {
  it('sends the usage and an optional reason', async () => {
    mockReverse.mockResolvedValue({ id: 1 });
    const { wrapper } = harness();
    const { result } = await mount(() => useReversePartUsage(7), wrapper);

    result.current.mutate({ usageId: 700, reason: 'Pieza equivocada.' });
    await waitFor(() => expect(mockReverse).toHaveBeenCalled());

    expect(mockReverse.mock.calls[0]!.slice(0, 3))
      .toEqual([7, 700, 'Pieza equivocada.']);
  });

  it('never retries either', async () => {
    mockReverse.mockRejectedValue(new Error('nope'));
    const { wrapper } = harness();
    const { result } = await mount(() => useReversePartUsage(7), wrapper);

    result.current.mutate({ usageId: 700 });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(mockReverse).toHaveBeenCalledTimes(1);
  });
});
