import { router } from 'expo-router';
import { View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import type { AuthStatus } from '@/auth/types';
import { Button, Card, Icon, icons, Text } from '@/design-system';
import { useTheme } from '@/theme/theme-provider';

/**
 * The gate in front of a PRIVATE action.
 *
 * DEC-MOBILE-006 — PUBLIC BROWSING, AUTHENTICATED PURCHASE.
 *
 * The catalogue is public and stays public: browsing, searching, filtering and
 * opening a product never ask for an account. An app that demands a login
 * before showing what it sells has lost the customer before the shop opens.
 *
 * A login is asked for at the moment the ACTION becomes private — reading your
 * own orders, your own repairs, checking out. That is when an account is
 * genuinely necessary and when the person can see why.
 *
 * WHAT THIS IS NOT: authorization. It decides what to DRAW, not what may be
 * read. Every private endpoint validates the session and the ownership again on
 * the server. A user who somehow got past this gate would receive a 401 and an
 * empty screen, not somebody else's orders.
 */

export type PrivateActionState =
  /** Session in hand. Render the real thing. */
  | 'ready'
  /** Still deciding. Render whatever the screen shows while loading. */
  | 'pending'
  /** No session. Offer to sign in. */
  | 'sign-in-required'
  /** Credentials kept, server unreachable. Offer to retry, not to sign in. */
  | 'connection-required'
  /** This build cannot authenticate at all. Say so; offer nothing. */
  | 'unavailable';

export function privateActionState(status: AuthStatus): PrivateActionState {
  switch (status) {
    case 'authenticated':
      return 'ready';
    case 'loading':
      return 'pending';
    case 'unauthenticated':
      return 'sign-in-required';
    case 'temporarily-unavailable':
      // The credentials are still good. Sending them to a login form would ask
      // them to re-enter a password that was never the problem.
      return 'connection-required';
    case 'unavailable':
      return 'unavailable';
  }
}

/** Convenience for screens that only need the coarse answer. */
export function usePrivateActionState(): PrivateActionState {
  return privateActionState(useAuth().status);
}

const COPY: Record<
  Exclude<PrivateActionState, 'ready' | 'pending'>,
  { title: string; message: string; action: string | null }
> = {
  'sign-in-required': {
    title: 'Inicia sesión para verlo',
    message: 'Tus pedidos son privados. Entra con tu cuenta para consultarlos.',
    action: 'Iniciar sesión',
  },
  'connection-required': {
    title: 'No pudimos verificar tu sesión',
    message: 'Revisa tu conexión y vuelve a intentarlo. No hace falta que vuelvas a entrar.',
    action: null,
  },
  unavailable: {
    title: 'Acceso no disponible',
    message: 'Estamos preparando la conexión segura de esta aplicación con tu cuenta.',
    action: null,
  },
};

/**
 * The panel a screen renders instead of private content.
 *
 * Not styled as an error: from the customer's side nothing is broken. They are
 * simply not signed in, which is a normal state and not a fault.
 */
export function PrivateActionPrompt({
  state,
  message,
}: {
  state: Exclude<PrivateActionState, 'ready' | 'pending'>;
  /** Overrides the default copy when a screen needs its own wording. */
  message?: string;
}) {
  const theme = useTheme();
  const copy = COPY[state];

  return (
    <Card variant="outlined">
      <View style={{ alignItems: 'center', gap: theme.spacing.sm }}>
        <Icon name={icons.info} size={theme.sizes.iconXl} color={theme.colors.textTertiary} />

        <Text variant="headline" center accessibilityRole="header">
          {copy.title}
        </Text>

        <Text variant="subhead" color="textSecondary" center>
          {message ?? copy.message}
        </Text>

        {copy.action ? (
          <Button
            label={copy.action}
            onPress={() => router.push('/(auth)/login')}
            variant="primary"
          />
        ) : null}
      </View>
    </Card>
  );
}
