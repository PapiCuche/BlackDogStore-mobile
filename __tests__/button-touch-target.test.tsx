import { screen } from '@testing-library/react-native';

import { Button } from '@/design-system';
import { sizes } from '@/theme/sizes';

import { renderWithProviders } from './support/render';

/**
 * A compact button is drawn at 40 and must still be TOUCHABLE at 44.
 *
 * `sizes.minTouchTarget` calls itself «a floor for every pressable in the design
 * system, not a suggestion», and `IconButton` and `ListRow` reach it by simply
 * being 44 tall. `Button` in `compact` draws at `controlCompact` (40) — 4pt
 * short — and its own docstring claimed it "never drops below minTouchTarget".
 * The claim was false in nine screens.
 *
 * The fix keeps the drawing and grows the target with `hitSlop`, because a
 * compact control is compact ON PURPOSE: making it 44 tall would push every row
 * that uses one. Visual size and touch size are allowed to differ; that is what
 * hitSlop is for.
 */

describe('compact buttons stay touchable at the documented floor', () => {
  it('extends the touch target to minTouchTarget', async () => {
    await renderWithProviders(
      <Button label="Compacto" size="compact" onPress={jest.fn()} />,
    );

    const button = screen.getByRole('button', { name: 'Compacto' });
    const slop = button.props.hitSlop;

    expect(slop).toBeDefined();
    // Symmetric, so the target grows the same on both edges.
    const perSide = typeof slop === 'number' ? slop : slop.top;
    expect(perSide * 2 + sizes.controlCompact).toBeGreaterThanOrEqual(sizes.minTouchTarget);
  });

  it('adds nothing to the default size, which is already tall enough', async () => {
    // 52 > 44. Padding it further would make neighbouring controls harder to
    // hit, which is the opposite of the goal.
    await renderWithProviders(<Button label="Normal" onPress={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'Normal' }).props.hitSlop).toBeUndefined();
    expect(sizes.control).toBeGreaterThanOrEqual(sizes.minTouchTarget);
  });

  it('keeps the compact button drawn at its compact height', async () => {
    // The point of the fix: the target grows, the button does not.
    await renderWithProviders(
      <Button label="Compacto" size="compact" onPress={jest.fn()} />,
    );

    const style = screen.getByRole('button', { name: 'Compacto' }).props.style;
    const flat = Array.isArray(style) ? Object.assign({}, ...style.flat(9).filter(Boolean)) : style;
    expect(flat.minHeight).toBe(sizes.controlCompact);
  });

  it('still announces disabled and busy', async () => {
    // The states a screen reader needs, unchanged by the touch-target work.
    await renderWithProviders(
      <Button label="Cargando" size="compact" loading onPress={jest.fn()} />,
    );

    const button = screen.getByRole('button', { name: 'Cargando' });
    expect(button.props.accessibilityState).toMatchObject({ busy: true });
  });
});
