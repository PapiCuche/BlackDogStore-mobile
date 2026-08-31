import { screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { AuthProvider } from '@/auth/auth-provider';
import type { AuthRuntimePolicy } from '@/auth/auth-policy';
import LoginScreen from '@/app/(auth)/login';
import RegisterScreen from '@/app/(auth)/register';
import ForgotPasswordScreen from '@/app/(auth)/forgot-password';
import VerifyEmailScreen from '@/app/(auth)/verify-email';

import { renderWithProviders } from './support/render';

/**
 * M1 — what a release build without an auth contract actually shows.
 *
 * The rule: never a form that cannot succeed. A password typed into a field
 * that will always reject it teaches the user their credentials are wrong.
 */

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), dismissTo: jest.fn() },
  Link: ({ children }: { children: ReactNode }) => children,
  Stack: { Screen: () => null },
}));

const UNAVAILABLE: AuthRuntimePolicy = {
  mode: 'unavailable',
  decision: 'unavailable-production-mock-forbidden',
  reason: 'No hay contrato de autenticación nativo.',
};
const MOCK: AuthRuntimePolicy = {
  mode: 'mock',
  decision: 'mock-development',
  reason: 'Autenticación simulada de desarrollo.',
};

/**
 * Wrap a screen in an AuthProvider with the given policy.
 *
 * Nested INSIDE `renderWithProviders` rather than passed as its `wrapper`
 * option: that option would replace the theme/query providers the screen also
 * needs. The inner provider is the one `useAuth` resolves to.
 */
function withAuth(policy: AuthRuntimePolicy, children: ReactNode) {
  return (
    <AuthProvider repository={policy.mode === 'unavailable' ? null : undefined} policy={policy}>
      {children}
    </AuthProvider>
  );
}

describe('auth unavailable — every entry screen', () => {
  it.each([
    ['Login', LoginScreen, 'Acceso temporalmente no disponible'],
    ['Register', RegisterScreen, 'Registro no disponible en la app'],
    ['Forgot password', ForgotPasswordScreen, 'Recuperación no disponible en la app'],
    ['Verify email', VerifyEmailScreen, 'Verificación no disponible en la app'],
  ])('%s shows an unavailable state instead of a form', async (_name, Screen_, title) => {
    await renderWithProviders(withAuth(UNAVAILABLE, <Screen_ />));

    expect(screen.getByText(title)).toBeOnTheScreen();
    // No usable form: the password field must not exist at all.
    expect(screen.queryByLabelText('Contraseña')).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Entrar' })).not.toBeOnTheScreen();
  });

  it('uses reassuring customer copy, not a technical error', async () => {
    await renderWithProviders(withAuth(UNAVAILABLE, <LoginScreen />));

    expect(
      screen.getByText('Estamos preparando la conexión segura de esta aplicación con tu cuenta.'),
    ).toBeOnTheScreen();
  });

  it('never leaks BR numbers, JWT, CSRF or endpoint paths to the customer', async () => {
    await renderWithProviders(withAuth(UNAVAILABLE, <LoginScreen />));

    expect(screen.queryByText(/BR-\d+/)).not.toBeOnTheScreen();
    expect(screen.queryByText(/JWT/i)).not.toBeOnTheScreen();
    expect(screen.queryByText(/CSRF/i)).not.toBeOnTheScreen();
    expect(screen.queryByText(/api\/v1/)).not.toBeOnTheScreen();
  });

  it('does not render as an error, because nothing the user did is wrong', async () => {
    await renderWithProviders(withAuth(UNAVAILABLE, <LoginScreen />));

    expect(screen.queryByText('Algo salió mal')).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeOnTheScreen();
  });
});

describe('mock auth — development', () => {
  it('renders the real sign-in form', async () => {
    await renderWithProviders(withAuth(MOCK, <LoginScreen />));

    expect(screen.getByLabelText('Correo electrónico')).toBeOnTheScreen();
    expect(screen.getByLabelText('Contraseña')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeOnTheScreen();
  });

  it('identifies itself as a demo, so nobody mistakes it for production', async () => {
    await renderWithProviders(withAuth(MOCK, <LoginScreen />));

    expect(screen.getByText('Modo demo')).toBeOnTheScreen();
  });
});
