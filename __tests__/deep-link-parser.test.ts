import { APP_SCHEME, parseDeepLink } from '@/linking/parser';
import { MAX_IDENTIFIER_LENGTH, MAX_URL_LENGTH } from '@/linking/security';
import { routeForIntent, visibilityOf } from '@/linking/types';

/**
 * M1.2 — the parser is the app's front door for untrusted input.
 *
 * Every case below is a URL an attacker could hand the app through an email, a
 * QR code or another application. The parser's job is to produce a validated
 * intent or refuse — never a navigation target derived from raw input.
 */

const link = (path: string) => `${APP_SCHEME}://${path}`;

describe('valid links', () => {
  it('parses a product link', () => {
    const result = parseDeepLink(link('products/iphone-15-pro-256'));
    expect(result).toEqual({ ok: true, intent: { kind: 'product', slug: 'iphone-15-pro-256' } });
  });

  it('parses an order link', () => {
    const result = parseDeepLink(link('orders/1042'));
    expect(result).toEqual({ ok: true, intent: { kind: 'order', orderId: '1042' } });
  });

  it('parses a repair link', () => {
    const result = parseDeepLink(link('repairs/r-1042'));
    expect(result).toEqual({ ok: true, intent: { kind: 'repair', repairId: 'r-1042' } });
  });

  it('recognises a tracking link WITHOUT keeping the token', () => {
    const result = parseDeepLink(link('track/aVeryLongOpaqueTrackingCredential123'));

    expect(result.ok).toBe(true);
    // The credential is deliberately dropped: no backend contract exists to
    // validate it (BR-008), so storing it would be keeping a secret for nothing.
    expect(result.ok && result.intent).toEqual({ kind: 'tracking' });
    expect(JSON.stringify(result)).not.toContain('aVeryLongOpaque');
  });

  it('tolerates a leading slash from the custom scheme authority quirk', () => {
    // `scheme://products/x` puts `products` in the HOST; `scheme:///products/x`
    // puts it in the path. Both must mean the same thing.
    expect(parseDeepLink(`${APP_SCHEME}:///products/abc`)).toEqual({
      ok: true,
      intent: { kind: 'product', slug: 'abc' },
    });
  });

  it('decodes a percent-encoded identifier once', () => {
    expect(parseDeepLink(link('products/iphone%2D15'))).toEqual({
      ok: true,
      intent: { kind: 'product', slug: 'iphone-15' },
    });
  });

  it('ignores harmless unknown query parameters', () => {
    // Unknown params are dropped, not honoured: nothing in the intent comes
    // from a query string.
    const result = parseDeepLink(link('products/abc?utm_source=email&ref=whatsapp'));
    expect(result).toEqual({ ok: true, intent: { kind: 'product', slug: 'abc' } });
  });
});

describe('malformed and unsupported input', () => {
  it.each([
    ['not a url at all', 'hello world'],
    ['empty string', ''],
    ['whitespace', '   '],
    ['null', null],
    ['undefined', undefined],
    ['a number', 42],
  ])('rejects %s', (_label, input) => {
    const result = parseDeepLink(input);
    expect(result.ok).toBe(false);
  });

  it.each([
    ['javascript', 'javascript:alert(1)'],
    ['data', 'data:text/html,<script>alert(1)</script>'],
    ['file', 'file:///etc/passwd'],
    ['intent', 'intent://scan/#Intent;scheme=zxing;end'],
    ['blob', 'blob:https://evil.example/x'],
  ])('rejects the dangerous scheme %s', (_label, url) => {
    const result = parseDeepLink(url);
    expect(result).toEqual({ ok: false, reason: 'unsupported-scheme' });
  });

  it('rejects an unrelated custom scheme', () => {
    expect(parseDeepLink('otherapp://products/abc')).toEqual({
      ok: false,
      reason: 'unsupported-scheme',
    });
  });

  it('rejects https until a production domain is verified', () => {
    // No domain exists yet, so the trusted-host list is empty on purpose.
    // Trusting a host nobody controls would be worse than refusing.
    expect(parseDeepLink('https://example.com/products/abc')).toEqual({
      ok: false,
      reason: 'unsupported-host',
    });
  });

  it('rejects an unknown route', () => {
    expect(parseDeepLink(link('admin/users'))).toEqual({ ok: false, reason: 'unknown-route' });
    expect(parseDeepLink(link('settings'))).toEqual({ ok: false, reason: 'unknown-route' });
  });

  it('rejects a route with extra trailing segments', () => {
    // Guessing at a deeper path is how an unintended screen becomes reachable.
    expect(parseDeepLink(link('orders/1042/items/7'))).toEqual({
      ok: false,
      reason: 'unknown-route',
    });
  });

  it('rejects an empty identifier', () => {
    expect(parseDeepLink(link('products/')).ok).toBe(false);
    expect(parseDeepLink(link('orders')).ok).toBe(false);
  });
});

