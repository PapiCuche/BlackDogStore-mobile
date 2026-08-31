import type { AuthRepository } from './auth-repository';
import type { AuthSession, RegistrationDetails, SignInCredentials, UserProfile } from './types';

/**
 * A development-only stand-in for authentication.
 *
 * It accepts ANY well-formed credentials. That is the point: it lets the whole
 * app be navigated while the real contract is designed, and it is honest about
 * being fake — `mode` is `'mock'` and the UI shows a "Modo demo" badge.
 *
 * ⚠️  It is NOT self-gating. Whether this class may exist at all is decided by
 * `resolveAuthRepository` from `AuthRuntimePolicy`, and in production the answer
 * is always no. Putting the environment check inside the class would scatter
 * the rule; keeping it in the composition root means there is one place to
 * audit.
 *
 * What it deliberately never does:
 *   - talk to Django;
 *   - persist a session (a fake session must not survive a relaunch and be
 *     mistaken for a real one);
 *   - touch SecureStore or mint a token-shaped string. Writing a fake token
 *     would train the codebase — and its tests — to expect a shape that may
 *     turn out to be wrong, and would put a credential-looking value into the
 *     Keychain for no reason.
 */
export class MockAuthRepository implements AuthRepository {
  async restoreSession(): Promise<AuthSession | null> {
    // Always null. See the class comment: no persistence, by design.
    return null;
  }

  async signIn(credentials: SignInCredentials): Promise<AuthSession> {
    // `credentials.password` is read by nothing. It is not stored, not hashed,
    // not echoed back on the session, and not logged.
    return buildMockSession(credentials.identifier);
  }

  async register(details: RegistrationDetails): Promise<AuthSession> {
    return buildMockSession(details.email, details.firstName);
  }

  async signOut(): Promise<void> {
    // Nothing to clear: this implementation persists nothing.
  }
}

function buildMockSession(identifier: string, firstName?: string): AuthSession {
  const localPart = identifier.split('@')[0] || 'invitado';
  const user: UserProfile = {
    id: 0,
    username: localPart,
    email: identifier.includes('@') ? identifier : `${localPart}@example.com`,
    // Capitalised so the Home greeting reads naturally instead of showing a
    // raw handle.
    firstName: firstName?.trim() || localPart.charAt(0).toUpperCase() + localPart.slice(1),
    lastName: '',
    role: 'customer',
    isEmailVerified: true,
  };

  return {
    user,
    mode: 'mock',
    expiresAt: null,
    // No tenant: a mock session has no server-validated company context, and
    // inventing one would be exactly the "slug equals authority" mistake the
    // tenant model exists to prevent.
    tenant: null,
  };
}
