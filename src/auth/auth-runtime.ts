import { createRefreshCoordinator, type RefreshCoordinator } from './refresh-coordinator';
import { accessTokenStore } from './tokens/access-token-store';
import { createSecureCredentialVault, type CredentialVault } from './tokens/credential-vault';
import {
  createDjangoAuthTransport,
  type DjangoAuthTransport,
} from './transport/django-auth-transport';

/**
 * The ONE token graph this app has.
 *
 * ⚠️  THIS EXISTS BECAUSE M3 SHIPPED A BUG.
 *
 * `buildApiAuthRepository()` constructed its own `createMemoryAccessTokenStore()`
 * while `authenticatedRequest` read from the module-level `accessTokenStore`
 * singleton. Two stores: sign-in installed a token into one, and every
 * authenticated request looked in the other and found nothing.
 *
 * It was invisible in M3 because no authenticated request existed yet. M4 is
 * the first phase that makes one, which is exactly when it would have surfaced
 * — as "logged in, but every private screen is empty".
 *
 * So the graph is assembled ONCE, here, and everything that needs a piece of it
 * asks for it rather than building its own:
 *
 *   vault           the Keychain entry holding the refresh token
 *   accessTokens    the shared in-memory access token
 *   transport       /api/v1/auth/
 *   coordinator     single-flight refresh over the three above
 *
 * Two coordinators over one Keychain entry would rotate the refresh token
 * against each other: the server blacklists on rotation, so the second one to
 * arrive presents a dead token and the session ends.
 *
 * Built LAZILY. A module-scope instance would reach for `expo-secure-store` at
 * import time in every test that touches this file.
 */
export type AuthRuntime = {
  transport: DjangoAuthTransport;
  vault: CredentialVault;
  accessTokens: typeof accessTokenStore;
  coordinator: RefreshCoordinator;
};

let runtime: AuthRuntime | null = null;

export function getAuthRuntime(): AuthRuntime {
  if (runtime === null) {
    const transport = createDjangoAuthTransport();
    const vault = createSecureCredentialVault();
    // THE SHARED SINGLETON, not a fresh store. See the note above.
    const accessTokens = accessTokenStore;
    runtime = {
      transport,
      vault,
      accessTokens,
      coordinator: createRefreshCoordinator({ transport, vault, accessTokens }),
    };
  }
  return runtime;
}

/** Drop the cached graph. Tests only — production has exactly one. */
export function resetAuthRuntime(): void {
  runtime = null;
}
