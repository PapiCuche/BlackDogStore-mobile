import { emptyCart, type Cart, type CartLine } from '@/domain/cart/types';
import { cartKey, getPreference, removePreference, setPreference } from '@/storage/preferences-storage';

/**
 * Persistence for the basket.
 *
 * WHY IT PERSISTS AT ALL. Closing an app by accident, or being pushed out of it
 * by a phone call, should not cost someone the twenty minutes they spent
 * choosing things. That is the entire ambition — this is not offline-first, and
 * nothing here syncs.
 *
 * WHY IT IS NOT SECURE STORAGE. A basket contains no credential, no
 * authorization and no price the shop has agreed to. Keeping it in the Keychain
 * would be slower and would blur what "secure" means in this codebase. See
 * `preferences-storage.ts`.
 *
 * READS NEVER THROW. A corrupted basket is an empty basket: losing a shopping
 * list is a small annoyance, and refusing to open the cart screen is not.
 */

/** Everything a stored line must have to be usable. Anything else is discarded. */
function parseLine(raw: unknown): CartLine | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const row = raw as Record<string, unknown>;
  const slug = typeof row.productSlug === 'string' ? row.productSlug.trim() : '';
  const quantity = Number(row.quantity);
  if (!slug || !Number.isFinite(quantity) || quantity <= 0) return null;
  return {
    productSlug: slug,
    quantity: Math.trunc(quantity),
    name: typeof row.name === 'string' ? row.name : '',
    imageUrl: typeof row.imageUrl === 'string' ? row.imageUrl : '',
    lastSeenPrice: typeof row.lastSeenPrice === 'string' ? row.lastSeenPrice : '0',
  };
}

export async function loadCart(tenantSlug: string): Promise<Cart> {
  const stored = await getPreference(cartKey(tenantSlug));
  if (!stored) return emptyCart(tenantSlug);

  try {
    const parsed = JSON.parse(stored) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return emptyCart(tenantSlug);

    const shape = parsed as { tenantSlug?: unknown; lines?: unknown };
    // A basket stored under a different tenant is not this tenant's basket, even
    // if the key somehow matched. Refusing beats mixing two shops' baskets.
    if (shape.tenantSlug !== tenantSlug) return emptyCart(tenantSlug);
    if (!Array.isArray(shape.lines)) return emptyCart(tenantSlug);

    const lines = shape.lines.map(parseLine).filter((line): line is CartLine => line !== null);
    return { tenantSlug, lines };
  } catch {
    // Malformed JSON from an older build or a partial write. Start clean.
    return emptyCart(tenantSlug);
  }
}

export async function saveCart(cart: Cart): Promise<void> {
  if (cart.lines.length === 0) {
    await removePreference(cartKey(cart.tenantSlug));
    return;
  }
  await setPreference(cartKey(cart.tenantSlug), JSON.stringify(cart));
}

export async function clearStoredCart(tenantSlug: string): Promise<void> {
  await removePreference(cartKey(tenantSlug));
}
