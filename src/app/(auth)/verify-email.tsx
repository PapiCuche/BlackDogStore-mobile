import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';

import { Button, Input, Text } from '@/design-system';
import { useAuth } from '@/auth/auth-provider';
import { AuthScreenShell } from '@/features/auth/auth-screen-shell';
import { AuthUnavailableScreen } from '@/features/auth/auth-unavailable';
import { MockDataNotice } from '@/features/home/mock-data-notice';
import { useTheme } from '@/theme/theme-provider';
import { hapticSuccess } from '@/utils/haptics';
import { verifyEmailSchema, type VerifyEmailFormValues } from '@/validation/auth-schemas';

/**
 * Confirm an email address.
 *
 * UI ONLY. Django gates this behind `REQUIRE_EMAIL_VERIFICATION` and, when on,
 * deactivates the account until the token is used — so the real flow branches
 * on a server setting the app cannot see today. BR-001 covers exposing it.
 */
export default function VerifyEmailScreen() {
  const { policy } = useAuth();
  const theme = useTheme();

  const { control, handleSubmit, formState } = useForm<VerifyEmailFormValues>({
    resolver: zodResolver(verifyEmailSchema),
    defaultValues: { code: '' },
    mode: 'onTouched',
  });

  const onSubmit = handleSubmit(() => {
    hapticSuccess();
    router.replace('/(tabs)');
  });

  // Placed AFTER every hook: an early return above them would change the
  // hook order between renders. No auth mechanism in this build means no
  // form — a field that cannot succeed teaches the user their password is
  // wrong. See src/auth/auth-policy.ts.
  if (policy.mode === 'unavailable') {
    return <AuthUnavailableScreen title="Verificación no disponible" message="Estamos preparando la conexión segura de esta aplicación con tu cuenta." />;
  }

  return (
    <AuthScreenShell
      title="Verifica tu correo"
      subtitle="Ingresa el código de verificación que enviamos a tu correo."
      showBrand={false}
      footer={
        <View style={{ alignItems: 'center', gap: theme.spacing.xs }}>
          <Text variant="footnote" color="textTertiary" center>
            ¿No recibiste el código? Revisa tu carpeta de spam.
          </Text>
        </View>
      }
    >
      <Controller
        control={control}
        name="code"
        render={({ field, fieldState }) => (
          <Input
            label="Código de verificación"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
            autoCapitalize="none"
            autoCorrect={false}
            // Lets iOS offer the code straight from the Messages/Mail banner.
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            returnKeyType="go"
            onSubmitEditing={onSubmit}
          />
        )}
      />

      <Button label="Verificar" onPress={onSubmit} loading={formState.isSubmitting} fullWidth />

      <MockDataNotice message="Esta pantalla todavía no verifica ningún código. Integración pendiente (M1)." />
    </AuthScreenShell>
  );
}
