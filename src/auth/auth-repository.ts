import type { AuthSession, RegistrationDetails, SignInCredentials } from './types';

/**
 * The seam between the app's session handling and however authentication ends
 * up working.
 *
 * Kept deliberately small — four operations, no token plumbing in the
 * signatures. Whether a token exists, where it is stored and how it is
 * refreshed is an implementation concern; leaking it into this interface would
 * bake today's cookie-shaped assumptions into tomorrow's native contract.
 */
export type AuthRepository = {
  /** Rehydrate a persisted session on cold start. Null when there is none. */
  restoreSession(): Promise<AuthSession | null>;
  signIn(credentials: SignInCredentials): Promise<AuthSession>;
  register(details: RegistrationDetails): Promise<AuthSession>;
  signOut(): Promise<void>;
};
