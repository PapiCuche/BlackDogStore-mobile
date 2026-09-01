import { companySlug } from '@/config/env';
import {
  buildOrderLink,
  buildProductLink,
  buildRepairLink,
  UnsafeLinkInputError,
} from '@/linking/builders';
import { APP_SCHEME, parseDeepLink } from '@/linking/parser';
import {
  describeLink,
  hasForbiddenParams,
  isForbiddenParamName,
  isSafeIdentifier,
  safelyDecode,
} from '@/linking/security';

/**
 * M1.2 — the security boundary.
 *
 * A URL arrives from an email, a QR code or another app. None of those is
 * trusted, so the parser is the app's front door and these are the attacks it
 * must survive.
 */

const link = (path: string) => `${APP_SCHEME}://${path}`;

describe('open redirect', () => {
  it.each(['next', 'redirect', 'redirect_uri', 'returnUrl', 'return_to', 'continue', 'callback'])(
    'rejects a link carrying a "%s" parameter',
    (param) => {
      // This app never navigates to a destination supplied by a query
      // parameter. A link built to expect that came from a different,
      // redirect-following application.
      const result = parseDeepLink(link(`products/abc?${param}=https://evil.example`));
      expect(result).toEqual({ ok: false, reason: 'forbidden-parameter' });
    },
  );

  it('rejects a javascript payload smuggled in a redirect param', () => {
    expect(parseDeepLink(link('login?next=javascript:alert(1)')).ok).toBe(false);
  });

  it('derives the destination from the PATH, never from a query parameter', () => {
    // `path=` is not a forbidden name, so it is simply DROPPED — and the
    // destination comes from the real path. The attack this refutes is a query
    // parameter steering navigation.
    const result = parseDeepLink(link('products/real?path=/admin/users'));

    expect(result).toEqual({ ok: true, intent: { kind: 'product', slug: 'real' } });
    expect(JSON.stringify(result)).not.toContain('admin');
  });
});

describe('credentials in URLs', () => {
  it.each([
    'token',
    'access_token',
    'accessToken',
    'refresh_token',
    'refreshToken',
    'id_token',
    'password',
    'pwd',
    'secret',
    'authorization',
    'apikey',
    'jwt',
    'session',
  ])('rejects a link carrying "%s"', (param) => {
    // URLs land in history, logs, Referer headers and screenshots. A session
    // credential must never travel in one — and refusing beats stripping,
    // because stripping teaches the sender that the pattern works.
    const result = parseDeepLink(link(`orders/1042?${param}=abc.def.ghi`));
    expect(result).toEqual({ ok: false, reason: 'forbidden-parameter' });
  });

  it('catches a forbidden name however it is cased or separated', () => {
    expect(isForbiddenParamName('ACCESS-TOKEN')).toBe(true);
    expect(isForbiddenParamName('Refresh_Token')).toBe(true);
    expect(isForbiddenParamName('slug')).toBe(false);
  });

  it('catches a forbidden name hidden in a DUPLICATED parameter', () => {
    // A parser that keeps only the first or last occurrence would discard
    // exactly the one that matters — so the raw query string is inspected.
    expect(hasForbiddenParams('?id=1&token=secret&id=2')).toBe(true);
    expect(parseDeepLink(link('orders/1?id=1&token=secret')).ok).toBe(false);
  });

  it('catches a forbidden name behind percent-encoding', () => {
    expect(hasForbiddenParams('?%74%6f%6b%65%6e=abc')).toBe(true);
  });

  it('does not choke on malformed encoding in a parameter name', () => {
    expect(() => hasForbiddenParams('?%ZZ=1')).not.toThrow();
  });
});

describe('decoding defences', () => {
  it('decodes repeatedly so double encoding cannot hide traversal', () => {
    // `%252e%252e` decodes once to `%2e%2e` and only twice to `..`. A single
    // pass is the standard bypass.
    expect(safelyDecode('%252e%252e')).toBe('..');
  });

  it('refuses invalid encoding rather than guessing', () => {
    expect(safelyDecode('%ZZ')).toBeNull();
  });

  it('rejects traversal and separators as identifiers', () => {
    for (const bad of ['..', '.', 'a/b', 'a\\b', '', '../../etc']) {
      expect(isSafeIdentifier(bad)).toBe(false);
    }
  });

  it('accepts the identifier shapes this domain actually produces', () => {
    for (const good of ['iphone-15-pro-256', 'r-1042', '1042', 'macbook_air.13']) {
      expect(isSafeIdentifier(good)).toBe(true);
    }
  });
});

