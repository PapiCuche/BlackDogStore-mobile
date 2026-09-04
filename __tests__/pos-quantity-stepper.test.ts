type FS = { readFileSync(p: string, e: 'utf8'): string };
const fs = jest.requireActual('fs') as FS;

/**
 * The till's quantity stepper, and why it is a structural test.
 *
 * The customer cart and the internal POS do the same thing — one more of this,
 * one fewer of that — and only one of them did it properly. The cart used
 * `IconButton` with `icons.minus` / `icons.plus` and labels naming the article
 * ("Quitar uno de Cargador USB-C"). The POS used two text `Button`s whose labels
 * were the characters «−» and «+».
 *
 * That is worse than it looks. A screen reader announced a bare symbol with no
 * article attached, on the ONE screen an operator touches hundreds of times a
 * day, where the whole task is knowing which line you are changing. The
 * repository already forbids unicode glyphs standing in for iconography; this
 * was the only place still doing it.
 *
 * Rendering the POS screen in a test would mean standing up the internal
 * context, capabilities, a branch and a basket — a lot of machinery to assert
 * something that is really about which primitive the screen reaches for. The
 * source is the honest place to check that, and it keeps the guard from passing
 * for the wrong reason when the query happens to return nothing.
 */

const POS = 'src/app/internal/pos/index.tsx';
const CART = 'src/app/cart.tsx';

const posSource = fs.readFileSync(POS, 'utf8');
const pos = stripComments(posSource);

describe('the till steps quantity the same way the cart does', () => {
  it('uses IconButton with the real minus and plus icons', () => {
    expect(pos).toMatch(/<IconButton[\s\S]*?icon=\{icons\.minus\}/);
    expect(pos).toMatch(/<IconButton[\s\S]*?icon=\{icons\.plus\}/);
  });

  it('names the article in the label of each step control', () => {
    // "Agregar uno" is not enough on a screen listing six lines. The label has
    // to say WHICH one, and the only way to be sure is to interpolate the name.
    expect(pos).toMatch(/accessibilityLabel=\{`Quitar uno de \$\{line\.product\.name\}`\}/);
    expect(pos).toMatch(/accessibilityLabel=\{`Agregar uno de \$\{line\.product\.name\}`\}/);
  });

  it('gives the quantity itself a spoken label', () => {
    // Otherwise a reader hears a lone "3" between two buttons.
    expect(pos).toMatch(/accessibilityLabel=\{`Cantidad \$\{line\.quantity\}`\}/);
  });

  it('no longer draws a control whose label is a bare glyph', () => {
    // The exact defect: `label="−"` (U+2212) and `label="+"` on a text Button.
    expect(pos).not.toMatch(/label="[−+\-]"/);
  });

  it('keeps the step controls disabled while a sale is in flight', () => {
    // Changing the basket under a request that is already pricing it would send
    // the operator a total for something other than what is on screen.
    const stepper = pos.slice(pos.indexOf('icons.minus'), pos.indexOf('icons.plus') + 400);
    expect(stepper.match(/disabled=\{busy\}/g)?.length).toBe(2);
  });
});

describe('the customer cart, which was already right, stays right', () => {
  const cart = stripComments(fs.readFileSync(CART, 'utf8'));

  it('still names the article in its step controls', () => {
    expect(cart).toMatch(/accessibilityLabel=\{`Quitar uno de /);
    expect(cart).toMatch(/accessibilityLabel=\{`Agregar uno de /);
  });

  it('still labels the quantity', () => {
    expect(cart).toMatch(/accessibilityLabel=\{`Cantidad \$\{line\.quantity\}`\}/);
  });
});

/**
 * The comments above name `label="−"` while explaining what must not exist.
 * Scanning them would fail the guard on its own reasoning.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\/.*$/gm, '');
}
