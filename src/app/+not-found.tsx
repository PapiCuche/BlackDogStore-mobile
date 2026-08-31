import { router, Stack } from 'expo-router';

import { EmptyState, icons, Screen } from '@/design-system';

/**
 * Fallback for an unmatched route.
 *
 * Reachable from a malformed deep link, which is exactly why it offers a way
 * back to a known-good screen instead of stranding the user on a dead end.
 */
export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'No encontrado' }} />
      <Screen>
        <EmptyState
          icon={icons.warning}
          title="Esta pantalla no existe"
          message="El enlace que abriste no corresponde a ninguna sección de la aplicación."
          actionLabel="Ir al inicio"
          onAction={() => router.replace('/(tabs)')}
        />
      </Screen>
    </>
  );
}
