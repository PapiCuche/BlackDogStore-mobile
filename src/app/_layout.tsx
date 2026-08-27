import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';

import { AppProviders } from '@/providers/app-providers';
import { useAppTheme } from '@/theme/theme-provider';

/**
 * Hold the native splash until the first frame is genuinely ready.
 *
 * NOT held artificially for a fixed number of seconds — a splash that outlives
 * the work it is covering is a delay the user pays for nothing. It is dismissed
 * the moment the theme preference has been read back from disk, which is the
 * only async work that must finish before we can paint without a flash of the
 * wrong colour scheme.
 */
SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  return (
    <AppProviders>
      <RootNavigator />
    </AppProviders>
  );
}

/**
 * Lives inside the providers because it needs the resolved theme.
 *
 * Its job is to hand our tokens to the NATIVE layer: the stack header, the card
 * background behind a push transition, and the status bar. Skipping this is why
 * apps flash white between screens in dark mode — the JS renders dark while
 * UIKit's container underneath is still light.
 */
function RootNavigator() {
  const { theme, scheme, isPreferenceLoaded } = useAppTheme();

  useEffect(() => {
    if (isPreferenceLoaded) {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [isPreferenceLoaded]);

  const navigationTheme = useMemo(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: theme.colors.accentText,
        background: theme.colors.background,
        card: theme.colors.background,
        text: theme.colors.textPrimary,
        border: theme.colors.border,
      },
    };
  }, [scheme, theme]);

  return (
    <ThemeProvider value={navigationTheme}>
      {/* `style` follows the scheme rather than being pinned, so the clock and
          battery stay legible in both themes. */}
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />

      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.background },
          // The system back-swipe is a gesture iOS users expect everywhere.
          gestureEnabled: true,
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="products/[slug]"
          options={{ headerShown: true, title: 'Producto', headerBackTitle: 'Atrás' }}
        />
        <Stack.Screen
          name="repairs/[id]"
          options={{ headerShown: true, title: 'Reparación', headerBackTitle: 'Atrás' }}
        />
        <Stack.Screen
          name="orders/[id]"
          options={{ headerShown: true, title: 'Pedido', headerBackTitle: 'Atrás' }}
        />
      </Stack>
    </ThemeProvider>
  );
}
