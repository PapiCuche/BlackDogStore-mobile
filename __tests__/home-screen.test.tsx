import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import HomeScreen from '@/app/(tabs)/index';
import type { AuthRepository } from '@/auth/auth-repository';
import type { AuthSession } from '@/auth/types';
import { mockOrders } from '@/repositories/mock/fixtures';

import { renderWithProviders } from './support/render';

/**
 * `router` is the only piece of Expo Router the Home screen touches. Mocking it
 * keeps the test about the screen's behaviour instead of about navigation
 * internals, and lets the destinations be asserted directly.
 */
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
}));

beforeEach(() => {
  mockPush.mockClear();
});

/**
 * A repository that restores an existing session on mount.
 *
 * `MockAuthRepository` deliberately restores nothing — a fake session must not
 * survive a relaunch — so a signed-in screen has to be set up explicitly.
 */
function signedInAs(firstName: string): AuthRepository {
  const session: AuthSession = {
    user: {
      id: 1,
      username: firstName.toLowerCase(),
      email: `${firstName.toLowerCase()}@example.com`,
      firstName,
      lastName: 'Mau',
      role: 'customer',
      isEmailVerified: true,
    },
    mode: 'mock',
    expiresAt: null,
    tenant: null,
  };
  return {
    restoreSession: async () => session,
    signIn: async () => session,
    register: async () => session,
    signOut: async () => undefined,
  };
}

/** The order the screen must surface: the most recently created one. */
const newestOrder = [...mockOrders].sort(
  (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
)[0]!;

describe('HomeScreen', () => {
  it('greets the signed-in customer by name', async () => {
    await renderWithProviders(<HomeScreen />, {
      authRepository: signedInAs('Carlos'),
    });

    await waitFor(() => {
      expect(screen.getByText('Hola, Carlos')).toBeOnTheScreen();
    });
  });

  it('falls back to the company name when nobody is signed in', async () => {
    await renderWithProviders(<HomeScreen />);
    await waitFor(() => {
      expect(screen.getByText('Black Dog Store')).toBeOnTheScreen();
    });
  });

  it('surfaces the active repair, not a finished one', async () => {
    await renderWithProviders(<HomeScreen />);

    // 'r-1042' is in_repair and most recently updated; 'r-1021' is delivered.
    await waitFor(() => {
      expect(screen.getByText('MacBook Pro 14"')).toBeOnTheScreen();
    });
    expect(screen.queryByText('iPad Air 4')).not.toBeOnTheScreen();
  });

  it('shows the repair status as text', async () => {
    await renderWithProviders(<HomeScreen />);
    await waitFor(() => {
      expect(screen.getByLabelText('Estado de la reparación: En reparación')).toBeOnTheScreen();
    });
  });

  it('navigates to the repair tracking screen', async () => {
    await renderWithProviders(<HomeScreen />);

    await waitFor(() => expect(screen.getByText('Ver seguimiento')).toBeOnTheScreen());
    await fireEvent.press(screen.getByRole('button', { name: 'Ver seguimiento' }));

    expect(mockPush).toHaveBeenCalledWith('/repairs/r-1042');
  });

  it('shows the most recent order with both statuses separated', async () => {
    await renderWithProviders(<HomeScreen />);

    await waitFor(() => {
      expect(screen.getByText(`Pedido #${newestOrder.id}`)).toBeOnTheScreen();
    });

    // Payment and fulfilment are announced independently — never merged.
    expect(screen.getByLabelText('Pago: Pagado')).toBeOnTheScreen();
    expect(screen.getByLabelText('Entrega: En preparación')).toBeOnTheScreen();
  });

  it('navigates to the order detail', async () => {
    await renderWithProviders(<HomeScreen />);

    await waitFor(() => expect(screen.getByText('Ver pedido')).toBeOnTheScreen());
    await fireEvent.press(screen.getByRole('button', { name: 'Ver pedido' }));

    expect(mockPush).toHaveBeenCalledWith(`/orders/${newestOrder.id}`);
  });

  it('offers a route into the shop', async () => {
    await renderWithProviders(<HomeScreen />);

    await waitFor(() => expect(screen.getByText('Explorar tienda')).toBeOnTheScreen());
    await fireEvent.press(screen.getByRole('button', { name: 'Explorar la tienda' }));

    expect(mockPush).toHaveBeenCalledWith('/(tabs)/shop');
  });

  it('tells the user the data is not real', async () => {
    // Non-negotiable while the app runs on fixtures: a demo screen that looks
    // live is how a stakeholder concludes a feature is integrated.
    await renderWithProviders(<HomeScreen />);
    await waitFor(() => {
      expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
    });
  });

  it('marks its section titles as headers for rotor navigation', async () => {
    await renderWithProviders(<HomeScreen />);
    await waitFor(() => {
      expect(screen.getAllByRole('header').length).toBeGreaterThanOrEqual(2);
    });
  });
});
