import { useMemo } from 'react';

import { useAuth } from '@/auth/auth-provider';
import { companySlug } from '@/config/env';

import { makeQueryScope, type QueryScope } from './query-scope';

/**
 * The cache namespace for the current build and session.
 *
 * Tenant comes from build configuration; user comes from the session, and only
 * once there IS a session. Before sign-in the scope is anonymous, so a signed-in
 * user's data can never share a key with the pre-login state.
 *
 * The user id is the stable numeric id, never the email — an email changes, and
 * it would put a personal identifier into every cache key.
 */
export function useQueryScope(): QueryScope {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  return useMemo(
    () => makeQueryScope({ tenantSlug: companySlug, userId }),
    [userId],
  );
}

/**
 * The cache namespace for PUBLIC tenant data, with no session involved.
 *
 * `scopePrefix(scope, 'public')` never reads `scope.user`, so a public key is
 * identical signed in or out. That makes this hook exactly as correct as
 * `useQueryScope` for public data — and it does not need `AuthProvider`, which
 * is what lets the THEME read the tenant's brand: the theme provider sits above
 * auth in the tree, because auth renders using the theme.
 */
export function usePublicQueryScope(): QueryScope {
  return useMemo(() => makeQueryScope({ tenantSlug: companySlug, userId: null }), []);
}
