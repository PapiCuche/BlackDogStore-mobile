import { AuthUnavailableError } from '@/auth/auth-errors';
import { authRuntimePolicy, type AuthRuntimePolicy } from '@/auth/auth-policy';
import type { RefreshCoordinator } from '@/auth/refresh-coordinator';
import { accessTokenStore, type AccessTokenStore } from '@/auth/tokens/access-token-store';

import { assertBearerAllowed, type ApiScope } from './api-scope';
import { request, type RequestOptions } from './client';
import { ApiError } from './errors';

/**
 * Credential-bearing requests.
 *
 * Kept OUT of `client.ts` on purpose. The HTTP client is used by the public
 * catalogue and must stay small and obviously correct; token lifecycle, retry
 * and refresh coordination are a different concern with a different failure
 * surface. Merging them would mean every anonymous request carries the code
 * path that can sign a user out.
 *
 * ⚠️  INERT TODAY. There is no `/api/v1/` on `origin/master` `2624d478`, so
 * `authRuntimePolicy.mode` is never `'backend'` and every call here throws
 * `AuthUnavailableError` before touching the network. The logic is nonetheless
 * real and fully tested against `FakeAuthTransport` — the point of M1 is that
 * when the contract lands, this needs a transport, not a redesign.
 */

export type AuthenticatedRequestOptions = RequestOptions & {
  /** Must be `'authenticated-v1'`. Present so the caller states it explicitly. */
  scope: ApiScope;
};

export type AuthenticatedRequestDeps = {
  refreshCoordinator: RefreshCoordinator;
  accessTokens?: AccessTokenStore;
  policy?: AuthRuntimePolicy;
  /** Injectable so the pipeline can be tested without the real HTTP client. */
  send?: typeof request;
};

/**
 * Perform an authenticated request, refreshing at most once.
 *
 * The retry rules, and why each one is a rule:
 *
 *  - **401 → refresh once → retry once.** A 401 on the authenticated surface
 *    means the access token is stale, which is the one thing a refresh fixes.
 *  - **A second 401 is final.** The refresh succeeded and the server still says
 *    no, so the problem is not the token's age. Retrying again is an infinite
 *    loop with extra steps.
 *  - **403 never refreshes.** It means authenticated but not permitted. A
 *    refresh cannot grant permission, and rotating a token on every permission
 *    denial burns the refresh chain for nothing.
 *  - **Network failures never refresh.** Nothing was rejected; nothing needs
 *    rotating.
 *  - **A caller abort is propagated untouched.** A cancelled screen must not
 *    trigger a token rotation on its way out.
 */
export async function authenticatedRequest<T>(
  path: string,
  options: AuthenticatedRequestOptions,
  deps: AuthenticatedRequestDeps,
): Promise<T> {
  const policy = deps.policy ?? authRuntimePolicy;
  const accessTokens = deps.accessTokens ?? accessTokenStore;
  const send = deps.send ?? request;

  // Barrier one: no contract, no request. This is what keeps the pipeline inert
  // while BR-001 is unresolved.
  if (policy.mode !== 'backend') {
    throw new AuthUnavailableError();
  }

  // Barrier two: the token may only go to `/api/v1/`.
  assertBearerAllowed(path, options.scope);

  const { scope: _scope, ...requestOptions } = options;

  let token = accessTokens.get();
  if (!token) {
    // No usable access token: refresh before spending a round trip on a call
    // that would certainly 401.
    const outcome = await deps.refreshCoordinator.refresh();
    if (outcome.status !== 'refreshed') throw toError(outcome);
    token = outcome.accessToken;
  }

  try {
    return await send<T>(path, withBearer(requestOptions, token));
  } catch (error) {
    if (!shouldAttemptRefresh(error, options.signal)) throw error;

    const outcome = await deps.refreshCoordinator.refresh();
    if (outcome.status !== 'refreshed') throw toError(outcome);

    // The single retry. Any 401 from here propagates: the token is fresh, so a
    // rejection is about authorisation or state, not staleness.
    return send<T>(path, withBearer(requestOptions, outcome.accessToken));
  }
}

function withBearer(options: RequestOptions, token: string): RequestOptions {
  return {
    ...options,
    headers: { ...options.headers, Authorization: `Bearer ${token}` },
  };
}

/**
 * Whether this failure is the kind a refresh can fix.
 *
 * Deliberately narrow: only a 401, only when the caller did not cancel.
 */
function shouldAttemptRefresh(error: unknown, callerSignal: AbortSignal | undefined): boolean {
  if (callerSignal?.aborted) return false;
  if (!(error instanceof ApiError)) return false;
  // `kind === 'unauthorized'` covers 401 AND 403, so the status is checked
  // directly — 403 must never rotate a token.
  return error.status === 401;
}

function toError(outcome: { status: string; error?: Error }): Error {
  if (outcome.error) return outcome.error;
  return new AuthUnavailableError('Tu sesión no está disponible. Inicia sesión nuevamente.');
}
