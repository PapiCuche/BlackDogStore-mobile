import { companySlug } from '@/config/env';

import {
  DANGEROUS_SCHEMES,
  MAX_URL_LENGTH,
  hasForbiddenParams,
  isSafeIdentifier,
  safelyDecode,
} from './security';
import type { DeepLinkParseResult } from './types';

/**
 * Turn an untrusted URL into a validated intent, or refuse it.
 *
 * A PURE FUNCTION. No navigation, no fetching, no state — which is what makes
 * every hostile input below testable without a simulator.
 *
 * The design is an ALLOWLIST. Only four route shapes are recognised; everything
 * else is rejected. A denylist would need to anticipate every hostile path, and
 * the one nobody anticipated is the one that gets used.
 */

/** The app's own scheme. Pilot/development entry point — see DEC-MOBILE-005. */
export const APP_SCHEME = 'blackdogstore';

/**
 * Hosts accepted on an `https://` link.
 *
 * EMPTY ON PURPOSE. No production domain exists yet, and inventing one would
 * mean shipping a parser that trusts a host nobody controls. Until BR-008 and
 * the association files exist, every https link is refused as
 * `unsupported-host`. See docs/LINKING_STRATEGY.md.
 */
export const TRUSTED_HTTPS_HOSTS: readonly string[] = [];

/**
 * Parse an incoming URL.
 *
 * Order of checks is deliberate: cheapest and most dangerous first, so a
 * hostile input is discarded before anything expensive touches it.
 */
export function parseDeepLink(rawUrl: unknown): DeepLinkParseResult {
  if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) {
    return { ok: false, reason: 'malformed' };
  }

  // Bound the input before it becomes anything else.
  if (rawUrl.length > MAX_URL_LENGTH) {
    return { ok: false, reason: 'oversized' };
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  const scheme = url.protocol.replace(/:$/, '').toLowerCase();

  // Refuse code-execution and device-access schemes explicitly, ahead of the
  // allowlist, so the reason reported is the accurate one.
  if (DANGEROUS_SCHEMES.includes(scheme)) {
    return { ok: false, reason: 'unsupported-scheme' };
  }

  let pathname: string;

  if (scheme === APP_SCHEME) {
    // `blackdogstore://products/abc` parses the first segment as the HOST,
    // because a custom scheme has no authority component. Re-joining host and
    // pathname is what makes `//products/abc` and `///products/abc` behave the
    // same way.
    pathname = `${url.hostname}${url.pathname}`;
  } else if (scheme === 'https') {
    const host = url.hostname.toLowerCase();
    if (!TRUSTED_HTTPS_HOSTS.includes(host)) {
      return { ok: false, reason: 'unsupported-host' };
    }
    pathname = url.pathname;
  } else {
    return { ok: false, reason: 'unsupported-scheme' };
  }

  // Checked against the RAW query: a parsed map can collapse a duplicated
  // parameter and hide the very one that matters.
  if (hasForbiddenParams(url.search)) {
    return { ok: false, reason: 'forbidden-parameter' };
  }

  // A company named in the link is a HINT, never authority — it may only
  // confirm the tenant this build is already configured for.
  const tenantHint = url.searchParams.get('company');
  if (tenantHint !== null) {
    const decoded = safelyDecode(tenantHint);
    if (!isSafeIdentifier(decoded)) return { ok: false, reason: 'invalid-parameter' };
    if (companySlug === null || decoded.toLowerCase() !== companySlug.toLowerCase()) {
      return { ok: false, reason: 'tenant-mismatch' };
    }
  }

  const segments = pathname.split('/').filter((segment) => segment.length > 0);
  if (segments.length === 0) return { ok: false, reason: 'unknown-route' };

  const [route, rawIdentifier, ...rest] = segments;

  // Exactly two segments. A trailing segment means a route we do not model, and
  // guessing at it is how an unintended screen becomes reachable.
  if (rest.length > 0) return { ok: false, reason: 'unknown-route' };

  switch (route) {
    case 'products': {
      const slug = decodeIdentifier(rawIdentifier);
      if (!slug) return { ok: false, reason: 'invalid-parameter' };
      return { ok: true, intent: { kind: 'product', slug } };
    }
    case 'orders': {
      const orderId = decodeIdentifier(rawIdentifier);
      if (!orderId) return { ok: false, reason: 'invalid-parameter' };
      return { ok: true, intent: { kind: 'order', orderId } };
    }
    case 'repairs': {
      const repairId = decodeIdentifier(rawIdentifier);
      if (!repairId) return { ok: false, reason: 'invalid-parameter' };
      return { ok: true, intent: { kind: 'repair', repairId } };
    }
    case 'track': {
      // RECOGNISED, NOT HONOURED. The token is deliberately never read, never
      // stored and never forwarded: no backend contract exists (BR-008), so
      // there is nothing that could validate it. Classifying it beats letting
      // it fall through to `unknown-route`, which would lose the distinction
      // between "we do not support this" and "we do not support this YET".
      if (!rawIdentifier) return { ok: false, reason: 'invalid-parameter' };
      return { ok: true, intent: { kind: 'tracking' } };
    }
    default:
      return { ok: false, reason: 'unknown-route' };
  }
}

/** Decode one path segment and accept it only if it is a safe identifier. */
function decodeIdentifier(segment: string | undefined): string | null {
  if (!segment) return null;
  const decoded = safelyDecode(segment);
  return isSafeIdentifier(decoded) ? decoded : null;
}
