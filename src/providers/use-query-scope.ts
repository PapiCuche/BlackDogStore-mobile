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
