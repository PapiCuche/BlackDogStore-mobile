import { screen } from '@testing-library/react-native';

import ShopScreen from '@/app/(tabs)/shop';
import ProductDetailScreen from '@/app/products/[slug]';
import { mockProducts } from '@/repositories/mock/fixtures';
import { FeatureUnavailableError } from '@/repositories/errors';

import { renderWithProviders } from './support/render';

/**
 * M0.2 — the copy a shopper actually sees.
 *
 * Three outcomes that must never be confused:
 *
 *   UNAVAILABLE  the app has no safe catalogue source in this build
 *   EMPTY        there is a catalogue and it holds nothing
 *   NOT FOUND    there is a catalogue and this product is not in it
 *
 * Saying "esta tienda no tiene productos" when the truth is the first one is a
 * false statement about the business, and it is the exact mistake a null
 * repository invites.
 */

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ slug: 'iphone-15-pro-256' }),
}));

const UNAVAILABLE_MESSAGE =
  'Estamos preparando la conexión segura con el catálogo de esta empresa. Vuelve a intentarlo más adelante.';

const mockProductsQuery = jest.fn();
const mockCategoriesQuery = jest.fn();
const mockProductQuery = jest.fn();
const mockCatalogAvailable = jest.fn();

jest.mock('@/hooks/use-catalog', () => ({
  useProducts: () => mockProductsQuery(),
  useCategories: () => mockCategoriesQuery(),
  useProduct: () => mockProductQuery(),
  isCatalogAvailable: () => mockCatalogAvailable(),
}));

/** Shape of a settled TanStack Query result, reduced to what the screens read. */
function settled(overrides: Record<string, unknown> = {}) {
  return {
    data: undefined,
    error: null,
    isPending: false,
    isError: false,
    isRefetching: false,
    refetch: jest.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCatalogAvailable.mockReturnValue(true);
  mockCategoriesQuery.mockReturnValue(settled({ data: [] }));
});

describe('ShopScreen — catalogue unavailable', () => {
  beforeEach(() => {
    mockCatalogAvailable.mockReturnValue(false);
    mockProductsQuery.mockReturnValue(
      settled({
        isError: true,
        error: new FeatureUnavailableError('catalog', UNAVAILABLE_MESSAGE),
      }),
    );
  });

  it('says the catalogue is not ready, not that the shop is empty', async () => {
    await renderWithProviders(<ShopScreen />);

    expect(screen.getByText('Catálogo no disponible todavía')).toBeOnTheScreen();
    expect(screen.queryByText('Catálogo vacío')).not.toBeOnTheScreen();
  });

  it('uses customer copy with no technical jargon', async () => {
    await renderWithProviders(<ShopScreen />);

    const message = screen.getByText(UNAVAILABLE_MESSAGE);
    expect(message).toBeOnTheScreen();
    // A shopper must never be shown a backend requirement id or an endpoint.
    expect(screen.queryByText(/BR-\d+/)).not.toBeOnTheScreen();
    expect(screen.queryByText(/api\/products/)).not.toBeOnTheScreen();
    expect(screen.queryByText(/tenant/i)).not.toBeOnTheScreen();
  });

  it('hides the search field, which could not answer anyway', async () => {
    await renderWithProviders(<ShopScreen />);

    expect(screen.queryByLabelText('Buscar productos')).not.toBeOnTheScreen();
  });

  it('offers no retry, because retrying cannot fix a missing contract', async () => {
    await renderWithProviders(<ShopScreen />);

    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeOnTheScreen();
  });
});

describe('ShopScreen — catalogue present but empty', () => {
  it('says the catalogue is empty, which is a different statement', async () => {
    mockCatalogAvailable.mockReturnValue(true);
    mockProductsQuery.mockReturnValue(settled({ data: [] }));

    await renderWithProviders(<ShopScreen />);

    expect(screen.getByText('Catálogo vacío')).toBeOnTheScreen();
    expect(screen.queryByText('Catálogo no disponible todavía')).not.toBeOnTheScreen();
  });

  it('still renders the search field when a catalogue exists', async () => {
    mockCatalogAvailable.mockReturnValue(true);
    mockProductsQuery.mockReturnValue(settled({ data: [] }));

    await renderWithProviders(<ShopScreen />);

    expect(screen.getByLabelText('Buscar productos')).toBeOnTheScreen();
  });

  it('renders products normally when the mock catalogue is working', async () => {
    mockCatalogAvailable.mockReturnValue(true);
    mockProductsQuery.mockReturnValue(settled({ data: [...mockProducts] }));

    await renderWithProviders(<ShopScreen />);

    expect(screen.getByText(mockProducts[0]!.name)).toBeOnTheScreen();
  });
});

describe('ProductDetailScreen — unavailable vs not found', () => {
  it('reports the catalogue as unavailable, not the product as missing', async () => {
    mockProductQuery.mockReturnValue(
      settled({
        isError: true,
        error: new FeatureUnavailableError('catalog', UNAVAILABLE_MESSAGE),
      }),
    );

    await renderWithProviders(<ProductDetailScreen />);

    expect(screen.getByText('Catálogo no disponible todavía')).toBeOnTheScreen();
    // Telling someone their link is dead when the app has no catalogue sends
    // them looking for a problem that is not theirs.
    expect(screen.queryByText('Producto no encontrado')).not.toBeOnTheScreen();
  });

  it('reports a genuine missing product as not found', async () => {
    mockProductQuery.mockReturnValue(settled({ data: null }));

    await renderWithProviders(<ProductDetailScreen />);

    expect(screen.getByText('Producto no encontrado')).toBeOnTheScreen();
    expect(screen.queryByText('Catálogo no disponible todavía')).not.toBeOnTheScreen();
  });

  it('renders a product normally when one is returned', async () => {
    mockProductQuery.mockReturnValue(settled({ data: mockProducts[0] }));

    await renderWithProviders(<ProductDetailScreen />);

    expect(screen.getByText(mockProducts[0]!.name)).toBeOnTheScreen();
  });
});
