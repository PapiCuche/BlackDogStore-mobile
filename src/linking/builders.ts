import * as Linking from 'expo-linking';

import { isSafeIdentifier } from './security';

/**
 * Typed builders for internal and development links.
 *
 * They exist so nobody hand-concatenates a URL. A builder validates its input
 * against the SAME rule the parser applies, so a link this app produces is a
 * link this app can read back — and an identifier that would be refused on the
 * way in cannot be emitted on the way out.
 *
 * `Linking.createURL` supplies the scheme from the Expo config rather than a
 * hardcoded `blackdogstore://`, so the pilot's scheme is not spread across the
 * codebase (§38) and a white-label build gets its own without edits.
 */

export class UnsafeLinkInputError extends Error {
  constructor(value: string) {
    // The rejected value is short and already validated as unsafe; the message
    // carries no credential because builders never accept one.
    super(`Identificador no válido para un enlace: "${value.slice(0, 32)}"`);
    this.name = 'UnsafeLinkInputError';
  }
}

function requireSafe(value: string): string {
  if (!isSafeIdentifier(value)) throw new UnsafeLinkInputError(String(value));
  return value;
}

/**
 * Build a link to a catalogue product.
 *
 * `Linking.createURL` percent-encodes the path, so a slug is escaped exactly
 * once — encoding it here as well would double-encode and break the round trip.
 */
export function buildProductLink(slug: string): string {
  return Linking.createURL(`products/${requireSafe(slug)}`);
}

/** Build a link to an e-commerce order. Not a repair — separate domain. */
export function buildOrderLink(orderId: string): string {
  return Linking.createURL(`orders/${requireSafe(orderId)}`);
}

/**
 * Build a link to a technical-service repair.
 *
 * A STRING, even though `Repair.id` became a number in M8: a URL segment is
 * text, and the linking layer has no business knowing what a primary key looks
 * like. The screen converts at its own boundary.
 */
export function buildRepairLink(repairId: string): string {
  return Linking.createURL(`repairs/${requireSafe(repairId)}`);
}

/**
 * There is deliberately NO tracking-link builder.
 *
 * A tracking link carries an opaque credential that only the backend can mint
 * (BR-008). A client-side builder would have to invent one, and an invented
 * credential is either predictable or meaningless — both worse than not having
 * the function.
 */
