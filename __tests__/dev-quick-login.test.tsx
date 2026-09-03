import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import LoginScreen from '@/app/(auth)/login';
import { AuthProvider } from '@/auth/auth-provider';
import type { AuthRuntimePolicy } from '@/auth/auth-policy';
import type { AuthRepository } from '@/auth/auth-repository';
import type { AuthSession } from '@/auth/types';
import {
  DEV_DEMO_ACCOUNTS,
  DEV_DEMO_PASSWORD,
  devDemoEmail,
  devQuickLoginAvailable,
} from '@/features/auth/dev-quick-login';

import { renderWithProviders } from './support/render';

/**
 * Development quick logins.
 *
 * The whole point of the feature is that it is NOT an authentication path, so
 * most of this file is about what it does not do: no token, no session, no
 * navigation, no capability, and nothing at all outside a development build.
 * The prose in the component claims that; these assert it.
 */

const mockRouterReplace = jest.fn();
jest.mock('expo-router', () => ({
  router: { replace: (...a: unknown[]) => mockRouterReplace(...a), push: jest.fn(), dismissTo: jest.fn() },
  Link: ({ children }: { children: ReactNode }) => children,
  Stack: { Screen: () => null },
}));

const BACKEND: AuthRuntimePolicy = {
  mode: 'backend',
  decision: 'backend-contract-ready',
  reason: 'test',
};
const MOCK: AuthRuntimePolicy = {
  mode: 'mock',
  decision: 'mock-development',
  reason: 'test',
};
const UNAVAILABLE: AuthRuntimePolicy = {
  mode: 'unavailable',
  decision: 'unavailable-production-mock-forbidden',
  reason: 'test',
};

const SESSION: AuthSession = {
  user: {
    id: 1, username: 'dev_inventory', email: 'dev_inventory@example.invalid',
    firstName: '', lastName: '', role: 'customer', isEmailVerified: true,
  },
  availableCompanies: [],
  accessContexts: [],
  platform: { isMaster: false },
} as unknown as AuthSession;

function repositoryWithSpy() {
  const signIn = jest.fn(async (): Promise<AuthSession> => SESSION);
  const repository: AuthRepository = {
    restoreSession: jest.fn(async () => null),
    signIn: signIn as unknown as AuthRepository['signIn'],
    register: jest.fn(),
    signOut: jest.fn(async () => undefined),
  } as unknown as AuthRepository;
  return { repository, signIn };
}

function withAuth(policy: AuthRuntimePolicy, repository: AuthRepository | null, children: ReactNode) {
  return (
    <AuthProvider repository={repository} policy={policy}>
      {children}
    </AuthProvider>
  );
}

afterEach(() => {
  mockRouterReplace.mockClear();
});

describe('the fixture matches the backend seeder', () => {
  it('is exactly the six accounts seed_demo_users creates', () => {
    // Not a superset and not a guess. `seed_demo_users` builds one customer,
    // four internal users and one platform master; inventing a seventh here
    // would produce a button that cannot log in.
    expect(DEV_DEMO_ACCOUNTS.map((a) => a.username)).toEqual([
      'dev_customer',
      'dev_sales',
      'dev_inventory',
      'dev_technician',
      'dev_admin',
      'dev_master',
    ]);
  });

  it('uses the password the seeder sets', () => {
    expect(DEV_DEMO_PASSWORD).toBe('Demo123!');
  });

  it('identifies accounts by EMAIL, never by bare username', () => {
    // The Web widget fills a username because the browser contract takes one.
    // `/api/v1/auth/login/` takes an email, so filling `dev_inventory` would
    // look like "the demo account does not work".
    for (const account of DEV_DEMO_ACCOUNTS) {
      const email = devDemoEmail(account.username);
      expect(email).toBe(`${account.username}@example.invalid`);
      expect(email).not.toBe(account.username);
    }
  });

  it('keeps every address inside the reserved .invalid domain', () => {
    // RFC 2606. An address here can never be deliverable, which is what makes
    // the fixture safe to name in source.
    for (const account of DEV_DEMO_ACCOUNTS) {
      expect(devDemoEmail(account.username)).toMatch(/@example\.invalid$/);
    }
  });

  it('gives every account a label and a destination that describe MOBILE', () => {
    for (const account of DEV_DEMO_ACCOUNTS) {
      expect(account.label.trim().length).toBeGreaterThan(0);
      expect(account.destination.trim().length).toBeGreaterThan(0);
    }
    // Web marks Técnico as pending. Mobile shipped the whole service chain in
    // M8–M12B, so copying that flag would state something false about this app.
    const technician = DEV_DEMO_ACCOUNTS.find((a) => a.username === 'dev_technician');
    expect(technician?.destination).not.toMatch(/pendiente|pending|próximamente/i);
  });
});

