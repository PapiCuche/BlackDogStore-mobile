import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { Button, EmptyState, icons, Input, Screen } from '@/design-system';
import { useAuth } from '@/auth/auth-provider';
import { AuthScreenShell } from '@/features/auth/auth-screen-shell';
import { AuthUnavailableScreen } from '@/features/auth/auth-unavailable';
import { MockDataNotice } from '@/features/home/mock-data-notice';
import { hapticSuccess } from '@/utils/haptics';
import { forgotPasswordSchema, type ForgotPasswordFormValues } from '@/validation/auth-schemas';

/**
 * Request a password reset.
 *
 * UI ONLY — `POST /api/auth/password-reset/request/` exists and is throttled at
 * 3/min, but it is not called here (BR-001).
 *
 * The confirmation deliberately does NOT reveal whether the address is
 * registered. That is the same posture Django takes, and disclosing it would
 * turn this form into an account-enumeration oracle.
 */
export default function ForgotPasswordScreen() {
  const { policy } = useAuth();
  const [isSent, setIsSent] = useState(false);

  const { control, handleSubmit, formState } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
    mode: 'onTouched',
  });

  const onSubmit = handleSubmit(() => {
    hapticSuccess();
    setIsSent(true);
  });

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
    return <AuthUnavailableScreen title="Recuperación no disponible en la app" message="Por ahora la contraseña se recupera desde la web. En la app puedes iniciar sesión con normalidad." />;
  }

  if (isSent) {
    return (
      <Screen>
        <EmptyState
          icon={icons.mail}
          title="Revisa tu correo"
          message="Si el correo corresponde a una cuenta registrada, enviaremos instrucciones para restablecer tu contraseña."
          actionLabel="Volver a iniciar sesión"
          onAction={() => router.dismissTo('/(auth)/login')}
        />
      </Screen>
    );
  }

  return (
    <AuthScreenShell
      title="Restablece tu contraseña"
      subtitle="Te enviaremos un enlace para crear una nueva."
      showBrand={false}
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
            returnKeyType="go"
            onSubmitEditing={onSubmit}
          />
        )}
      />

      <Button
        label="Enviar instrucciones"
        onPress={onSubmit}
        loading={formState.isSubmitting}
        fullWidth
      />

      <MockDataNotice message="Esta pantalla todavía no envía ningún correo. Integración pendiente (M1)." />
    </AuthScreenShell>
  );
}
