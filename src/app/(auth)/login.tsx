import { zodResolver } from '@hookform/resolvers/zod';
import { Link, router } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { Button, Input, Text } from '@/design-system';
import { AuthScreenShell } from '@/features/auth/auth-screen-shell';
import { AuthUnavailableScreen } from '@/features/auth/auth-unavailable';
import { DevQuickLogin } from '@/features/auth/dev-quick-login';
import { MockDataNotice } from '@/features/home/mock-data-notice';
import { useTheme } from '@/theme/theme-provider';
import { hapticError, hapticSuccess } from '@/utils/haptics';
import { loginSchema, type LoginFormValues } from '@/validation/auth-schemas';

/**
 * Sign in.
 *
 * M3 — THIS NOW AUTHENTICATES FOR REAL, against `/api/v1/auth/login/` on
 * `origin/master` `7c55ebc`. The legacy `/api/auth/login/` is still off limits:
 * it sets a JWT in an HttpOnly cookie and pairs it with CSRF, a browser
 * contract this client cannot speak and one we are not changing.
 *
 * Two things on this screen depend on which mode the build is in:
 *
 *   - the "datos de ejemplo" notice, which must NEVER appear over a real login;
 *   - the register / forgot-password links, which lead to flows the native
 *     contract does not implement (BR-001B). Showing them in backend mode would
 *     offer a door that opens onto nothing.
 */
export default function LoginScreen() {
  const { policy } = useAuth();
  const theme = useTheme();
  const { signIn, isSubmitting } = useAuth();

  const { control, handleSubmit, formState, setValue } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
    mode: 'onTouched',
  });

  const onSubmit = handleSubmit(
    async (values) => {
      // The password is passed straight through and never stored, logged or put
      // into component state that outlives the submit.
      //
      // `identifier` carries an EMAIL. BR-001A settled it: `/api/v1/auth/login/`
      // takes `{email, password}`, unlike the web contract's username. The field
      // keeps its abstract name so a future contract can accept something else
      // without changing every caller, but the mapping is no longer an open
      // question.
      await signIn({ identifier: values.email, password: values.password });
      hapticSuccess();
      router.replace('/(tabs)');
    },
    () => hapticError(),
  );

  // Placed AFTER every hook: an early return above them would change the
  // hook order between renders. No auth mechanism in this build means no
  // form — a field that cannot succeed teaches the user their password is
  // wrong. See src/auth/auth-policy.ts.
  if (policy.mode === 'unavailable') {
    return <AuthUnavailableScreen />;
  }

  const isMock = policy.mode === 'mock';

  return (
    <AuthScreenShell
      title="Inicia sesión"
      subtitle="Accede para seguir tus reparaciones y pedidos."
      footer={
        <View style={{ gap: theme.spacing.sm, alignItems: 'center' }}>
          {isMock ? (
            <>
              <Link href="/(auth)/forgot-password" asChild>
                <Text variant="subhead" color="accentText" accessibilityRole="link">
                  ¿Olvidaste tu contraseña?
                </Text>
              </Link>

              <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
                <Text variant="subhead" color="textSecondary">
                  ¿No tienes cuenta?
                </Text>
                <Link href="/(auth)/register" asChild>
                  <Text variant="subhead" color="accentText" accessibilityRole="link">
                    Regístrate
                  </Text>
                </Link>
              </View>
            </>
          ) : (
            /* BR-001B. Registration, password reset and email verification have
               no native endpoints, and the legacy ones speak cookies and CSRF.
               Saying so beats a link that leads nowhere. */
            <Text variant="footnote" color="textTertiary" style={{ textAlign: 'center' }}>
              Crear una cuenta o recuperar tu contraseña todavía se hace desde la web.
            </Text>
          )}
        </View>
      }
    >
      <Controller
        control={control}
        name="email"
        render={({ field, fieldState }) => (
          <Input
            label="Correo electrónico"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="next"
          />
        )}
      />

      <Controller
        control={control}
        name="password"
        render={({ field, fieldState }) => (
          <Input
            label="Contraseña"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
            isPassword
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={onSubmit}
          />
        )}
      />

      <Button
        label="Entrar"
        onPress={onSubmit}
        loading={isSubmitting}
        disabled={formState.isSubmitting}
        fullWidth
      />

      {/* Only over a fake login. Showing this above a real one would tell the
          user their credentials do not matter, which is now false. */}
      {isMock ? (
        <MockDataNotice message="Modo desarrollo: cualquier correo y contraseña válidos abren la app. No es una sesión real." />
      ) : null}

      {/* Development quick logins, and ONLY over a real backend.
          `DevQuickLogin` already returns null outside development; the extra
          condition here is about which login these accounts belong to. They are
          rows in a Django database, so offering them over the mock login would
          present them as real sessions when nothing would be verified — the two
          look alike on screen and are not the same thing at all.
          `unavailable` never reaches this line: the screen returned earlier. */}
      {policy.mode === 'backend' ? (
        <DevQuickLogin
          onUse={(email, password) => {
            // FILLS, and stops. No submit, no navigation, no session. The
            // operator presses «Entrar» and the request goes the ordinary way.
            setValue('email', email, { shouldValidate: true, shouldDirty: true });
            setValue('password', password, { shouldValidate: true, shouldDirty: true });
          }}
        />
      ) : null}
    </AuthScreenShell>
  );
}
