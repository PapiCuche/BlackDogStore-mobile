import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';

import {
  AppHeader,
  Button,
  Card,
  EmptyState,
  ErrorState,
  icons,
  Input,
  LoadingState,
  Screen,
  Text,
} from '@/design-system';
import { CAP_SERVICE_CUSTOMERS_VIEW } from '@/domain/internal/service-types';
import { hasUxCapability } from '@/domain/internal/types';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useInternalContext } from '@/hooks/use-internal-sales';
import { useServiceCustomerSearch, useServiceDevices } from '@/hooks/use-internal-service';
import { screenGutter } from '@/theme';
import { useTheme } from '@/theme/theme-provider';

/**
 * WHO IS STANDING AT THE COUNTER — `service/customers/`.
 *
 * THE NARROWEST THING THAT WORKS, and the server says so itself: the CRM lives
 * on the web console and is not reachable with a Bearer token, so this route
 * answers a name, a document and a phone — enough to tell two people apart —
 * and nothing else. No addresses, no history, no balance. Creating or editing a
 * customer is not possible from here either; that is BR-016.
 *
 * NOT A LIST OF EVERY CLIENT. Without a search term the server returns the most
 * recent few, because «download every client of this company» is not a request
 * a counter ever makes. The copy says that rather than implying the shop has
 * four customers.
 *
 * WHAT IT IS FOR. Finding somebody to see which devices of theirs the shop
 * knows, and opening one — the only onward journey that exists on this surface.
 */
export default function InternalCustomersScreen() {
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search.trim(), 300);

  const { data: context, isPending: contextPending } = useInternalContext();
  const mayView = hasUxCapability(context ?? null, CAP_SERVICE_CUSTOMERS_VIEW);

  const query = useServiceCustomerSearch(debounced, { enabled: mayView });
  const [openId, setOpenId] = useState<number | null>(null);
  const devices = useServiceDevices(
    { customerId: openId ?? undefined },
    { enabled: mayView && openId !== null },
  );

  const header = (
    <View>
      <AppHeader
        title="Clientes"
        eyebrow="Área interna"
        subtitle="Busca a quien está en el mostrador."
      />
      <Input
        label="Buscar"
        value={search}
        onChangeText={setSearch}
        placeholder="Nombre, documento o teléfono"
        autoCapitalize="none"
      />
      {debounced === '' ? (
        <Text variant="caption" color="textTertiary" style={{ marginTop: theme.spacing.xs }}>
          Sin búsqueda se muestran los últimos registrados.
        </Text>
      ) : null}
    </View>
  );

  if (contextPending) {
    return (
      <>
        <Stack.Screen options={{ title: 'Clientes' }} />
        <Screen scrollable>
          <LoadingState label="Cargando" skeletonCount={3} />
        </Screen>
      </>
    );
  }

  // The server refuses anyway; saying so beats an empty list that reads as
  // «esta tienda no tiene clientes».
  if (!mayView) {
    return (
      <>
        <Stack.Screen options={{ title: 'Clientes' }} />
        <Screen scrollable contentContainerStyle={{ flexGrow: 1 }}>
          {header}
          <EmptyState
            icon={icons.info}
            title="No tienes acceso a los clientes"
            message="Esta sección es para quien atiende el mostrador y registra equipos."
          />
        </Screen>
      </>
    );
  }

  if (query.isError) {
    return (
      <>
        <Stack.Screen options={{ title: 'Clientes' }} />
        <Screen scrollable contentContainerStyle={{ flexGrow: 1 }}>
          {header}
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        </Screen>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Clientes' }} />
      <Screen padded={false}>
        <FlatList
          data={query.data?.results ?? []}
          keyExtractor={(item) => String(item.id)}
          ListHeaderComponent={header}
          renderItem={({ item }) => (
            // ONLY THE NAME OPENS THE CARD, not the card itself. A pressable
            // card is ONE accessibility element and absorbs everything inside
            // it: while this whole row was the control, the device buttons and
            // «Recibir un equipo de este cliente» were on the screen but
            // unreachable with VoiceOver, because an accessible container
            // hides its children from assistive technology.
            <Card variant="outlined">
              <View style={{ gap: theme.spacing.xs }}>
                <Pressable
                  onPress={() => setOpenId((current) => (current === item.id ? null : item.id))}
                  accessibilityRole="button"
                  accessibilityLabel={item.displayName}
                  accessibilityHint="Muestra los equipos registrados de este cliente"
                  accessibilityState={{ expanded: openId === item.id }}
                  style={{ gap: theme.spacing.xs }}
                >
                  <Text variant="headline">{item.displayName}</Text>
                  <Text variant="caption" color="textTertiary">
                    {[item.documentNumber, item.phone].filter(Boolean).join(' · ') ||
                      'Sin datos de contacto'}
                  </Text>
                </Pressable>

                {openId === item.id ? (
                  <View style={{ gap: theme.spacing.xs }}>
                    {devices.isPending ? (
                      <Text variant="caption" color="textSecondary">
                        Cargando sus equipos…
                      </Text>
                    ) : devices.isError ? (
                      <Text variant="caption" color="danger">
                        No se pudieron cargar sus equipos.
                      </Text>
                    ) : (devices.data?.results ?? []).length === 0 ? (
                      <Text variant="caption" color="textSecondary">
                        Sin equipos registrados.
                      </Text>
                    ) : (
                      (devices.data?.results ?? []).map((device) => (
                        <Button
                          key={device.id}
                          label={device.displayName || `${device.brand} ${device.model}`.trim()}
                          variant="ghost"
                          size="compact"
                          onPress={() => router.push(`/internal/service/devices/${device.id}`)}
                        />
                      ))
                    )}
                    <Button
                      label="Recibir un equipo de este cliente"
                      size="compact"
                      onPress={() =>
                        router.push(
                          // The id is what the intake uses; the name travels
                          // only so its header can say who, until the server
                          // answers with its own data.
                          `/internal/service/orders/new?customer=${item.id}`
                            + `&name=${encodeURIComponent(item.displayName)}`,
                        )
                      }
                    />
                  </View>
                ) : null}
              </View>
            </Card>
          )}
          ItemSeparatorComponent={() => <View style={{ height: theme.spacing.sm }} />}
          ListEmptyComponent={
            query.isPending ? (
              <LoadingState label="Buscando clientes" skeletonCount={3} />
            ) : (
              <EmptyState
                icon={icons.search}
                title="Sin resultados"
                message="Nadie coincide con esa búsqueda en esta empresa."
              />
            )
          }
          contentContainerStyle={{
            paddingHorizontal: screenGutter,
            paddingBottom: theme.spacing.xxl,
            flexGrow: 1,
          }}
          showsVerticalScrollIndicator={false}
        />
      </Screen>
    </>
  );
}
