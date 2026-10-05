import type { RefreshCoordinator } from '@/auth/refresh-coordinator';
import { accessTokenStore, type AccessTokenStore } from '@/auth/tokens/access-token-store';

import { ApiError } from './errors';

/**
 * The Authorization header an IMAGE request needs.
 *
 * Private media on this backend is served by a content route that re-checks
 * company, ownership, visibility and voiding on every call — never by a signed
 * URL, because a signed URL would make the bucket the security boundary and a
 * bucket does not know who is asking. So the image loader has to send a Bearer
 * token like any other authenticated request.
 *
 * WHY THE TOKEN IS MADE GOOD FIRST. An `<Image>` cannot retry a 401 the way
 * `authenticatedRequest` does: there is no interception point between the
 * native loader and the server. So this refreshes BEFORE handing the header
 * out, in the same order the JSON pipeline uses after a failure.
 *
 * Nothing here persists the token. It is read from the in-memory store, handed
 * to one image source, and that is all — the query cache that holds it is
 * memory-only by decision (DEC-MOBILE-003).
 */
export async function resolveImageAuthorization(deps: {
  refreshCoordinator: RefreshCoordinator;
  accessTokens?: AccessTokenStore;
}): Promise<string> {
  const accessTokens = deps.accessTokens ?? accessTokenStore;
  const existing = accessTokens.get();
  if (existing) return `Bearer ${existing}`;

  const outcome = await deps.refreshCoordinator.refresh();
  if (outcome.status !== 'refreshed') {
    throw new ApiError('unauthorized', 'La sesión expiró.', { status: 401 });
  }
  return `Bearer ${outcome.accessToken}`;
}
