import { screen } from '@testing-library/react-native';

import { ListRow } from '@/design-system';

import { renderWithProviders } from './support/render';

/**
 * A CHOSEN ROW HAS TO SAY SO.
 *
 * The theme picker in Profile is a radiogroup drawn as three rows with a «✓»
 * beside the chosen one. The tick is a `Text` inside the row, so VoiceOver read
 * «Oscuro, botón» for the selected option and «Claro, botón» for one that was
 * not — the same sentence for opposite states, with the difference carried
 * entirely by a glyph.
 *
 * Automation could not see it either, which is how it surfaced: a flow can
 * tap «Oscuro» and screenshot a dark screen, but it cannot assert that the app
 * believes dark is chosen.
 */

describe('ListRow', () => {
  it('announces a chosen row as a selected radio', async () => {
    await renderWithProviders(
      <ListRow label="Oscuro" selected onPress={() => undefined} />,
    );

    const row = screen.getByLabelText('Oscuro');
    expect(row.props.accessibilityRole).toBe('radio');
    expect(row.props.accessibilityState).toMatchObject({ selected: true });
  });

  it('announces an unchosen one as a radio that is not selected', async () => {
    await renderWithProviders(
      <ListRow label="Claro" selected={false} onPress={() => undefined} />,
    );

    const row = screen.getByLabelText('Claro');
    expect(row.props.accessibilityRole).toBe('radio');
    expect(row.props.accessibilityState).toMatchObject({ selected: false });
  });

  it('stays an ordinary button when the row is not a choice', async () => {
    await renderWithProviders(
      <ListRow label="Cerrar sesión" onPress={() => undefined} />,
    );

    const row = screen.getByLabelText('Cerrar sesión');
    expect(row.props.accessibilityRole).toBe('button');
    expect(row.props.accessibilityState?.selected).toBeUndefined();
  });
});
