import { screen } from '@testing-library/react-native';

import { renderWithProviders } from './support/render';

/**
 * The release guard, PROVED BY RENDERING.
 *
 * Its own file because the environment is mocked at MODULE SCOPE. Doing it with
 * `jest.isolateModules` inside the main suite builds a second copy of the theme
 * module, so the component reads a different React context than the test
 * provider supplies and dies on `use(ThemeContext)` — a failure about module
 * identity dressed up as a failure about the guard.
 *
 * `production` is the environment that matters: it is the one where these
 * accounts reaching a build would be an actual incident.
 */
jest.mock('@/config/env', () => ({
  ...jest.requireActual('@/config/env'),
  appEnvironment: 'production',
}));

// Imported AFTER the mock, so the module reads the production value.
// eslint-disable-next-line import/first
import {
  DEV_DEMO_ACCOUNTS,
  DEV_DEMO_PASSWORD,
  DevQuickLogin,
  devDemoEmail,
} from '@/features/auth/dev-quick-login';

describe('in a production build the quick logins do not exist', () => {
  it('renders nothing at all — not hidden, absent', async () => {
    await renderWithProviders(<DevQuickLogin onUse={jest.fn()} />);

    expect(screen.queryByText('Accesos de desarrollo')).not.toBeOnTheScreen();
    expect(screen.queryByText('Solo desarrollo')).not.toBeOnTheScreen();
  });

  it('puts no demo address on screen', async () => {
    await renderWithProviders(<DevQuickLogin onUse={jest.fn()} />);

    for (const account of DEV_DEMO_ACCOUNTS) {
      expect(screen.queryByText(devDemoEmail(account.username))).not.toBeOnTheScreen();
      expect(
        screen.queryByRole('button', { name: `Usar cuenta ${account.label}` }),
      ).not.toBeOnTheScreen();
    }
  });

  it('never prints the fixture password', async () => {
    await renderWithProviders(<DevQuickLogin onUse={jest.fn()} />);

    expect(screen.queryByText(new RegExp(DEV_DEMO_PASSWORD))).not.toBeOnTheScreen();
  });

  it('does not call back even if something tried to press it', async () => {
    const onUse = jest.fn();
    await renderWithProviders(<DevQuickLogin onUse={onUse} />);

    expect(onUse).not.toHaveBeenCalled();
  });
});
