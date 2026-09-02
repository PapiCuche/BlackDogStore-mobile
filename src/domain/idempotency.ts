/**
 * Keys that make a physical write repeatable.
 *
 * WHY THE CLIENT MINTS IT. The server cannot: a key it generated would be a new
 * key on every attempt, which is the one thing an idempotency key must never
 * be. Only the caller knows that this request is the SAME request as the one
 * that timed out thirty seconds ago.
 *
 * WHAT IT IS NOT. Not a secret, not authentication, not an identifier anybody
 * else will ever look up. It identifies a retry; it protects nothing. The hash
 * below is deliberately a plain FNV — using a cryptographic one here would
 * suggest a guarantee this value does not make.
 *
 * Extracted in M10 from `use-checkout`, where it had lived privately since M5.
 * Two places now mint these — a basket and a part coming off a shelf — and a
 * mechanism whose whole job is to stop a double write is the last thing that
 * should exist twice in two subtly different versions.
 */

/**
 * A key that is stable for one intention and different for the next.
 *
 * `shape` is a caller-supplied description of WHAT is being asked for. It is
 * folded into the key so a changed request cannot silently reuse the key of an
 * older one — the server would answer 409 rather than replay, which is correct
 * but reads as a mysterious failure. Better that the key changes with the ask.
 */
export function makeIdempotencyKey(shape: string): string {
  // Enough entropy that two devices never collide, plus the shape so a changed
  // request cannot reuse a key by accident.
  const nonce = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `${nonce}-${hashShape(shape)}`.slice(0, 64);
}

/** Small non-cryptographic hash. This identifies a retry; it protects nothing. */
export function hashShape(value: string): string {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