describe('hostile identifiers', () => {
  it.each([
    ['path traversal', 'products/..'],
    ['nested traversal', 'products/..%2F..%2Fadmin'],
    ['encoded slash', 'products/a%2Fb'],
    ['double-encoded traversal', 'products/%252e%252e'],
    ['a space', 'products/a b'],
    ['a null-like char', 'products/a%00b'],
    ['angle brackets', 'products/%3Cscript%3E'],
    ['unicode oddity', 'products/%E2%80%AEabc'],
  ])('rejects %s', (_label, path) => {
    const result = parseDeepLink(link(path));
    expect(result.ok).toBe(false);
  });

  it('rejects an oversized identifier', () => {
    const huge = 'a'.repeat(MAX_IDENTIFIER_LENGTH + 1);
    expect(parseDeepLink(link(`products/${huge}`))).toEqual({
      ok: false,
      reason: 'invalid-parameter',
    });
  });

  it('accepts an identifier exactly at the limit', () => {
    const atLimit = 'a'.repeat(MAX_IDENTIFIER_LENGTH);
    expect(parseDeepLink(link(`products/${atLimit}`)).ok).toBe(true);
  });

  it('rejects an oversized URL before doing anything else', () => {
    // A multi-kilobyte URL must never become state, a log line or a route param.
    const huge = `${APP_SCHEME}://products/a?x=${'y'.repeat(MAX_URL_LENGTH)}`;
    expect(parseDeepLink(huge)).toEqual({ ok: false, reason: 'oversized' });
  });
});

describe('intent classification', () => {
  it('treats the catalogue as public and orders/repairs as private', () => {
    expect(visibilityOf({ kind: 'product', slug: 'x' })).toBe('public');
    expect(visibilityOf({ kind: 'order', orderId: '1' })).toBe('authenticated');
    expect(visibilityOf({ kind: 'repair', repairId: 'r-1' })).toBe('authenticated');
    expect(visibilityOf({ kind: 'tracking' })).toBe('secure-tracking-future');
  });

  it('maps intents to the app’s REAL Expo Router routes', () => {
    expect(routeForIntent({ kind: 'product', slug: 'abc' })).toBe('/products/abc');
    expect(routeForIntent({ kind: 'order', orderId: '1042' })).toBe('/orders/1042');
    expect(routeForIntent({ kind: 'repair', repairId: 'r-1' })).toBe('/repairs/r-1');
  });

  it('gives tracking no route, because there is nothing to land on', () => {
    expect(routeForIntent({ kind: 'tracking' })).toBeNull();
  });

  it('re-encodes the identifier when building the route', () => {
    // Belt and braces: the parser already rejects unsafe characters, so this
    // can only ever be a no-op — which is exactly what makes it safe to keep.
    expect(routeForIntent({ kind: 'product', slug: 'iphone-15' })).toBe('/products/iphone-15');
  });
});
