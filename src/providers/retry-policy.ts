import { ApiError } from '@/api/errors';

/**
 * When a failed query is worth trying again.
 *
 * Written as a pure function, separate from the QueryClient, because "did we
 * retry this?" is a behaviour worth asserting directly rather than inferring
 * from a client config object.
 *
 * The governing idea: retry only failures that a LATER ATTEMPT COULD PLAUSIBLY
 * FIX. Everything else is burning battery, rate limit and the user's data
 * allowance to arrive at the same answer.
 */

/** At most two retries — three attempts total. */
export const MAX_QUERY_RETRIES = 2;

/** Error names that are terminal by construction, whatever the transport says. */
const TERMINAL_ERROR_NAMES = new Set([
  // A feature with no backend will not grow one between attempts.
  'FeatureUnavailableError',
  // Auth is unavailable in this build. Retrying cannot change the policy.
  'AuthUnavailableError',
  // The refresh token is dead. A retry would present the same dead token.
  'RefreshRejectedError',
  // A programming error: the caller aimed a Bearer at the wrong surface.
  'BearerScopeViolationError',
  // This build has no tenant configured, so there is no storefront to ask for.
  // A retry would ask the same unanswerable question.
  'MissingTenantError',
  // The caller navigated away. Retrying would resurrect work nobody wants.
  'AbortError',
]);

/**
 * Whether to retry.
 *
 * | Failure | Retry | Why |
 * |---|---|---|
 * | 400 / validation | no | The payload will not become valid on its own |
 * | 401 | no | Token refresh is the pipeline's job, not the retry loop's |
 * | 403 | no | Permission does not appear by asking twice |
 * | 404 | no | It is still not there |
 * | 429 | **no** | Retrying a throttle makes the throttle worse. Honouring `Retry-After` needs it plumbed through `ApiError` first — see the debt note in OFFLINE_STRATEGY.md |
 * | timeout | yes | The server may simply have been slow |
 * | offline / network | yes | The radio may come back |
 * | 5xx | yes | Server-side transient |
 * | not_configured | no | A missing base URL is a build problem |
 * | unknown | no | If we cannot classify it, we cannot claim it is transient |
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_QUERY_RETRIES) return false;

  if (error instanceof Error && TERMINAL_ERROR_NAMES.has(error.name)) return false;

  if (error instanceof ApiError) {
    // `isRetryable` already encodes offline / timeout / server.
    return error.isRetryable;
  }

  // Deliberately conservative: an unclassified error is not evidence of a
  // transient one.
  return false;
}

/**
 * Backoff between attempts: 1 s, then 2 s, capped at 8 s.
 *
 * No jitter. Jitter matters when many clients retry a struggling server in
 * lockstep; with at most two retries per query on one device it buys almost
 * nothing, and it would make every timing assertion in the suite flaky.
 */
export function queryRetryDelay(attemptIndex: number): number {
  return Math.min(1000 * 2 ** attemptIndex, 8000);
}

/**
 * Mutations never retry automatically.
 *
 * A query is a question and asking twice is harmless. A mutation is an action,
 * and a retry after an ambiguous failure can perform it twice — an order placed
 * twice, a repair approved twice. Retries for mutations need idempotency keys
 * from the backend first.
 */
export const MUTATION_RETRY = false as const;
