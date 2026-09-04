import { describeAvailability } from '@/domain/products/availability';
import type { Product } from '@/domain/products/types';
import { colorSchemes } from '@/theme/colors';
import { AA_NORMAL, contrastRatio, parseColor } from '@/theme/contrast';

type FS = { readFileSync(p: string, e: 'utf8'): string };
const fs = jest.requireActual('fs') as FS;

/**
 * One product, one answer about its stock.
 *
 * `StatusBadge` states the rule in its own docstring: the tone comes from the
 * domain, never from the screen, «that is what guarantees "En reparación" is the
 * same colour everywhere it appears». Availability was the one state that did
 * not follow it, and it broke in precisely the way the rule anticipates —
 * `ProductCard` painted `low_stock` amber while the detail screen painted the
 * same state green, the same green it used for `in_stock`.
 *
 * A shopper saw an amber "Últimas unidades" in the catalogue, tapped it, and
 * read a green "Últimas 2 unidades" on the next screen.
 */

const product = (inventory: number): Product =>
  ({ id: 1, slug: 'p', name: 'Producto', price: '100.00', inventory }) as unknown as Product;

const CARD = 'src/features/catalog/product-card.tsx';
const DETAIL = 'src/app/products/[slug].tsx';

describe('the three stock states have one tone each', () => {
  it.each([
    ['in_stock', 12, 'success'],
    ['low_stock', 2, 'warning'],
    ['out_of_stock', 0, 'neutral'],
  ])('%s is %s', (_state, inventory, tone) => {
    expect(describeAvailability(product(inventory as number)).tone).toBe(tone);
  });

  it('gives low stock a WARNING tone, never a success one', () => {
    // The exact regression. Green said "all good" about the state that means
    // "decide now or it is gone".
    const meta = describeAvailability(product(2));
    expect(meta.tone).toBe('warning');
    expect(meta.tone).not.toBe('success');
  });

  it('says the same thing whether or not the count is shown', () => {
    // The detail screen has room for the number and the card does not. That is
    // a difference in wording, and it must not become a difference in meaning.
    expect(describeAvailability(product(2), { exact: true }).tone).toBe(
      describeAvailability(product(2)).tone,
    );
    expect(describeAvailability(product(2), { exact: true }).label).toContain('2');
  });

  it('takes the count from the server rather than inventing one', () => {
    // `productAvailability` calls 3 or fewer "low", so 3 is the top of the band.
    expect(describeAvailability(product(3), { exact: true }).label).toBe('Últimas 3 unidades');
  });

  it('says «Última unidad» rather than «Últimas 1 unidades»', () => {
    // The last one in stock is the moment a shopper reads most carefully, and
    // it was the moment the sentence stopped being Spanish.
    expect(describeAvailability(product(1), { exact: true }).label).toBe('Última unidad');
  });
});

describe('every state is legible in both themes', () => {
  // Measured with the project's own helper against the threshold the project
  // itself ships as AA_NORMAL. "Agotado" used to render in `textTertiary`:
  // 3.04:1 on light surface, 4.20:1 on dark, at 12pt — where the large-text
  // allowance does not apply. It was the least readable of the three states and
  // the one that decides whether somebody can buy at all.
  it.each([
    ['in_stock', 12],
    ['low_stock', 2],
    ['out_of_stock', 0],
  ])('%s clears AA on the card surface', (_state, inventory) => {
    for (const scheme of ['light', 'dark'] as const) {
      const palette = colorSchemes[scheme];
      const key = `status${capitalise(describeAvailability(product(inventory as number)).tone)}`;
      const foreground = parseColor(palette[key as keyof typeof palette] as string)!;
      const ratio = contrastRatio(foreground, parseColor(palette.surface)!);
      expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });
});

describe('no screen decides the tone for itself', () => {
  it.each([CARD, DETAIL])('%s reads label and tone from the domain', (path) => {
    const source = stripComments(fs.readFileSync(path, 'utf8'));
    expect(source).toMatch(/describeAvailability\(/);
  });

  it.each([CARD, DETAIL])('%s picks no status colour by hand', (path) => {
    const source = stripComments(fs.readFileSync(path, 'utf8'));
    // A screen reaching for `theme.colors.statusSuccess` directly is a screen
    // about to disagree with the other one.
    expect(source).not.toMatch(/theme\.colors\.status(Success|Warning|Danger|Neutral)\b/);
  });

  it('keeps the label out of the screens too', () => {
    // The card used to hold a private label map. Two maps drift like two tones.
    const card = stripComments(fs.readFileSync(CARD, 'utf8'));
    expect(card).not.toMatch(/Últimas unidades/);
    expect(card).not.toMatch(/'Agotado'/);
  });
});

describe('a repair card names the whole device', () => {
  it('lets the device summary use two lines', () => {
    // It is the field that says WHICH of the customer's devices this is.
    const source = fs.readFileSync('src/features/repairs/repair-card.tsx', 'utf8');
    // The name appears twice: once inside the card's accessibility label and
    // once as the rendered line. Anchor on the rendered one.
    const rendered = source.indexOf('>\n              {repair.deviceSummary}');
    expect(rendered).toBeGreaterThan(-1);
    const opening = source.slice(source.lastIndexOf('<Text', rendered), rendered);
    expect(opening).toMatch(/numberOfLines=\{2\}/);
  });
});

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Guards must not fire on the prose that explains them. */
function stripComments(source: string): string {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}
