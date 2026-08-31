/**
 * Hard limits and forbidden inputs for incoming links.
 *
 * Everything here is about a URL being ATTACKER-CONTROLLED. An incoming link
 * arrives from an email, a QR code, another app, or a web page — none of which
 * this app trusts. So it gets bounded before it becomes state, and inspected
 * before it becomes navigation.
 */

/**
 * Longest URL we will even look at.
 *
 * A link of several hundred kilobytes must not become app state, a log line, a
 * route parameter or a cache key. 2 KB is far beyond any legitimate product
 * slug or order id and small enough to be harmless.
 */
export const MAX_URL_LENGTH = 2048;

/** Longest accepted identifier or slug inside a link. */
export const MAX_IDENTIFIER_LENGTH = 128;

/**
 * Schemes that must never be treated as an internal navigation intent.
 *
 * `javascript:` and `data:` are code-execution vectors; `file:` reads the
 * device; `intent:` is an Android redirection primitive. None of them can
 * legitimately address a screen in this app.
 */
export const DANGEROUS_SCHEMES = ['javascript', 'data', 'file', 'intent', 'blob', 'vbscript'];

/**
 * Query parameter names that make a link suspect.
 *
 * Two separate jobs:
 *
 *  1. **Open-redirect names** (`next`, `redirect`, `returnurl`…). This app never
 *     navigates to a destination supplied by a query parameter, so their mere
 *     presence means the link was built for a different, redirect-following
 *     application — and honouring it would be the classic open redirect.
 *  2. **Credential names** (`token`, `access_token`, `password`…). A session
 *     credential must never travel in a URL: URLs land in browser history,
 *     server logs, Referer headers and screenshots. A link carrying one is
 *     refused outright rather than stripped, because accepting it would teach
 *     whoever generated it that the pattern works.
 *
 * The future opaque tracking credential (BR-008) is deliberately NOT on this
 * list: it is a different kind of secret with a different contract, and it is
 * handled by its own recognised-but-not-honoured intent.
 */
export const FORBIDDEN_PARAM_NAMES = [
  // open redirect
  'next',
  'redirect',
  'redirect_uri',
  'redirecturl',
  'returnurl',
  'return_to',
  'continue',
  'url',
  'callback',
  // credentials
  'token',
  'access_token',
  'accesstoken',
  'refresh_token',
  'refreshtoken',
  'id_token',
  'password',
  'passwd',
  'pwd',
  'secret',
  'authorization',
  'auth',
  'apikey',
  'api_key',
  'session',
  'jwt',
];

/** Normalise a parameter name for comparison: case and separators are noise. */
function normaliseParamName(name: string): string {
  return name.toLowerCase().replace(/[-_\s]/g, '');
}

const FORBIDDEN_NORMALISED = new Set(FORBIDDEN_PARAM_NAMES.map(normaliseParamName));

export function isForbiddenParamName(name: string): boolean {
  return FORBIDDEN_NORMALISED.has(normaliseParamName(name));
}

/**
 * Whether any parameter in the URL is forbidden.
 *
 * Reads the RAW query string rather than a parsed map, because a duplicated
 * parameter (`?id=1&token=x`) can be collapsed away by a parser that keeps only
 * the first or last occurrence — and the one it discards is exactly the one we
 * needed to see.
 */
export function hasForbiddenParams(rawQuery: string): boolean {
  if (!rawQuery) return false;
  const query = rawQuery.startsWith('?') ? rawQuery.slice(1) : rawQuery;
  for (const pair of query.split('&')) {
    if (!pair) continue;
    const name = pair.split('=')[0] ?? '';
    let decoded = name;
    try {
      decoded = decodeURIComponent(name);
    } catch {
      // Malformed encoding: judge the raw name rather than giving up, so a
      // broken escape cannot smuggle a forbidden name past the check.
    }
    if (isForbiddenParamName(decoded)) return true;
  }
  return false;
}

/**
 * Fully decode a path segment, then decide whether it is safe.
 *
 * Decoding is REPEATED because `%252e%252e` decodes once to `%2e%2e` and only
 * twice to `..`. A single pass is the standard way this check gets bypassed.
 * Three passes is far past anything legitimate, and the loop exits early when
 * decoding stops changing the value.
 */
export function safelyDecode(segment: string): string | null {
  let current = segment;
  for (let pass = 0; pass < 3; pass += 1) {
    let next: string;
    try {
      next = decodeURIComponent(current);
    } catch {
      // Invalid percent-encoding. Refuse rather than guess at the intent.
      return null;
    }
    if (next === current) break;
    current = next;
  }
  return current;
}

/**
 * Whether a decoded segment is a plausible identifier or slug.
 *
 * An allowlist, not a denylist: letters, digits, hyphen, underscore and dot.
 * That covers every slug and id this domain actually produces
 * (`iphone-15-pro-256`, `r-1042`, `1042`) and excludes slashes, traversal,
 * control characters, whitespace and anything non-ASCII — so no clever encoding
 * has to be enumerated to be blocked.
 */
const IDENTIFIER_PATTERN = /^[A-Za-z0-9._-]+$/;

export function isSafeIdentifier(value: string | null | undefined): value is string {
  if (!value) return false;
  if (value.length > MAX_IDENTIFIER_LENGTH) return false;
  if (!IDENTIFIER_PATTERN.test(value)) return false;
  // Belt and braces: `.` and `..` pass the character class but are traversal.
  if (value === '.' || value === '..') return false;
  return true;
}

/**
 * A log-safe description of an incoming link.
 *
 * The raw URL is NEVER returned. A link may carry a verification token, a
 * password-reset token or a future tracking credential, and a log line is
 * forever — it reaches crash reports, screen recordings and pasted terminal
 * output. Only the classification is safe to keep.
 */
export function describeLink(result: { ok: boolean; kind?: string; reason?: string }): string {
  return result.ok
    ? `incoming-link kind=${result.kind ?? 'unknown'} valid=true`
    : `incoming-link valid=false reason=${result.reason ?? 'unknown'}`;
}
