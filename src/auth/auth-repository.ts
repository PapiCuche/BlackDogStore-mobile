import type { AuthSession, RegistrationDetails, SignInCredentials } from './types';

/**
 * The seam between session handling and however authentication works.
 *
 * Deliberately small — four operations, and NO token anywhere in the
 * signatures. Whether a token exists, where it is stored and how it rotates is
 * an implementation concern; hoisting it here would bake one transport's
 * assumptions into every caller.
 *
 * A repository returns a SESSION, never credentials. The credentials never
 * leave the token layer.
 */
export type AuthRepository = {
  /**
   * Re-establish a session on cold start, or null when there is none.
   *
   * The future backend implementation reads the persisted refresh token and
   * exchanges it for a fresh access token. The mock deliberately returns null.
   */
  restoreSession(): Promise<AuthSession | null>;
  signIn(credentials: SignInCredentials): Promise<AuthSession>;
  register(details: RegistrationDetails): Promise<AuthSession>;
  /** Clear local credentials first, then best-effort server revocation. */
  signOut(): Promise<void>;
};
