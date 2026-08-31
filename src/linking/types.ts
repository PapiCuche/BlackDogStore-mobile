/**
 * Deep link contract.
 *
 * DEC-MOBILE-004 — A DEEP LINK IS A NAVIGATION INTENT, NEVER AUTHORIZATION.
 *
 * The rule this whole module exists to enforce: possession of a URL containing
 * `repairId=42` says NOTHING about whether the person holding it may see repair
 * 42. It says only where they were trying to go. Authority stays with the
 * server, which validates identity, tenant and ownership before returning a
 * single field.
 *
 *   URL → parse → validated intent → tenant gate → auth gate → screen
 *                                                                  ↓
 *                              backend validates identity + tenant + ownership
 *
 * Nothing here fetches. Nothing here grants. It decides *where to go*.
 */

/** What kind of destination a link is asking for. */
export type DeepLinkKind = 'product' | 'order' | 'repair' | 'tracking';

/**
 * Who may open a destination.
 *
 * Centralised so the answer cannot drift per call site — a screen deciding for
 * itself whether it is private is a screen one refactor away from deciding
 * wrong.
 */
export type IntentVisibility =
  /** Anyone. The catalogue is public by nature. */
  | 'public'
  /** Requires a session. Orders and repairs belong to one customer. */
  | 'authenticated'
  /** A future opaque-token flow. No backend contract exists — BR-008. */
  | 'secure-tracking-future';

/** A link asking for a catalogue product. Public. */
export type ProductIntent = {
  kind: 'product';
  slug: string;
};

/**
 * A link asking for an e-commerce order.
 *
 * `Order` is the shop purchase. It is NOT a `RepairOrder`; the two are separate
 * domains with separate lifecycles and separate identifiers, and the app has
 * kept them apart since M0.
 */
export type OrderIntent = {
  kind: 'order';
  orderId: string;
};

/** A link asking for a technical-service repair. */
export type RepairIntent = {
  kind: 'repair';
  repairId: string;
};

/**
 * A link carrying an opaque customer-tracking credential.
 *
 * RECOGNISED, NOT HONOURED. The shape is modelled so such a link is classified
 * rather than falling through to "unknown", but no token is ever stored,
 * logged, or sent anywhere: there is no backend contract for it (BR-008,
 * API_PENDING). The screen ends in an unavailable state, not fabricated data.
 */
export type TrackingIntent = {
  kind: 'tracking';
};

export type DeepLinkIntent = ProductIntent | OrderIntent | RepairIntent | TrackingIntent;

/**
 * Why a link was refused.
 *
 * Separate reasons because they mean different things to the app — though NOT
 * necessarily to the customer, who gets one neutral message either way so the
 * UI never becomes an existence oracle.
 */
export type DeepLinkRejectionReason =
  /** Not a URL, or a URL we cannot parse at all. */
  | 'malformed'
  /** A scheme this app does not own, or a dangerous one (javascript:, file:…). */
  | 'unsupported-scheme'
  /** A host we do not recognise on an https link. */
  | 'unsupported-host'
  /** A path with no matching intent. */
  | 'unknown-route'
  /** The route matched but its identifier is empty, oversized or malformed. */
  | 'invalid-parameter'
  /** The link carries something that looks like a credential. */
  | 'forbidden-parameter'
  /** The link targets a company this build is not configured for. */
  | 'tenant-mismatch'
  /** The URL exceeded the accepted length. */
  | 'oversized';

export type DeepLinkParseResult =
  | { ok: true; intent: DeepLinkIntent }
  | { ok: false; reason: DeepLinkRejectionReason };

/** Where a kind sits on the visibility ladder. Single source of truth. */
export const INTENT_VISIBILITY: Record<DeepLinkKind, IntentVisibility> = {
  product: 'public',
  order: 'authenticated',
  repair: 'authenticated',
  tracking: 'secure-tracking-future',
};

export function visibilityOf(intent: DeepLinkIntent): IntentVisibility {
  return INTENT_VISIBILITY[intent.kind];
}

export function isPrivateIntent(intent: DeepLinkIntent): boolean {
  return visibilityOf(intent) === 'authenticated';
}

/**
 * The Expo Router path an intent resolves to.
 *
 * The ONLY place a route string is produced from a link. `router.push()` is
 * never handed anything derived from user input — it receives one of these
 * literals with an encoded identifier, so an attacker-supplied path cannot
 * become a navigation target.
 */
export function routeForIntent(intent: DeepLinkIntent): string | null {
  switch (intent.kind) {
    case 'product':
      return `/products/${encodeURIComponent(intent.slug)}`;
    case 'order':
      return `/orders/${encodeURIComponent(intent.orderId)}`;
    case 'repair':
      return `/repairs/${encodeURIComponent(intent.repairId)}`;
    case 'tracking':
      // No route: there is no backend contract to land on. The coordinator
      // reports it as unavailable rather than inventing a screen.
      return null;
  }
}
