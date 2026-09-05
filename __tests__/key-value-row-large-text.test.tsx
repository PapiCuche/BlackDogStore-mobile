import { screen } from '@testing-library/react-native';
import { useWindowDimensions } from 'react-native';

import { KeyValueRow } from '@/design-system';

import { renderWithProviders } from './support/render';

/**
 * An inline pair stops being a row when the text gets big enough.
 *
 * FOUND ON DEVICE. iPhone 17 Pro, iOS 26.3, dark theme, text size
 * `accessibility-large`, signed in as a real internal account: the inventory
 * summary drew "Productos con stock" beside "3 de 3". The label took the width
 * it needed and left the value a column so narrow it broke one word per line —
 * "3" / "de" / "3" — three stacked lines for a three-character answer.
 *
 * Nothing was lost, so this is not a P0; but a KPI that has to be reassembled
 * by eye is not a KPI, and `KeyValueRow` renders in nineteen places.
 *
 * WHY THIS FILE MOCKS `useWindowDimensions`. The default test environment
 * reports `fontScale: 1`, and at 1 the fixed and the broken component are
 * identical — a test written against the default would pass against the bug it
 * exists to catch. The scale IS the experiment, which is the same lesson the
 * safe-area test learned from `jest.setup` reporting every inset as 0.
 */

jest.mock('react-native/Libraries/Utilities/useWindowDimensions');

const mockedDimensions = useWindowDimensions as unknown as jest.Mock;

function atScale(fontScale: number) {
  mockedDimensions.mockReturnValue({
    width: 402,
    height: 874,
    scale: 3,
    fontScale,
  });
}

describe('KeyValueRow survives accessibility text sizes', () => {
  it('keeps an inline pair in one row at the default scale', async () => {
    atScale(1);
    await renderWithProviders(<KeyValueRow label="Productos con stock" value="3 de 3" />);

    expect(rowDirectionOf('3 de 3')).toBe('row');
  });

  it('stacks the pair once the text is large enough to squeeze the value', async () => {
    // The exact condition observed on device.
    atScale(1.6);
    await renderWithProviders(<KeyValueRow label="Productos con stock" value="3 de 3" />);

    expect(rowDirectionOf('3 de 3')).not.toBe('row');
  });

  it('still announces the pair as one fact after stacking', async () => {
    // Changing shape must not change what a screen reader hears.
    atScale(1.6);
    await renderWithProviders(<KeyValueRow label="Bajo mínimo" value="7" />);

    expect(screen.getByLabelText('Bajo mínimo: 7')).toBeTruthy();
  });

  it('does not turn an inline label into a caption when it stacks', async () => {
    // A KPI must not change weight just because somebody enlarged their text.
    // Only a pair the caller declared `stacked` gets the quieter caption label.
    atScale(1.6);
    const inline = await renderWithProviders(
      <KeyValueRow label="Unidades" value="44" emphasis="value" />,
    );
    const inlineSize = fontSizeOf('Unidades');
    inline.unmount();

    await renderWithProviders(<KeyValueRow layout="stacked" label="Unidades" value="44" />);

    expect(inlineSize).toBeGreaterThan(fontSizeOf('Unidades')!);
  });
});

function styleOf(text: string): Record<string, unknown> {
  const flat = [screen.getByText(text).props.style].flat(Infinity).filter(Boolean);
  return Object.assign({}, ...(flat as object[]));
}

function fontSizeOf(text: string): number | undefined {
  return styleOf(text).fontSize as number | undefined;
}

/** `flexDirection` of the container that holds the value. */
function rowDirectionOf(text: string): unknown {
  type Node = { props?: { style?: unknown }; parent?: Node | null };
  let node: Node | null = screen.getByText(text) as unknown as Node;

  for (let depth = 0; node && depth < 8; depth += 1) {
    const flat = [node.props?.style].flat(Infinity).filter(Boolean) as object[];
    const { flexDirection } = Object.assign({}, ...flat) as { flexDirection?: unknown };
    if (flexDirection !== undefined) return flexDirection;
    node = node.parent ?? null;
  }
  return undefined;
}
