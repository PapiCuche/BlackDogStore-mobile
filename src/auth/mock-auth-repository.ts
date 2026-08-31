import type { Customer } from '@/domain/customers/types';

import type { AuthRepository } from './auth-repository';
import type { AuthSession, RegistrationDetails, SignInCredentials } from './types';

/**
 * A development-only stand-in for authentication.
 *
 * It accepts ANY well-formed credentials and returns a session. That is the
 * point: it lets the whole app be navigated while the real contract is being
 * designed, and it is honest about being fake — `mode` is `'mock'` and the UI
 * says so.
 *
 * What it deliberately does NOT do:
 *   - talk to Django,
 *   - persist anything (a mock session must not survive a relaunch and be
 *     mistaken for a real one),
 *   - touch SecureStore. There is no token here to store, and writing a fake
 *     one would train the codebase to expect a shape that may not be right.
 */
export class MockAuthRepository implements AuthRepository {
  async restoreSession(): Promise<AuthSession | null> {
    // Intentionally always null on cold start. See the class comment.
    return null;
  }

  async signIn(credentials: SignInCredentials): Promise<AuthSession> {
    return buildMockSession(credentials.email);
  }

  async register(details: RegistrationDetails): Promise<AuthSession> {
    return buildMockSession(details.email, details.firstName);
  }

  async signOut(): Promise<void> {
    // Nothing to clear: this implementation deliberately persists nothing.
  }
}

function buildMockSession(email: string, firstName?: string): AuthSession {
  const localPart = email.split('@')[0] ?? 'invitado';
  const customer: Customer = {
    id: 0,
    username: localPart,
    email,
    // Capitalise the local part so the Home greeting reads naturally rather
    // than showing a raw handle.
    firstName: firstName?.trim() || localPart.charAt(0).toUpperCase() + localPart.slice(1),
    lastName: '',
    role: 'customer',
    isEmailVerified: true,
  };
  return { customer, mode: 'mock', expiresAt: null };
}
