import type { Product } from '@/domain/products/types';

/**
 * The basket, BEFORE it becomes an order.
 *
 * DEC-MOBILE-009 — AN ANONYMOUS CART IS LOCAL INTENT; THE SERVER OWNS
 * COMMERCIAL TRUTH.
 *
 * A `Cart` says what someone wants to buy. It says nothing binding about what
 * that costs. Everything monetary here is an ESTIMATE for display, computed
 * from prices the catalogue showed at the time, and the checkout recomputes all
 * of it from `Product.price` at the moment of purchase.
 *
 * That is why this type is deliberately NOT reused from `Order`. An `Order` is
 * history — frozen prices, a fixed total, a receipt. A `Cart` is a mutable
 * intention that may be wrong by the time it is acted on. Sharing one type
 * would invite treating a stale local number as a price the shop agreed to.
 *
 * WHY THE SNAPSHOT FIELDS EXIST AT ALL
 *
 * The cart must render offline, and it must render before the catalogue query
 * resolves. Holding only `{slug, quantity}` would mean an empty grey list every
 * time the network is slow. So the name, image and last-seen price travel with
 * the line — clearly labelled as what they are.
 */
export type CartLine = {
  /** The identity of the line. A slug, because that is what checkout accepts. */
  productSlug: string;
  quantity: number;
  /** For display while offline or before the catalogue answers. Not authority. */
  name: string;
  imageUrl: string;
  /** What the catalogue showed when this was added. May be stale. */
  lastSeenPrice: string;
};

export type Cart = {
  /** Which storefront this basket belongs to. Never shared between tenants. */
  tenantSlug: string;
  lines: readonly CartLine[];
};

/**
 * Estimated totals.
 *
 * `estimated` is in the name because it is the whole point: the server may
 * price this differently, and the UI has to say so rather than presenting a
 * figure the shop has not agreed to.
 */
export type CartTotals = {
  itemCount: number;
  lineCount: number;
  estimatedSubtotal: string;
};

export const MAX_QUANTITY_PER_LINE = 99;

export function emptyCart(tenantSlug: string): Cart {
  return { tenantSlug, lines: [] };
}

export function lineFromProduct(product: Product, quantity = 1): CartLine {
  return {
    productSlug: product.slug,
    quantity: clampQuantity(quantity),
    name: product.name,
    imageUrl: product.imageUrl,
    lastSeenPrice: product.price,
  };
}

/**
 * Keep a quantity inside what the contract accepts.
 *
 * Clamped rather than rejected: a stepper that silently refuses feels broken,
 * and the backend enforces the same ceiling anyway. Zero and below mean "remove",
 * which callers handle before reaching here.
 */
export function clampQuantity(quantity: number): number {
  if (!Number.isFinite(quantity)) return 1;
  return Math.max(1, Math.min(MAX_QUANTITY_PER_LINE, Math.trunc(quantity)));
}

/**
 * Add a product, merging with an existing line for the same slug.
 *
 * Adding the same thing twice means wanting more of it, not owning two baskets.
 */
export function addLine(cart: Cart, line: CartLine): Cart {
  const existing = cart.lines.find((row) => row.productSlug === line.productSlug);
  if (!existing) {
    return { ...cart, lines: [...cart.lines, { ...line, quantity: clampQuantity(line.quantity) }] };
  }
  return setQuantity(cart, line.productSlug, existing.quantity + line.quantity);
}

export function removeLine(cart: Cart, productSlug: string): Cart {
  return { ...cart, lines: cart.lines.filter((row) => row.productSlug !== productSlug) };
}

/** Setting a quantity to zero or less removes the line, which is what a stepper means. */
export function setQuantity(cart: Cart, productSlug: string, quantity: number): Cart {
  if (quantity <= 0) return removeLine(cart, productSlug);
  return {
    ...cart,
    lines: cart.lines.map((row) =>
      row.productSlug === productSlug ? { ...row, quantity: clampQuantity(quantity) } : row,
    ),
  };
}

/** Drop specific lines — used after a payment confirms, never before. */
export function removeLines(cart: Cart, slugs: readonly string[]): Cart {
  const drop = new Set(slugs);
  return { ...cart, lines: cart.lines.filter((row) => !drop.has(row.productSlug)) };
}

/**
 * Estimated totals, in decimal STRINGS.
 *
 * Money never becomes a float here. `4500.00 * 3` through JavaScript numbers is
 * how a basket ends up showing 13499.999999999998, and the fix is not to round
 * it afterwards but never to leave decimal arithmetic in the first place.
 */
export function cartTotals(cart: Cart): CartTotals {
  let cents = 0;
  let itemCount = 0;

  for (const line of cart.lines) {
    itemCount += line.quantity;
    cents += toCents(line.lastSeenPrice) * line.quantity;
  }

  return {
    itemCount,
    lineCount: cart.lines.length,
    estimatedSubtotal: fromCents(cents),
  };
}

function toCents(price: string): number {
  const [whole = '0', fraction = ''] = String(price).split('.');
  const cents = Number(`${fraction}00`.slice(0, 2));
  const units = Number(whole);
  if (!Number.isFinite(units) || !Number.isFinite(cents)) return 0;
  return units * 100 + cents;
}

function fromCents(cents: number): string {
  const units = Math.trunc(cents / 100);
  const remainder = Math.abs(cents % 100);
  return `${units}.${String(remainder).padStart(2, '0')}`;
}

/** What the checkout endpoint accepts: intent only, no prices. */
export function toCheckoutItems(cart: Cart): { product_slug: string; quantity: number }[] {
  return cart.lines.map((line) => ({
    product_slug: line.productSlug,
    quantity: line.quantity,
  }));
}
