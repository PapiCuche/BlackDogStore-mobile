import {
  addLine,
  cartTotals,
  clampQuantity,
  emptyCart,
  lineFromProduct,
  MAX_QUANTITY_PER_LINE,
  removeLine,
  removeLines,
  setQuantity,
  toCheckoutItems,
  type Cart,
} from '@/domain/cart/types';
import type { Product } from '@/domain/products/types';

/**
 * M5 — the basket as pure data.
 *
 * DEC-MOBILE-009: this is local INTENT. Every figure here is an estimate for
 * display; the server prices the order. These tests pin down the arithmetic and
 * the merge rules, not any claim about what the shop will charge.
 */

function product(slug: string, price: string, name = slug): Product {
  return {
    id: 1,
    name,
    slug,
    description: '',
    price,
    inventory: 10,
    category: null,
    imageUrl: `https://cdn.test/${slug}.png`,
    averageRating: null,
    reviewCount: 0,
  };
}

const EMPTY: Cart = emptyCart('blackdog');

describe('adding', () => {
  it('adds a product as a line', () => {
    const cart = addLine(EMPTY, lineFromProduct(product('iphone', '4000.00')));

    expect(cart.lines).toHaveLength(1);
    expect(cart.lines[0]!.productSlug).toBe('iphone');
    expect(cart.lines[0]!.quantity).toBe(1);
  });

  it('MERGES a repeat rather than creating a second line', () => {
    // Adding the same thing twice means wanting more of it, not owning two
    // baskets.
    const once = addLine(EMPTY, lineFromProduct(product('iphone', '4000.00')));
    const twice = addLine(once, lineFromProduct(product('iphone', '4000.00'), 2));

    expect(twice.lines).toHaveLength(1);
    expect(twice.lines[0]!.quantity).toBe(3);
  });

  it('keeps different products apart', () => {
    const cart = addLine(
      addLine(EMPTY, lineFromProduct(product('iphone', '4000.00'))),
      lineFromProduct(product('cargador', '129.00')),
    );

    expect(cart.lines).toHaveLength(2);
  });

  it('carries a display snapshot so the cart renders offline', () => {
    const cart = addLine(EMPTY, lineFromProduct(product('iphone', '4000.00', 'iPhone 15')));

    expect(cart.lines[0]!.name).toBe('iPhone 15');
    expect(cart.lines[0]!.lastSeenPrice).toBe('4000.00');
    expect(cart.lines[0]!.imageUrl).toContain('iphone');
  });
});

describe('quantities', () => {
  const cart = addLine(EMPTY, lineFromProduct(product('iphone', '4000.00')));

  it('sets a quantity', () => {
    expect(setQuantity(cart, 'iphone', 4).lines[0]!.quantity).toBe(4);
  });

  it('REMOVES the line at zero, which is what a stepper means', () => {
    expect(setQuantity(cart, 'iphone', 0).lines).toHaveLength(0);
  });

  it('removes the line for a negative quantity too', () => {
    expect(setQuantity(cart, 'iphone', -5).lines).toHaveLength(0);
  });

  it('clamps to the ceiling the backend also enforces', () => {
    expect(setQuantity(cart, 'iphone', 5000).lines[0]!.quantity).toBe(MAX_QUANTITY_PER_LINE);
  });

  it('clamps a fractional quantity to a whole one', () => {
    expect(clampQuantity(2.7)).toBe(2);
  });

  it('survives a non-finite quantity', () => {
    expect(clampQuantity(Number.NaN)).toBe(1);
  });

  it('ignores a quantity change for a slug that is not there', () => {
    expect(setQuantity(cart, 'no-existe', 9).lines[0]!.quantity).toBe(1);
  });
});

describe('removing', () => {
  const cart = addLine(
    addLine(EMPTY, lineFromProduct(product('iphone', '4000.00'))),
    lineFromProduct(product('cargador', '129.00')),
  );

  it('removes one line', () => {
    expect(removeLine(cart, 'iphone').lines.map((l) => l.productSlug)).toEqual(['cargador']);
  });

  it('removes several, which is what a confirmed payment does', () => {
    expect(removeLines(cart, ['iphone', 'cargador']).lines).toHaveLength(0);
  });

  it('leaves untouched lines alone when only some were paid', () => {
    expect(removeLines(cart, ['iphone']).lines.map((l) => l.productSlug)).toEqual(['cargador']);
  });
});

describe('estimated totals', () => {
  it('counts items and lines separately', () => {
    const cart = setQuantity(
      addLine(
        addLine(EMPTY, lineFromProduct(product('iphone', '4000.00'))),
        lineFromProduct(product('cargador', '129.00')),
      ),
      'iphone',
      3,
    );

    const totals = cartTotals(cart);
    expect(totals.lineCount).toBe(2);
    expect(totals.itemCount).toBe(4);
  });

  it('adds money WITHOUT floating point', () => {
    // 4500.00 × 3 through JS numbers is how a basket shows 13499.999999999998.
    const cart = setQuantity(
      addLine(EMPTY, lineFromProduct(product('mac', '4500.00'))), 'mac', 3,
    );

    expect(cartTotals(cart).estimatedSubtotal).toBe('13500.00');
  });

  it('handles prices with cents exactly', () => {
    const cart = setQuantity(
      addLine(EMPTY, lineFromProduct(product('cable', '19.99'))), 'cable', 3,
    );

    expect(cartTotals(cart).estimatedSubtotal).toBe('59.97');
  });

  it('is zero for an empty basket', () => {
    expect(cartTotals(EMPTY).estimatedSubtotal).toBe('0.00');
  });

  it('survives a malformed stored price rather than showing NaN', () => {
    const cart: Cart = {
      tenantSlug: 'blackdog',
      lines: [{ productSlug: 'x', quantity: 2, name: 'X', imageUrl: '', lastSeenPrice: 'roto' }],
    };

    expect(cartTotals(cart).estimatedSubtotal).toBe('0.00');
  });
});

describe('what the checkout receives', () => {
  it('sends slug and quantity, and NOTHING about money', () => {
    // The server rejects a price outright. A client that cannot express one
    // cannot be wrong about it.
    const cart = addLine(EMPTY, lineFromProduct(product('iphone', '4000.00')));

    const items = toCheckoutItems(cart);

    expect(items).toEqual([{ product_slug: 'iphone', quantity: 1 }]);
    expect(JSON.stringify(items)).not.toContain('4000');
  });

  it('sends nothing for an empty basket', () => {
    expect(toCheckoutItems(EMPTY)).toEqual([]);
  });
});
