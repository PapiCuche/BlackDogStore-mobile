import { zodResolver } from '@hookform/resolvers/zod';
import { Link, router } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { Button, Input, Text } from '@/design-system';
import { AuthScreenShell } from '@/features/auth/auth-screen-shell';
import { AuthUnavailableScreen } from '@/features/auth/auth-unavailable';
import { MockDataNotice } from '@/features/home/mock-data-notice';
import { useTheme } from '@/theme/theme-provider';
import { hapticError, hapticSuccess } from '@/utils/haptics';
import { loginSchema, type LoginFormValues } from '@/validation/auth-schemas';

/**
 * Sign in.
 *
 * ⚠️  THIS DOES NOT AUTHENTICATE AGAINST DJANGO. The backend's login sets a JWT
 * in an HttpOnly cookie and pairs it with CSRF — a browser contract this client
 * cannot speak, and one we are explicitly not changing. See docs/MOBILE_AUTH.md
 * and BR-001.
 *
 * The form is real: real validation, real submit state, real error handling.
 * Only the repository behind it is a mock, and the screen says so rather than
 * pretending otherwise.
 */
export default function LoginScreen() {
  const { policy } = useAuth();
  const theme = useTheme();
  const { signIn, isSubmitting } = useAuth();

  const { control, handleSubmit, formState } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
    mode: 'onTouched',
  });

  const onSubmit = handleSubmit(
    async (values) => {
      // The password is passed straight through and never stored, logged or put
      // into component state that outlives the submit.
      // `identifier`, not `email`: the backend's USERNAME_FIELD is `username`
      // and BR-001 has not settled which one the mobile contract accepts.
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

  return (
    <AuthScreenShell
      title="Inicia sesión"
      subtitle="Accede para seguir tus reparaciones y pedidos."
      footer={
        <View style={{ gap: theme.spacing.sm, alignItems: 'center' }}>
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

      <MockDataNotice message="Modo desarrollo: cualquier correo y contraseña válidos abren la app. La autenticación real está pendiente (M1)." />
    </AuthScreenShell>
  );
}
