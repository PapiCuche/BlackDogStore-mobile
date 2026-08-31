import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';

import { useAuth } from '@/auth/auth-provider';
import { Button, Input } from '@/design-system';
import { AuthScreenShell } from '@/features/auth/auth-screen-shell';
import { AuthUnavailableScreen } from '@/features/auth/auth-unavailable';
import { MockDataNotice } from '@/features/home/mock-data-notice';
import { hapticError, hapticSuccess } from '@/utils/haptics';
import { registerSchema, type RegisterFormValues } from '@/validation/auth-schemas';

/**
 * Create an account.
 *
 * UI ONLY. Django's `RegisterView` exists and is verified, but reaching it
 * means solving the same auth-contract problem as login (BR-001) — and its
 * response depends on `REQUIRE_EMAIL_VERIFICATION`, which changes the flow.
 * Wiring it up on a guess would produce a screen that behaves differently
 * against a real server, so the screen stays honest about being unconnected.
 */
export default function RegisterScreen() {
  const { policy } = useAuth();
  const { register, isSubmitting } = useAuth();

  const { control, handleSubmit } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { firstName: '', email: '', password: '', confirmPassword: '' },
    mode: 'onTouched',
  });

  const onSubmit = handleSubmit(
    async (values) => {
      // `confirmPassword` exists only to satisfy the schema; it is deliberately
      // not forwarded.
      await register({
        firstName: values.firstName,
        email: values.email,
        password: values.password,
      });
      hapticSuccess();
      router.replace('/(tabs)');
    },
    () => hapticError(),
  );

  // Placed AFTER every hook: an early return above them would change the
  // hook order between renders. No auth mechanism in this build means no
  // form — a field that cannot succeed teaches the user their password is
  // wrong. See src/auth/auth-policy.ts.
  //
  // M3 — `backend` joins `unavailable` here. BR-001A shipped the session core
  // (login, refresh, logout, me) and NOTHING else: there is no native endpoint
  // for this flow, and the legacy one speaks cookies and CSRF. A form that can
  // only fail is exactly what this guard exists to prevent, so mock mode keeps
  // the demo and real mode says where to go instead. See BR-001B.
  if (policy.mode !== 'mock') {
    return <AuthUnavailableScreen title="Registro no disponible en la app" message="Por ahora las cuentas se crean desde la web. En la app puedes iniciar sesión con normalidad." />;
  }

  return (
    <AuthScreenShell
      title="Crea tu cuenta"
      subtitle="Sigue tus reparaciones y compras desde un solo lugar."
      showBrand={false}
    >
      <Controller
        control={control}
        name="firstName"
        render={({ field, fieldState }) => (
          <Input
            label="Nombre"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
            autoCapitalize="words"
            autoComplete="given-name"
            textContentType="givenName"
            returnKeyType="next"
          />
        )}
      />

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
            hint="Mínimo 8 caracteres."
            isPassword
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="next"
          />
        )}
      />

      <Controller
        control={control}
        name="confirmPassword"
        render={({ field, fieldState }) => (
          <Input
            label="Repite la contraseña"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
            isPassword
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="go"
            onSubmitEditing={onSubmit}
          />
        )}
      />

      <Button label="Crear cuenta" onPress={onSubmit} loading={isSubmitting} fullWidth />

      <MockDataNotice message="Esta pantalla todavía no crea una cuenta en el servidor. Registro real pendiente (M1)." />
    </AuthScreenShell>
  );
}
