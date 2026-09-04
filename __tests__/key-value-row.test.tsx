import { screen } from '@testing-library/react-native';

import { KeyValueRow } from '@/design-system';

import { renderWithProviders } from './support/render';

type FS = { readFileSync(p: string, e: 'utf8'): string };
const fs = jest.requireActual('fs') as FS;

/**
 * A label and its value, announced as ONE fact.
 *
 * Five screens had each written this component privately — `DetailRow`,
 * `Field`, `Row`, `SummaryRow`, `Metric` — and only two of the five made the
 * pair a single accessible node. On the other three a screen-reader user heard
 * "Recibido por", then "Ana Torres", as two unrelated stops in a list of twenty,
 * and had to join them by memory.
 *
 * The point of these tests is the invariant that survives the next refactor: the
 * pair is one node, in every layout, always.
 */

describe('a key/value pair is one accessible fact', () => {
  it('announces label and value together when stacked', async () => {
    await renderWithProviders(
      <KeyValueRow layout="stacked" label="Recibido por" value="Ana Torres" />,
    );

    expect(screen.getByLabelText('Recibido por: Ana Torres')).toBeTruthy();
  });

  it('announces label and value together when inline', async () => {
    await renderWithProviders(<KeyValueRow label="Sucursal" value="Miraflores" />);

    expect(screen.getByLabelText('Sucursal: Miraflores')).toBeTruthy();
  });

  it('still announces the pair when the value is shown as a badge', async () => {
    // The badge is a visual weight, not a different kind of information. A
    // reader who cannot see it must still get the same sentence.
    await renderWithProviders(<KeyValueRow label="Bajo mínimo" value="7" badge />);

    expect(screen.getByLabelText('Bajo mínimo: 7')).toBeTruthy();
    expect(screen.getByText('7')).toBeTruthy();
  });
});

describe('the value is rendered exactly as it arrived', () => {
  it.each([
    ['a currency the server computed', 'S/ 1,240.50'],
    ['a count', '0'],
    ['an em dash standing in for nothing', '—'],
    ['an identifier', 'SO-1042'],
  ])('prints %s unchanged', async (_case, value) => {
    // This component must never become a place where a server-owned number is
    // reformatted, rounded or "tidied". It prints the string it was handed.
    await renderWithProviders(<KeyValueRow label="Total" value={value} />);

    expect(screen.getByText(value)).toBeTruthy();
  });
});

describe('emphasis is a real scale, not a boolean', () => {
  // The screens this replaced used three weights and each meant something. If
  // the middle one is ever collapsed into the other two, an inventory KPI and an
  // ordinary row become indistinguishable, which is the drift this replaced.
  it('gives a plain row, a KPI and a conclusion three different value sizes', async () => {
    // All three in ONE tree, told apart by their values, so the comparison is
    // between three things rendered under identical conditions.
    await renderWithProviders(
      <>
        <KeyValueRow label="Ordinaria" value="11" />
        <KeyValueRow label="KPI" value="22" emphasis="value" />
        <KeyValueRow label="Conclusión" value="33" emphasis="pair" />
      </>,
    );

    const fontSizeOf = (text: string) => {
      const style = [screen.getByText(text).props.style].flat(Infinity);
      const sizes = (style.filter(Boolean) as { fontSize?: number }[])
        .map((s) => s?.fontSize)
        .filter((n): n is number => typeof n === 'number');
      return sizes.at(-1);
    };

    const none = fontSizeOf('11');
    const value = fontSizeOf('22');
    const pair = fontSizeOf('33');

    expect(none).toBeDefined();
    expect(value).toBeGreaterThan(none!);
    expect(pair).toBeGreaterThan(value!);
  });
});

describe('the inline value may wrap rather than truncate', () => {
  it('sets no numberOfLines on the value', async () => {
    // One of the five originals capped the value at two lines. At 1.6x text
    // size a customer's full name stopped fitting and lost its end to an
    // ellipsis — on an operator's screen, where the name is the point. Wrapping
    // costs a row of pixels; truncating costs the information.
    await renderWithProviders(
      <KeyValueRow label="Cliente" value="María Fernanda del Águila Rodríguez" />,
    );

    const node = screen.getByText('María Fernanda del Águila Rodríguez');
    expect(node.props.numberOfLines).toBeUndefined();
  });
});

describe('screens do not re-invent this component', () => {
  const SCREENS = [
    'src/app/repairs/[id].tsx',
    'src/app/orders/[id].tsx',
    'src/app/internal/inventory/index.tsx',
    'src/app/internal/service/orders/[id].tsx',
  ];

  it.each(SCREENS)('%s defines no private label/value component', (path) => {
    const source = stripComments(fs.readFileSync(path, 'utf8'));

    // The five that existed, by the names they actually had. A screen that
    // brings one back gets a different set of typography and, on the evidence,
    // forgets the accessibility label.
    expect(source).not.toMatch(/function (DetailRow|Field|Row|SummaryRow|Metric)\s*\(/);
  });

  it.each(SCREENS)('%s uses the shared primitive', (path) => {
    expect(fs.readFileSync(path, 'utf8')).toMatch(/<KeyValueRow/);
  });
});

/**
 * Comments explain what the code must NOT do, and they name the very things the
 * guards above scan for. Stripping them keeps a guard from firing on its own
 * explanation.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}
