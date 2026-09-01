import { screen } from '@testing-library/react-native';

import TabsLayout from '@/app/(tabs)/_layout';
import type { CompanyFeature } from '@/domain/company/types';

import { renderWithProviders } from './support/render';

/**
 * DEC-MOBILE-001 — the tab bar runs on the STABLE navigator, and per-tenant
 * feature flags hide a tab WITHOUT remounting the navigator.
 *
 * `expo-router/js-tabs` is stubbed so the assertions are about the options this
 * layout produces, not about React Navigation's internals. Each `Tabs.Screen`
 * is rendered as a testable node carrying its name and resolved `href`.
 */
jest.mock('expo-router/js-tabs', () => {
  const { View: MockView, Text: MockText } = require('react-native');

  const Tabs = ({ children }: { children: React.ReactNode }) => (
    <MockView testID="tabs-root">{children}</MockView>
  );

  Tabs.Screen = ({ name, options }: { name: string; options?: Record<string, unknown> }) => (
    <MockView testID={`tab-${name}`}>
      {/* `href: null` is how a tab is hidden without touching the screen list.
          `undefined` means the tab is reachable. */}
      <MockText testID={`tab-${name}-href`}>
        {options?.href === null ? 'hidden' : 'visible'}
      </MockText>
      <MockText testID={`tab-${name}-title`}>{String(options?.title ?? '')}</MockText>
    </MockView>
  );

  return { Tabs };
});

const mockFeatures = jest.fn<readonly CompanyFeature[], []>();
jest.mock('@/hooks/use-company-brand', () => ({
  useCompanyFeatures: () => mockFeatures(),
  // The theme provider reads the brand too, from UI7: the tenant's colour is
  // part of the resolved theme. A build with no brand renders achromatic.
  useCompanyBrand: () => ({ status: 'unavailable', reason: 'test' }),
}));

beforeEach(() => {
  mockFeatures.mockReturnValue(['shop', 'repairs', 'orders', 'support']);
});

describe('TabsLayout', () => {
  it('declares the five M0 tabs', async () => {
    await renderWithProviders(<TabsLayout />);

    for (const name of ['index', 'repairs', 'shop', 'orders', 'profile']) {
      expect(screen.getByTestId(`tab-${name}`)).toBeOnTheScreen();
    }
  });

  it('labels the tabs in Spanish', async () => {
    await renderWithProviders(<TabsLayout />);

    expect(screen.getByTestId('tab-index-title')).toHaveTextContent('Inicio');
    expect(screen.getByTestId('tab-repairs-title')).toHaveTextContent('Reparaciones');
    expect(screen.getByTestId('tab-shop-title')).toHaveTextContent('Tienda');
    expect(screen.getByTestId('tab-orders-title')).toHaveTextContent('Pedidos');
    expect(screen.getByTestId('tab-profile-title')).toHaveTextContent('Perfil');
  });

  it('shows every gated tab when the tenant enables all features', async () => {
    await renderWithProviders(<TabsLayout />);

    expect(screen.getByTestId('tab-repairs-href')).toHaveTextContent('visible');
    expect(screen.getByTestId('tab-shop-href')).toHaveTextContent('visible');
    expect(screen.getByTestId('tab-orders-href')).toHaveTextContent('visible');
  });

  it('hides a tab the tenant has not enabled', async () => {
    // A tenant with no workshop must not get a Repairs tab.
    mockFeatures.mockReturnValue(['shop', 'orders', 'support']);

    await renderWithProviders(<TabsLayout />);

    expect(screen.getByTestId('tab-repairs-href')).toHaveTextContent('hidden');
    expect(screen.getByTestId('tab-shop-href')).toHaveTextContent('visible');
  });

  it('keeps the hidden tab DECLARED, so toggling it cannot reset the navigator', async () => {
    // This is the whole reason for moving off Native Tabs: its `hidden` prop
    // removes the screen and remounts the navigator, losing navigation state.
    // `href: null` leaves the screen list intact.
    mockFeatures.mockReturnValue(['shop']);

    await renderWithProviders(<TabsLayout />);

    expect(screen.getByTestId('tab-repairs')).toBeOnTheScreen();
    expect(screen.getByTestId('tab-orders')).toBeOnTheScreen();
  });

  it('never gates Inicio or Perfil, which every tenant needs', async () => {
    mockFeatures.mockReturnValue([]);

    await renderWithProviders(<TabsLayout />);

    expect(screen.getByTestId('tab-index-href')).toHaveTextContent('visible');
    expect(screen.getByTestId('tab-profile-href')).toHaveTextContent('visible');
  });
});
