import { View } from 'react-native';

import { appEnvironment, type AppEnvironment } from '@/config/env';
import { Badge, Button, Card, Divider, SectionHeader, Text } from '@/design-system';
import { useTheme } from '@/theme/theme-provider';

/**
 * Quick logins for development. A CREDENTIAL AUTOCOMPLETER, nothing more.
 *
 * Pressing an account only fills the two form fields. The operator still has to
 * press «Entrar», and the request then takes the ordinary road — `signIn()` →
 * `AuthRepository` → `POST /api/v1/auth/login/` → real tokens → the server's own
 * answer about who this person is and what they may do. Nothing here writes a
 * token, touches SecureStore, fabricates a session or a capability, changes the
 * tenant, or navigates. There is no bypass, and the tests assert its absence
 * rather than trusting this paragraph.
 *
 * WHERE THE ACCOUNTS COME FROM. `seed_demo_users` in the backend, and only
 * there — Mobile never creates them:
 *
 *     python manage.py seed_demo_users --company-slug <slug>
 *     python manage.py seed_demo_users --purge
 *
 * WHY THE PASSWORD IS IN THE SOURCE. It is a development fixture, not a secret:
 *
 *   · the command REFUSES to run unless `settings.DEBUG` is true, and offers no
 *     override flag — a `--force-production` escape hatch is exactly how a dev
 *     fixture ends up in a live database;
 *   · every address is under `.invalid`, reserved by RFC 2606, so none of them
 *     can ever be a deliverable address or collide with a real customer;
 *   · the accounts are ordinary users in every respect: real login, real JWT,
 *     the same permission checks as anyone else;
 *   · and this component does not exist outside a development build.
 *
 * EMAIL, NOT USERNAME. The Web widget fills a username because the browser
 * contract takes one. `/api/v1/auth/login/` takes `{email, password}` — BR-001A
 * settled that — so this fills the address the seeder generates. Same accounts,
 * different identifier, and getting it wrong would look like "the demo user does
 * not work".
 */

/** Fixture password. Development only — see the note above. */
export const DEV_DEMO_PASSWORD = 'Demo123!';

/** The domain `seed_demo_users` stamps on every account it creates. */
const DEV_DEMO_EMAIL_DOMAIN = 'example.invalid';

export type DevDemoAccount = {
  /** The username the seeder creates. Used to derive the email, never as authority. */
  username: string;
  /** Presentation only. Never read back to decide what anybody may do. */
  label: string;
  /** Where this account can actually go IN MOBILE, verified against the routes. */
  destination: string;
};

/**
 * The six accounts `seed_demo_users` creates. Not a superset, not a guess.
 *
 * `destination` describes MOBILE, which is not always what the Web widget says.
 * Web marks Técnico and MASTER as pending; the first is wrong here — the service
 * chain shipped in M8–M12B and Mobile drives all of it — and the second is more
 * subtle, so it is described rather than labelled.
 */
export const DEV_DEMO_ACCOUNTS: readonly DevDemoAccount[] = [
  {
    username: 'dev_customer',
    label: 'Cliente',
    destination: 'E-commerce: tienda, pedidos y reparaciones',
  },
  {
    username: 'dev_sales',
    label: 'Ventas',
    destination: 'Pedidos internos y punto de venta',
  },
  {
    username: 'dev_inventory',
    label: 'Inventario',
    destination: 'Stock, kardex, ajustes y transferencias',
  },
  {
    username: 'dev_technician',
    label: 'Técnico',
    destination: 'Servicio técnico, la cadena completa',
  },
  {
    username: 'dev_admin',
    label: 'Admin empresa',
    destination: 'Control interno: todos los módulos que su empresa le conceda',
  },
  {
    username: 'dev_master',
    // The seeder gives this account `is_superuser` and DELETES any membership,
    // deliberately — company authority is not what makes a platform master. In
    // Mobile that means entering the internal area with the platform badge;
    // there is no separate master console here, and saying "Control MASTER"
    // would promise a screen that does not exist.
    label: 'MASTER',
    destination: 'Área interna con distintivo de plataforma (Mobile no tiene consola MASTER propia)',
  },
] as const;

/** The address the seeder generates for a username. */
export function devDemoEmail(username: string): string {
  return `${username}@${DEV_DEMO_EMAIL_DOMAIN}`;
}

/**
 * Whether these accounts may be offered at all.
 *
 * A PURE FUNCTION so the release guard can be tested without rendering
 * anything. `development` comes from `__DEV__` in `src/config/env.ts`; there is
 * deliberately no `EXPO_PUBLIC_*` that could switch this back on, because a
 * variable somebody sets in a pipeline is exactly how a development fixture
 * reaches a store build.
 */
export function devQuickLoginAvailable(environment: AppEnvironment): boolean {
  return environment === 'development';
}

export type DevQuickLoginProps = {
  /** Fills the form. It must not submit, navigate or sign anybody in. */
  onUse: (email: string, password: string) => void;
};

/**
 * Returns NULL outside development.
 *
 * Not hidden with a style — never rendered. A block that exists in the tree and
 * is merely invisible is one style change away from being visible, and this one
 * carries a password.
 */
export function DevQuickLogin({ onUse }: DevQuickLoginProps) {
  const theme = useTheme();

  if (!devQuickLoginAvailable(appEnvironment)) return null;

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Divider />

      <View style={{ gap: theme.spacing.xs }}>
        <SectionHeader title="Accesos de desarrollo" />
        {/* Text, not only colour: the badge says what this is for anybody who
            does not perceive the tone. */}
        <Badge label="Solo desarrollo" tone="accent" uppercase />
      </View>

      <Card variant="outlined">
        <View style={{ gap: theme.spacing.sm }}>
          {DEV_DEMO_ACCOUNTS.map((account) => (
            <View key={account.username} style={{ gap: theme.spacing.xs }}>
              <Text variant="headline">{account.label}</Text>
              <Text variant="caption" color="textTertiary">
                {devDemoEmail(account.username)}
              </Text>
              <Text variant="footnote" color="textSecondary">
                → {account.destination}
              </Text>
              {/* The account is IN the label, not in an `accessibilityLabel`
                  prop: `Button` builds its accessible name from the text it
                  renders, so six buttons all reading «Usar cuenta» would be six
                  identical announcements. This way the screen reader and the
                  screen say the same thing. */}
              <Button
                label={`Usar cuenta ${account.label}`}
                variant="secondary"
                fullWidth
                accessibilityHint={
                  `Rellena correo y contraseña para probar ${account.destination}. `
                  + 'No inicia sesión.'
                }
                onPress={() => onUse(devDemoEmail(account.username), DEV_DEMO_PASSWORD)}
              />
              <Divider />
            </View>
          ))}

          <Text variant="caption" color="textTertiary">
            Contraseña común: {DEV_DEMO_PASSWORD}
          </Text>
          <Text variant="caption" color="textTertiary">
            Seleccionar una cuenta solo rellena el formulario. El inicio de sesión
            y los permisos siguen siendo reales y los autoriza el backend.
          </Text>
          <Text variant="caption" color="textTertiary">
            Se crean con `manage.py seed_demo_users --company-slug &lt;slug&gt;`, que
            solo funciona con DEBUG=True.
          </Text>
        </View>
      </Card>
    </View>
  );
}
