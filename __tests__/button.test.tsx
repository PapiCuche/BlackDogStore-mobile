import { fireEvent, screen } from '@testing-library/react-native';

import { Button } from '@/design-system';

import { renderWithProviders } from './support/render';

describe('Button', () => {
  it('renders its label and calls onPress', async () => {
    const onPress = jest.fn();
    await renderWithProviders(<Button label="Ver seguimiento" onPress={onPress} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Ver seguimiento' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('exposes itself as a button to assistive technology', async () => {
    await renderWithProviders(<Button label="Entrar" onPress={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeOnTheScreen();
  });

  it('does not fire while disabled', async () => {
    const onPress = jest.fn();
    await renderWithProviders(<Button label="Entrar" onPress={onPress} disabled />);

    await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));

    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeDisabled();
  });

  it('does not fire while loading, and announces itself as busy', async () => {
    const onPress = jest.fn();
    await renderWithProviders(<Button label="Entrar" onPress={onPress} loading />);

    const button = screen.getByRole('button', { name: 'Entrar' });
    await fireEvent.press(button);

    // Without `busy`, a screen reader user gets silence during the request.
    expect(onPress).not.toHaveBeenCalled();
    expect(button).toBeBusy();
  });

  it('keeps the label visible while loading so the layout does not jump', async () => {
    await renderWithProviders(<Button label="Entrar" onPress={jest.fn()} loading />);
    expect(screen.getByText('Entrar')).toBeOnTheScreen();
  });

  it('carries an accessibility hint when one is given', async () => {
    await renderWithProviders(
      <Button label="Ver pedido" onPress={jest.fn()} accessibilityHint="Abre el detalle" />,
    );
    expect(screen.getByA11yHint('Abre el detalle')).toBeOnTheScreen();
  });

  it('meets the minimum touch target even when compact', async () => {
    await renderWithProviders(<Button label="Ver todos" onPress={jest.fn()} size="compact" />);

    // `sizes.controlCompact` is 40 with 8pt of vertical padding, so the real
    // target clears the 44pt HIG floor.
    expect(screen.getByRole('button', { name: 'Ver todos' })).toHaveStyle({ minHeight: 40 });
  });
});
