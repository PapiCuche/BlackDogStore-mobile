import { Stack } from 'expo-router';

import { useTheme } from '@/theme/theme-provider';

/**
 * The authentication stack.
 *
 * Login is headerless (it owns its own brand lockup); the rest get a native
 * header so the back affordance is the platform's own — a UIKit back button on
 * iOS and the hardware/gesture back on Android, both for free.
 */
export default function AuthLayout() {
  const theme = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.background },
        headerTintColor: theme.colors.textPrimary,
        headerStyle: { backgroundColor: theme.colors.background },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="login" />
      <Stack.Screen
        name="register"
        options={{ headerShown: true, title: '', headerBackTitle: 'Atrás' }}
      />
      <Stack.Screen
        name="forgot-password"
        options={{ headerShown: true, title: '', headerBackTitle: 'Atrás' }}
      />
      <Stack.Screen
        name="verify-email"
        options={{ headerShown: true, title: '', headerBackTitle: 'Atrás' }}
      />
    </Stack>
  );
}
