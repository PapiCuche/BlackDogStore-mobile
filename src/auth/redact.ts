/**
 * Redaction for anything that might carry a credential.
 *
 * The rule this file enforces: a token must never reach a log, an error
 * message, a crash report or a serialized object. That is not paranoia — an
 * access token in a Metro log is a token in a screen recording, and a refresh
 * token in a crash payload is a token in a third-party service.
 *
 * There is deliberately no "log the token in development" escape hatch:
 * development is where screen shares and pasted logs happen.
 */

/** Header names whose value must never be printed, lower-cased for lookup. */
const SENSITIVE_HEADERS = new Set(['authorization', 'cookie', 'set-cookie', 'x-csrftoken']);

const SENSITIVE_KEYS = new Set([
  'access',
  'accesstoken',
  'access_token',
  'refresh',
  'refreshtoken',
  'refresh_token',
  'token',
  'password',
  'newpassword',
  'new_password',
  'authorization',
]);

/**
 * Render a secret as a non-reversible marker.
 *
 * Shows only a length hint. Deliberately NOT a prefix/suffix preview: for a JWT
 * the prefix is a constant header and the suffix is signature bytes, so a
 * "safe-looking" `eyJhbG…xY2` still leaks structure and helps an attacker
 * confirm they have the right value.
 */
export function redactSecret(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) return '[redacted]';
  return `[redacted:${value.length}]`;
}

/** Copy of `headers` with every credential-bearing value replaced. */
export function redactHeaders(headers: Record<string, string> = {}): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    safe[key] = SENSITIVE_HEADERS.has(key.toLowerCase()) ? redactSecret(value) : value;
  }
  return safe;
}

/**
 * Deep-redact an arbitrary payload before it is logged or attached to an error.
 *
 * Matches on key NAME rather than on value shape, because a token is just a
 * string and any heuristic on the value would miss the next format.
 */
export function redactPayload(input: unknown, depth = 0): unknown {
  if (depth > 4) return '[truncated]';
  if (Array.isArray(input)) return input.map((item) => redactPayload(item, depth + 1));
  if (typeof input !== 'object' || input === null) return input;

  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    safe[key] = SENSITIVE_KEYS.has(key.toLowerCase().replace(/[-\s]/g, ''))
      ? redactSecret(value)
      : redactPayload(value, depth + 1);
  }
  return safe;
}

/**
 * A one-line, token-free description of an auth failure.
 *
 * Use this instead of `String(error)` or `JSON.stringify(error)` anywhere a
 * failure is reported — including the future crash reporter. `error.cause` is
 * deliberately not walked: it is the most likely place for a raw request object
 * carrying an `Authorization` header to be hiding.
 */
export function describeAuthError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return 'UnknownAuthError';
}