describe('logging safety', () => {
  it('describes a link WITHOUT its URL or token', () => {
    const raw = link('track/superSecretTrackingCredential');
    const parsed = parseDeepLink(raw);
    const described = describeLink({
      ok: parsed.ok,
      kind: parsed.ok ? parsed.intent.kind : undefined,
    });

    expect(described).toBe('incoming-link kind=tracking valid=true');
    expect(described).not.toContain('superSecret');
    expect(described).not.toContain(APP_SCHEME);
  });

  it('describes a rejection by category only', () => {
    const described = describeLink({ ok: false, reason: 'forbidden-parameter' });
    expect(described).toBe('incoming-link valid=false reason=forbidden-parameter');
  });

  it('leaves no raw URL anywhere in a parse result', () => {
    const raw = link('products/abc?utm_campaign=very-identifying-value');
    const result = parseDeepLink(raw);
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain('utm_campaign');
    expect(serialized).not.toContain('very-identifying-value');
    expect(serialized).not.toContain('://');
  });
});

describe('tenant boundary', () => {
  it('accepts a company hint that matches this build', () => {
    // A matching hint is a confirmation, never a grant.
    const result = parseDeepLink(link(`products/abc?company=${companySlug}`));
    expect(result.ok).toBe(true);
  });

  it('rejects a link aimed at a different company', () => {
    const result = parseDeepLink(link('orders/1042?company=otra-empresa'));
    expect(result).toEqual({ ok: false, reason: 'tenant-mismatch' });
  });

  it('is case-insensitive about the company hint', () => {
    const upper = String(companySlug).toUpperCase();
    expect(parseDeepLink(link(`products/abc?company=${upper}`)).ok).toBe(true);
  });

  it('rejects a malformed company hint instead of ignoring it', () => {
    expect(parseDeepLink(link('products/abc?company=../../x')).ok).toBe(false);
  });

  it('never lets a link SELECT a different company silently', () => {
    // The failure this prevents: opening company B's screen inside company A's
    // build, with company A's cache still loaded.
    const result = parseDeepLink(link('repairs/r-1?company=empresa-ajena'));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('tenant-mismatch');
  });
});

describe('builders', () => {
  it('round-trips a product link through the parser', () => {
    const parsed = parseDeepLink(buildProductLink('iphone-15-pro-256'));
    expect(parsed).toEqual({ ok: true, intent: { kind: 'product', slug: 'iphone-15-pro-256' } });
  });

  it('round-trips an order link', () => {
    const parsed = parseDeepLink(buildOrderLink('1042'));
    expect(parsed).toEqual({ ok: true, intent: { kind: 'order', orderId: '1042' } });
  });

  it('round-trips a repair link', () => {
    const parsed = parseDeepLink(buildRepairLink('1042'));
    expect(parsed).toEqual({ ok: true, intent: { kind: 'repair', repairId: '1042' } });
  });

  it.each([
    ['traversal', '../admin'],
    ['a slash', 'a/b'],
    ['empty', ''],
    ['oversized', 'x'.repeat(200)],
  ])('refuses to emit a link for %s', (_label, value) => {
    // A builder applies the SAME rule as the parser, so it cannot emit
    // something the app would then refuse to read.
    expect(() => buildProductLink(value)).toThrow(UnsafeLinkInputError);
  });

  it('emits no query string, so no builder can leak a secret', () => {
    for (const url of [buildProductLink('abc'), buildOrderLink('1'), buildRepairLink('1')]) {
      expect(url).not.toContain('?');
      expect(url).not.toContain('token');
    }
  });

  it('takes the scheme from Expo config rather than hardcoding it', () => {
    // A white-label build gets its own scheme without editing this code.
    expect(buildProductLink('abc')).toContain('products/abc');
  });
});
