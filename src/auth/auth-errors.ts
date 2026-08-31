/**
 * Typed authentication failures.
 *
 * These exist because auth decisions branch on WHY something failed, and a
 * string comparison is the wrong tool for a decision that controls whether a
 * user's credentials get wiped. "El refresh no sirve" and "no hay red" look
 * identical in a message and must produce opposite behaviour.
 *
 * None of them ever carries a token. See `redact.ts`.
 */

/** No authentication mechanism exists in this build. */
export class AuthUnavailableError extends Error {
  constructor(message = 'La autenticación no está disponible en esta versión.') {
    super(message);
    this.name = 'AuthUnavailableError';
  }
}

/**
 * The server refused the refresh token: invalid, expired or blacklisted.
 *
 * This is TERMINAL. The credentials are worthless, so they are cleared and the
 * user is signed out. Keeping them would produce a zombie session that retries
 * forever against a token the server has already rejected.
 */
export class RefreshRejectedError extends Error {
  readonly reason: 'invalid' | 'expired' | 'blacklisted' | 'unknown';

  constructor(reason: RefreshRejectedError['reason'] = 'unknown') {
    super('La sesión expiró. Vuelve a iniciar sesión.');
    this.name = 'RefreshRejectedError';
    this.reason = reason;
  }
}

/**
 * The refresh could not be attempted or completed because of the network.
 *
 * NOT terminal, and the distinction matters: wiping a perfectly valid refresh
 * token because someone walked into a lift would sign them out for no reason.
 * The credentials are kept and the session goes `temporarily-unavailable`.
 */
export class RefreshNetworkError extends Error {
  constructor(message = 'No se pudo verificar tu sesión. Revisa tu conexión.') {
    super(message);
    this.name = 'RefreshNetworkError';
  }
}

/**
 * The Keychain/Keystore could not be read or written.
 *
 * Surfaced rather than swallowed. During a token rotation a failed WRITE is a
 * genuine emergency: the server has already invalidated the previous refresh
 * token, so a client that cannot persist the new one holds nothing usable and
 * must be signed out rather than left believing it is still authenticated.
 */
export class CredentialStorageError extends Error {
  readonly operation: 'read' | 'write' | 'delete';

  constructor(operation: CredentialStorageError['operation'], cause?: unknown) {
    super(`No se pudo ${operation === 'read' ? 'leer' : operation === 'write' ? 'guardar' : 'borrar'} las credenciales de forma segura.`);
    this.name = 'CredentialStorageError';
    this.operation = operation;
    this.cause = cause;
  }
}

/** Every auth error this module can produce. */
export type AuthError =
  | AuthUnavailableError
  | RefreshRejectedError
  | RefreshNetworkError
  | CredentialStorageError;

export function isAuthError(error: unknown): error is AuthError {
  return (
    error instanceof AuthUnavailableError ||
    error instanceof RefreshRejectedError ||
    error instanceof RefreshNetworkError ||
    error instanceof CredentialStorageError
  );
}
