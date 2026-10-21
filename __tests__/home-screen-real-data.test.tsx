/**
 * THE «datos de ejemplo» NOTICE MUST NOT OUTLIVE THE EXAMPLES.
 *
 * Found in the native development build against a live backend: the home
 * screen rendered the notice unconditionally, so a customer reading real
 * repairs and real orders — fetched from the server, shown with the server's
 * own figures — was told they were examples.
 *
 * It is its own file because the condition is a MODULE-LEVEL flag: the mock
 * has to be in place before the screen is imported, and re-requiring the
 * screen inside one suite gives React a second instance of itself.
 */
jest.mock('@/config/env', () => ({
  ...jest.requireActual('@/config/env'),
  useMockData: false,
}));

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}));

import { screen, waitFor } from '@testing-library/react-native';

import HomeScreen from '@/app/(tabs)/index';

import { renderWithProviders } from './support/render';

describe('the home screen reading real data', () => {
  it('renders, and says nothing about examples', async () => {
    await renderWithProviders(<HomeScreen />);

    await waitFor(() => expect(screen.getByText(/Explorar tienda/i)).toBeTruthy());
    expect(screen.queryByText(/datos de ejemplo/i)).toBeNull();
  });
});
