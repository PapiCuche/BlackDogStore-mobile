import { ApiError } from '@/api/errors';
import { AuthUnavailableError, RefreshRejectedError } from '@/auth/auth-errors';
import { BearerScopeViolationError } from '@/api/api-scope';
import { createQueryClient } from '@/providers/query-client';
import {
  MAX_QUERY_RETRIES,
  MUTATION_RETRY,
  queryRetryDelay,
  shouldRetryQuery,
} from '@/providers/retry-policy';
import { FeatureUnavailableError } from '@/repositories/errors';

/**
 * M1.1 — retry only what a later attempt could plausibly fix.
 *
 * Everything else burns battery, rate limit and the user's data allowance to
 * arrive at the same answer.
 */

describe('shouldRetryQuery — terminal failures', () => {
  it.each([
    ['400 validation', new ApiError('validation', 'no', { status: 400 })],
    ['401 unauthorized', new ApiError('unauthorized', 'no', { status: 401 })],
    ['403 forbidden', new ApiError('unauthorized', 'no', { status: 403 })],
    ['404 not found', new ApiError('not_found', 'no', { status: 404 })],
    ['429 rate limited', new ApiError('rate_limited', 'no', { status: 429 })],
    ['unconfigured base url', new ApiError('not_configured', 'no')],
  ])('never retries %s', (_label, error) => {
    expect(shouldRetryQuery(0, error)).toBe(false);
  });

  it.each([
    ['feature unavailable', new FeatureUnavailableError('repairs', 'no backend')],
    ['auth unavailable', new AuthUnavailableError()],
    ['refresh rejected', new RefreshRejectedError('blacklisted')],
    ['bearer scope violation', new BearerScopeViolationError('/api/products/', 'authenticated-v1')],
  ])('never retries %s', (_label, error) => {
    // None of these becomes true by asking again.
    expect(shouldRetryQuery(0, error)).toBe(false);
  });

  it('never retries a caller abort', () => {
    const abort = new Error('Aborted');
    abort.name = 'AbortError';
    // The user navigated away; retrying resurrects work nobody wants.
    expect(shouldRetryQuery(0, abort)).toBe(false);
  });

  it('does not retry an error it cannot classify', () => {
    // An unclassified failure is not evidence of a transient one.
    expect(shouldRetryQuery(0, new Error('¿?'))).toBe(false);
    expect(shouldRetryQuery(0, 'a string')).toBe(false);
  });
});

describe('shouldRetryQuery — transient failures', () => {
  it.each([
    ['timeout', new ApiError('timeout', 'lento')],
    ['offline', new ApiError('offline', 'sin red')],
    ['500 server', new ApiError('server', 'boom', { status: 500 })],
  ])('retries %s', (_label, error) => {
    expect(shouldRetryQuery(0, error)).toBe(true);
    expect(shouldRetryQuery(1, error)).toBe(true);
  });

  it('stops at the retry ceiling', () => {
    const error = new ApiError('timeout', 'lento');
    expect(shouldRetryQuery(MAX_QUERY_RETRIES, error)).toBe(false);
    expect(shouldRetryQuery(MAX_QUERY_RETRIES + 5, error)).toBe(false);
  });

  it('caps total attempts at three', () => {
    expect(MAX_QUERY_RETRIES).toBe(2);
  });
});

describe('queryRetryDelay', () => {
  it('backs off and then plateaus', () => {
    expect(queryRetryDelay(0)).toBe(1000);
    expect(queryRetryDelay(1)).toBe(2000);
    expect(queryRetryDelay(2)).toBe(4000);
    expect(queryRetryDelay(10)).toBe(8000);
  });

  it('is deterministic, so timing assertions stay stable', () => {
    // No jitter: with at most two retries on one device it buys almost nothing
    // and would make the suite flaky.
    expect(queryRetryDelay(1)).toBe(queryRetryDelay(1));
  });
});

describe('mutations', () => {
  it('never retry automatically', () => {
    // A query is a question; asking twice is harmless. A mutation is an action,
    // and a retry after an ambiguous failure can perform it twice.
    expect(MUTATION_RETRY).toBe(false);
  });

  it('is what the client is configured with', () => {
    const client = createQueryClient();
    expect(client.getDefaultOptions().mutations?.retry).toBe(false);
  });
});

describe('query client defaults', () => {
  it('uses the shared retry policy', () => {
    const client = createQueryClient();
    expect(client.getDefaultOptions().queries?.retry).toBe(shouldRetryQuery);
  });

  it('revalidates on focus and on reconnect', () => {
    // Both are driven from real signals — AppState and connectivity — by the
    // lifecycle bridges. Without those, this configuration would be dead.
    const options = createQueryClient().getDefaultOptions().queries;
    expect(options?.refetchOnWindowFocus).toBe(true);
    expect(options?.refetchOnReconnect).toBe(true);
  });

  it('keeps a bounded cache rather than an infinite one', () => {
    const options = createQueryClient().getDefaultOptions().queries;
    expect(options?.gcTime).toBe(5 * 60_000);
    expect(options?.staleTime).toBe(60_000);
  });
});
