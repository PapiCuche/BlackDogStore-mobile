import { screen } from '@testing-library/react-native';

import ShopScreen from '@/app/(tabs)/shop';
import HomeScreen from '@/app/(tabs)/index';
import { mockProducts } from '@/repositories/mock/fixtures';
import { FeatureUnavailableError } from '@/repositories/errors';

import { renderWithProviders } from './support/render';

/**
 * M1.1 — the states a screen can be in, and the fact that they are DIFFERENT.
 *
 * Four outcomes get confused constantly, and each confusion tells the customer
 * something false:
 *
 *   offline     we cannot reach the server right now
 *   unavailable this build has no backend for the feature
 *   empty       there IS data and there is none of it
 *   error       something failed and retrying might work
 */

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({}),
}));

const mockProductsQuery = jest.fn();
const mockCategoriesQuery = jest.fn();
const mockCatalogAvailable = jest.fn();

jest.mock('@/hooks/use-catalog', () => ({
  useProducts: () => mockProductsQuery(),
  useCategories: () => mockCategoriesQuery(),
  useProduct: () => mockProductsQuery(),
  isCatalogAvailable: () => mockCatalogAvailable(),
}));

const mockRepairsQuery = jest.fn();
const mockOrdersQuery = jest.fn();
jest.mock('@/hooks/use-repairs', () => ({ useRepairs: () => mockRepairsQuery() }));
jest.mock('@/hooks/use-orders', () => ({ useOrders: () => mockOrdersQuery() }));

function settled(overrides: Record<string, unknown> = {}) {
  return {
    data: undefined,
    error: null,
    isPending: false,
    isError: false,
    isRefetching: false,
    refetch: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCatalogAvailable.mockReturnValue(true);
  mockCategoriesQuery.mockReturnValue(settled({ data: [] }));
  mockProductsQuery.mockReturnValue(settled({ data: [...mockProducts] }));
  mockRepairsQuery.mockReturnValue(settled({ data: [] }));
  mockOrdersQuery.mockReturnValue(settled({ data: [] }));
});

describe('cached data survives going offline', () => {
  it('keeps showing the list rather than blanking it', async () => {
    await renderWithProviders(<ShopScreen />, { connectivity: 'offline' });

    // Yesterday's copy beats an error page.
    expect(screen.getByText(mockProducts[0]!.name)).toBeOnTheScreen();
  });

  it('states the caveat in product language', async () => {
    await renderWithProviders(<ShopScreen />, { connectivity: 'offline' });

    expect(
      screen.getByText('Sin conexión. Esta información puede no estar actualizada.'),
    ).toBeOnTheScreen();
  });

  it('says nothing about staleness when online', async () => {
    await renderWithProviders(<ShopScreen />, { connectivity: 'online' });

    expect(
      screen.queryByText('Sin conexión. Esta información puede no estar actualizada.'),
    ).not.toBeOnTheScreen();
  });

  it('does not claim staleness when offline with nothing cached', async () => {
    mockProductsQuery.mockReturnValue(settled({ data: [] }));

    await renderWithProviders(<ShopScreen />, { connectivity: 'offline' });

    // There is no stale data to warn about — the empty state speaks for itself.
    expect(
      screen.queryByText('Sin conexión. Esta información puede no estar actualizada.'),
    ).not.toBeOnTheScreen();
    expect(screen.getByText('Catálogo vacío')).toBeOnTheScreen();
  });
});

describe('unavailable is not offline, and neither is empty', () => {
  it('shows the unavailable state, not an offline one', async () => {
    mockCatalogAvailable.mockReturnValue(false);
    mockProductsQuery.mockReturnValue(
      settled({ isError: true, error: new FeatureUnavailableError('catalog', 'todavía no') }),
    );

    await renderWithProviders(<ShopScreen />, { connectivity: 'online' });

    expect(screen.getByText('Catálogo no disponible todavía')).toBeOnTheScreen();
    expect(screen.queryByText('Catálogo vacío')).not.toBeOnTheScreen();
  });

  it('keeps the unavailable state even while offline', async () => {
    // A feature with no backend does not become an offline problem just
    // because the radio also happens to be off.
    mockCatalogAvailable.mockReturnValue(false);
    mockProductsQuery.mockReturnValue(
      settled({ isError: true, error: new FeatureUnavailableError('catalog', 'todavía no') }),
    );

    await renderWithProviders(<ShopScreen />, { connectivity: 'offline' });

    expect(screen.getByText('Catálogo no disponible todavía')).toBeOnTheScreen();
  });

  it('shows empty when there is a catalogue with nothing in it', async () => {
    mockProductsQuery.mockReturnValue(settled({ data: [] }));

    await renderWithProviders(<ShopScreen />, { connectivity: 'online' });

    expect(screen.getByText('Catálogo vacío')).toBeOnTheScreen();
  });
});

describe('Home — partial resilience', () => {
  it('still renders when repairs have no backend', async () => {
    mockRepairsQuery.mockReturnValue(
      settled({ isError: true, error: new FeatureUnavailableError('repairs', 'no backend') }),
    );

    await renderWithProviders(<HomeScreen />);

    // One dead section must not take the screen down.
    expect(screen.getByText('Explorar tienda')).toBeOnTheScreen();
    expect(screen.getByText('Accesos rápidos')).toBeOnTheScreen();
  });

  it('hides the repairs section rather than calling it empty', async () => {
    mockRepairsQuery.mockReturnValue(
      settled({ isError: true, error: new FeatureUnavailableError('repairs', 'no backend') }),
    );

    await renderWithProviders(<HomeScreen />);

    // "No tienes reparaciones activas" is a claim about the customer's account,
    // and it would be false.
    expect(screen.queryByText('No tienes reparaciones activas')).not.toBeOnTheScreen();
    expect(screen.queryByText('Tu reparación')).not.toBeOnTheScreen();
  });

  it('survives BOTH private sections being unavailable', async () => {
    mockRepairsQuery.mockReturnValue(
      settled({ isError: true, error: new FeatureUnavailableError('repairs', 'x') }),
    );
    mockOrdersQuery.mockReturnValue(
      settled({ isError: true, error: new FeatureUnavailableError('orders', 'x') }),
    );

    await renderWithProviders(<HomeScreen />);

    expect(screen.getByText('Explorar tienda')).toBeOnTheScreen();
    expect(screen.queryByText('Pedido reciente')).not.toBeOnTheScreen();
  });

  it('keeps the repairs section when it merely has no active repair', async () => {
    mockRepairsQuery.mockReturnValue(settled({ data: [] }));

    await renderWithProviders(<HomeScreen />);

    // Genuinely empty is a legitimate thing to say.
    expect(screen.getByText('No tienes reparaciones activas')).toBeOnTheScreen();
  });
});