describe('release guard — the pure function', () => {
  it('offers the accounts in development', () => {
    expect(devQuickLoginAvailable('development')).toBe(true);
  });

  it('offers nothing in staging', () => {
    expect(devQuickLoginAvailable('staging')).toBe(false);
  });

  it('offers nothing in production', () => {
    expect(devQuickLoginAvailable('production')).toBe(false);
  });
});

describe('on the login screen', () => {
  it('appears over a REAL login', async () => {
    const { repository } = repositoryWithSpy();
    await renderWithProviders(withAuth(BACKEND, repository, <LoginScreen />));

    expect(screen.getByText('Accesos de desarrollo')).toBeOnTheScreen();
    expect(screen.getByText('dev_inventory@example.invalid')).toBeOnTheScreen();
  });

  it('does NOT appear over the mock login', async () => {
    // These are rows in a Django database. Offering them over a login that
    // verifies nothing would present them as real sessions, and the two look
    // identical on screen.
    const { repository } = repositoryWithSpy();
    await renderWithProviders(withAuth(MOCK, repository, <LoginScreen />));

    expect(screen.queryByText('Accesos de desarrollo')).not.toBeOnTheScreen();
    expect(screen.queryByText('dev_inventory@example.invalid')).not.toBeOnTheScreen();
  });

  it('does not regress the unavailable screen', async () => {
    await renderWithProviders(withAuth(UNAVAILABLE, null, <LoginScreen />));

    expect(screen.getByText('Acceso temporalmente no disponible')).toBeOnTheScreen();
    expect(screen.queryByText('Accesos de desarrollo')).not.toBeOnTheScreen();
    expect(screen.queryByLabelText('Contraseña')).not.toBeOnTheScreen();
  });

  it('offers one button per account, named so a screen reader can tell them apart', async () => {
    const { repository } = repositoryWithSpy();
    await renderWithProviders(withAuth(BACKEND, repository, <LoginScreen />));

    for (const account of DEV_DEMO_ACCOUNTS) {
      expect(
        screen.getByRole('button', { name: `Usar cuenta ${account.label}` }),
      ).toBeOnTheScreen();
    }
  });
});

describe('fill-only — no bypass', () => {
  it('fills both fields and signs nobody in', async () => {
    const { repository, signIn } = repositoryWithSpy();
    await renderWithProviders(withAuth(BACKEND, repository, <LoginScreen />));

    fireEvent.press(screen.getByRole('button', { name: 'Usar cuenta Inventario' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Correo electrónico').props.value)
        .toBe('dev_inventory@example.invalid');
    });
    expect(screen.getByLabelText('Contraseña').props.value).toBe('Demo123!');

    // THE POINT OF THE WHOLE FEATURE: selecting an account is not logging in.
    expect(signIn).not.toHaveBeenCalled();
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it('reaches the real sign-in only when the operator presses Entrar', async () => {
    const { repository, signIn } = repositoryWithSpy();
    await renderWithProviders(withAuth(BACKEND, repository, <LoginScreen />));

    fireEvent.press(screen.getByRole('button', { name: 'Usar cuenta Inventario' }));
    await waitFor(() => {
      expect(screen.getByLabelText('Correo electrónico').props.value)
        .toBe('dev_inventory@example.invalid');
    });

    fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => {
      expect(signIn).toHaveBeenCalledTimes(1);
    });
    // The ordinary contract, unchanged: an EMAIL in `identifier`, and the
    // password straight through. Nothing extra, no marker saying "this one is a
    // demo" — the server must not be able to tell, and does not need to.
    expect(signIn).toHaveBeenCalledWith({
      identifier: 'dev_inventory@example.invalid',
      password: 'Demo123!',
    });
  });

  it.each(DEV_DEMO_ACCOUNTS.map((a) => [a.label, a.username] as const))(
    'sends %s through the same real path',
    async (label, username) => {
      const { repository, signIn } = repositoryWithSpy();
      await renderWithProviders(withAuth(BACKEND, repository, <LoginScreen />));

      fireEvent.press(screen.getByRole('button', { name: `Usar cuenta ${label}` }));
      await waitFor(() => {
        expect(screen.getByLabelText('Correo electrónico').props.value)
          .toBe(`${username}@example.invalid`);
      });
      fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));

      await waitFor(() => {
        expect(signIn).toHaveBeenCalledWith({
          identifier: `${username}@example.invalid`,
          password: 'Demo123!',
        });
      });
    },
  );
});

