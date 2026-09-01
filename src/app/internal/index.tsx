import { router, Stack } from 'expo-router';
import { View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { companySlug } from '@/config/env';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  icons,
  LoadingState,
  Screen,
  Text,
} from '@/design-system';
import { INTERNAL_MODULES, visibleModules } from '@/features/internal/module-registry';
import { useInternalContext } from '@/hooks/use-internal-sales';
import { isMemberInTenant, isPlatformMaster } from '@/auth/types';
import { useTheme } from '@/theme/theme-provider';

/**
 * The internal home.
 *
 * BUILT FROM FRESH CAPABILITIES, never from a role and never from the session's
 * snapshot. The session decides whether to OFFER this door; opening it asks the
 * server again, because roles change while a session stays alive and someone
 * whose permission was revoked an hour ago must not still see a module.
 *
 * Modules the person does not hold are not drawn at all — not greyed out.
 * Listing what someone lacks describes the company's structure to them, and
 * they did not ask.
 */
export default function InternalHomeScreen() {
  const theme = useTheme();
  const { session } = useAuth();

  // The session's own view decides whether this screen should even be reachable.
  const mayEnter = isMemberInTenant(session, companySlug) || isPlatformMaster(session);
  const { data: context, isPending, isError, error, refetch } = useInternalContext({
    enabled: mayEnter,
  });

  const modules = visibleModules(context ?? null);
  const unavailable = modules.filter((m) => m.integration !== 'ready');
  const ready = modules.filter((m) => m.integration === 'ready');

  if (!mayEnter) {
    return (
      <>
        <Stack.Screen options={{ title: 'Área interna' }} />
        <Screen scrollable contentContainerStyle={{ flexGrow: 1 }}>
          <EmptyState
            icon={icons.info}
            title="Área interna no disponible"
            message="Tu cuenta no tiene acceso interno en esta empresa."
            actionLabel="Volver a la tienda"
            onAction={() => router.replace('/(tabs)')}
          />
        </Screen>
      </>
    );
  }

  if (isPending) {
    return (
      <>
        <Stack.Screen options={{ title: 'Área interna' }} />
        <Screen scrollable>
          <LoadingState label="Cargando área interna" skeletonCount={3} />
        </Screen>
      </>
    );
  }

  if (isError) {
    return (
      <>
        <Stack.Screen options={{ title: 'Área interna' }} />
        <Screen scrollable contentContainerStyle={{ flexGrow: 1 }}>
          <ErrorState error={error} onRetry={() => void refetch()} />
        </Screen>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Área interna' }} />
      <Screen scrollable>
        <View style={{ gap: theme.spacing.md }}>
          <View style={{ gap: 2 }}>
            <Text variant="overline" color="textTertiary" style={{ textTransform: 'uppercase' }}>
              Área interna
            </Text>
            <Text variant="title2" accessibilityRole="header">
              {context.company.name}
            </Text>
            {context.isPlatformMaster ? (
              <Badge tone="accent" label="Administración de plataforma" />
            ) : null}
          </View>

          {ready.map((module) => (
            <Card key={module.key} variant="outlined">
              <View style={{ gap: theme.spacing.xs }}>
                <Text variant="headline">{module.title}</Text>
                <Text variant="subhead" color="textSecondary">
                  {module.description}
                </Text>
                <Button
                  label="Abrir"
                  variant="secondary"
                  onPress={() => router.push(module.route!)}
                />
              </View>
            </Card>
          ))}

          {/* Honest rather than empty. Someone with only inventory permissions
              has real access the app has not built a screen for yet, and
              saying so beats a blank page they will read as broken. */}
          {unavailable.length > 0 ? (
            <Card variant="outlined">
              <View style={{ gap: theme.spacing.xs }}>
                <Text variant="headline">Todavía no en la app</Text>
                <Text variant="subhead" color="textSecondary">
                  Tienes permisos para estos módulos, pero aún no tienen pantalla móvil.
                  Puedes usarlos desde la web.
                </Text>
                {unavailable.map((module) => (
                  <Text key={module.key} variant="subhead" color="textTertiary">
                    · {module.title}
                  </Text>
                ))}
              </View>
            </Card>
          ) : null}

          {modules.length === 0 ? (
            <EmptyState
              icon={icons.info}
              title="Sin módulos asignados"
              message="Los módulos asignados a tu cuenta todavía no están disponibles en la app."
            />
          ) : null}

          <Button
            label="Volver a la tienda"
            variant="ghost"
            fullWidth
            onPress={() => router.replace('/(tabs)')}
          />
        </View>
      </Screen>
    </>
  );
}

/** Re-exported so tests can assert the registry without importing the screen. */
export { INTERNAL_MODULES };
