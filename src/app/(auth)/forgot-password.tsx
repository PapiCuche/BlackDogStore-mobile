import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { Button, EmptyState, icons, Input, Screen } from '@/design-system';
import { AuthScreenShell } from '@/features/auth/auth-screen-shell';
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