describe('structural — there is no back door', () => {
  type FS = { readFileSync(p: string, e: 'utf8'): string };
  const fs = jest.requireActual('fs') as FS;

  function code(path: string): string {
    return fs
      .readFileSync(path, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .map((line) => {
        const t = line.trim();
        if (t.startsWith('//') || t.startsWith('*')) return '';
        return line.replace(/(^|[^:])\/\/.*$/, '$1');
      })
      .join('\n');
  }

  const COMPONENT = 'src/features/auth/dev-quick-login.tsx';

  it('touches no token, no storage and no session', () => {
    const source = code(COMPONENT);
    for (const forbidden of [
      /SecureStore/, /secure-storage/, /AsyncStorage/,
      /signIn/, /useAuth/, /AuthProvider/, /setSession/,
      /accessToken/i, /refreshToken/i, /Bearer/,
      /capabilit/i, /companySlug/, /tenant/i,
    ]) {
      expect(source).not.toMatch(forbidden);
    }
  });

  it('does not navigate', () => {
    const source = code(COMPONENT);
    expect(source).not.toMatch(/expo-router/);
    expect(source).not.toMatch(/router\./);
  });

  it('calls no API of its own', () => {
    const source = code(COMPONENT);
    expect(source).not.toMatch(/\/api\//);
    expect(source).not.toMatch(/authenticatedRequest|fetch\(/);
  });

  it('imports no blur — GlassSurface remains the only importer', () => {
    expect(code(COMPONENT)).not.toMatch(/expo-blur/);
  });

  it('hardcodes no colour', () => {
    const source = code(COMPONENT);
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(source).not.toMatch(/rgba?\(/);
  });

  it('never reads an account name back as authority', () => {
    // `label` and `username` are presentation and an email source. A comparison
    // against either would be a role check wearing a different hat.
    const source = code(COMPONENT);
    for (const forbidden of [
      /username\s*===/, /label\s*===/, /\brole\b\s*===/,
      /isAdmin/, /isMaster/, /isTechnician/, /isSales/, /isInventory/,
    ]) {
      expect(source).not.toMatch(forbidden);
    }
  });

  it('is wired into login as fill-only', () => {
    const login = code('src/app/(auth)/login.tsx');
    // setValue, and no submit next to it.
    expect(login).toMatch(/setValue\('email'/);
    expect(login).toMatch(/setValue\('password'/);
    const at = login.indexOf('<DevQuickLogin');
    const block = login.slice(at, at + 700);
    expect(block).not.toMatch(/onSubmit|handleSubmit|signIn|router\./);
  });

  it('consults the release guard and returns null, rather than hiding', () => {
    // The rendered proof lives in `dev-quick-login-release-guard.test.tsx`,
    // which mocks the environment at module scope — reloading this component
    // through `isolateModules` would build a SECOND copy of the theme module
    // and its context, and the failure would be about React, not about the
    // guard. This half checks the shape; that file checks the behaviour.
    const source = code(COMPONENT);
    expect(source).toMatch(/if \(!devQuickLoginAvailable\(appEnvironment\)\) return null;/);
    // No style-based hiding anywhere.
    expect(source).not.toMatch(/display:\s*'none'/);
    expect(source).not.toMatch(/opacity:\s*0\b/);
  });

  it('is gated on backend mode at the call site', () => {
    const login = code('src/app/(auth)/login.tsx');
    // The condition and the component, in that order, with nothing between them
    // that could render the block under another mode.
    const gate = login.indexOf("policy.mode === 'backend'");
    expect(gate).toBeGreaterThan(-1);
    expect(login.indexOf('<DevQuickLogin')).toBeGreaterThan(gate);
    expect(login.slice(gate, login.indexOf('<DevQuickLogin'))).not.toMatch(/\bmock\b/);
  });
});
