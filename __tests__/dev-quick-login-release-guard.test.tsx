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

/**
 * AND IT MUST NOT BE IN THE BUNDLE AT ALL.
 *
 * The runtime guard above is necessary and was not sufficient: a component
 * that returns null is still a module Metro packs, so `Demo123!` — the
 * fixture password this widget names — was a readable string inside the
 * production bundle. Found by exporting the app with production env and
 * running `strings` over the Hermes bytecode.
 *
 * The screen now requires the module under `__DEV__`, which the release build
 * replaces with `false`, so the branch is dead code and the module is dropped.
 * This asserts the shape of that, because the export itself is too slow to run
 * on every commit:
 *
 *     EXPO_PUBLIC_APP_ENV=production npx expo export --platform ios \
 *       --output-dir /tmp/export
 *     strings /tmp/export/_expo/static/js/ios/*.hbc | grep -c 'Demo123!'
 */
describe('the login screen', () => {
  type FS = { readFileSync(p: string, e: 'utf8'): string };
  const fs = jest.requireActual('fs') as FS;
  const source = fs.readFileSync('src/app/(auth)/login.tsx', 'utf8');

  it('never imports the quick login at the top level', () => {
    expect(source).not.toMatch(/^import .*dev-quick-login/m);
  });

  it('requires it only under `__DEV__`', () => {
    expect(source).toMatch(/__DEV__ \? require\('@\/features\/auth\/dev-quick-login'\)/);
  });

  it('renders nothing when the module was not required', () => {
    // The branch is `policy.mode === 'backend' && DevQuickLogin`, so a release
    // bundle cannot reach the element even if the mode says otherwise.
    expect(source).toMatch(/policy\.mode === 'backend' && DevQuickLogin \?/);
  });
});
