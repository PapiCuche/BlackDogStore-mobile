import { router } from 'expo-router';
import { View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import {
  Avatar,
  Button,
  Card,
  Divider,
  Icon,
  icons,
  SectionHeader,
  Skeleton,
  StatusBadge,
  Screen,
  Text,
} from '@/design-system';
import { describeFulfillmentStatus, describePaymentStatus } from '@/domain/orders/status';
import { orderNumber } from '@/domain/orders/types';
import { describeRepairStatus } from '@/domain/repairs/status';
import { findActiveRepair } from '@/domain/repairs/types';
import { initials, displayName } from '@/domain/customers/types';
import { MockDataNotice } from '@/features/home/mock-data-notice';
import { QuickActions } from '@/features/home/quick-actions';
import { useCompanyBrand } from '@/hooks/use-company-brand';
import { useOrders } from '@/hooks/use-orders';
import { useRepairs } from '@/hooks/use-repairs';
import { useTheme } from '@/theme/theme-provider';
import { formatCurrency, formatRelativeTime, greetingForHour } from '@/utils/format';

/**
 * Home.
 *
 * The organising idea: answer "what is happening with MY things right now?"
 * before offering anything else. So the active repair comes first, the most
 * recent order second, and browsing last — a customer with a laptop in the
 * workshop opens this app to check on the laptop.
 *
 * Everything here is one card per concern with a single clear action. The brief
 * is explicit that the Home must not be saturated, and the discipline that
 * enforces it is that a section only appears when it has something to say.
 */
export default function HomeScreen() {
  const theme = useTheme();
  const brandState = useCompanyBrand();
  const { session } = useAuth();

  const repairsQuery = useRepairs();
  const ordersQuery = useOrders();

  const name = displayName(session?.customer ?? null);
  const activeRepair = findActiveRepair(repairsQuery.data ?? []);
  const recentOrder = ordersQuery.data?.[0] ?? null;

  const isRefreshing = repairsQuery.isRefetching || ordersQuery.isRefetching;

  return (
    <Screen
      scrollable
      onRefresh={() => {
        void repairsQuery.refetch();
        void ordersQuery.refetch();
      }}
      refreshing={isRefreshing}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: theme.spacing.md,
          paddingTop: theme.spacing.sm,
          paddingBottom: theme.spacing.lg,
        }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="subhead" color="textSecondary">
            {greetingForHour()}
          </Text>
          <Text variant="title1" accessibilityRole="header">
            {/* Falls back to the company name only when the brand has actually
                resolved. An unresolved brand shows a neutral greeting rather
                than another tenant's name. */}
            {name
              ? `Hola, ${name}`
              : brandState.status === 'ready'
                ? brandState.brand.name
                : 'Hola'}
          </Text>
        </View>

        <Avatar
          initials={initials(session?.customer ?? null)}
          accessibilityLabel={name ? `Perfil de ${name}` : 'Perfil'}
        />
      </View>

      <View style={{ gap: theme.spacing.xl }}>
        {/* ── Active repair ─────────────────────────────────────────────── */}
        <View>
          <SectionHeader title="Tu reparación" eyebrow="Servicio técnico" />

          {repairsQuery.isPending ? (
            <Card>
              <View style={{ gap: theme.spacing.xs }}>
                <Skeleton width="40%" height={12} />
                <Skeleton width="70%" height={22} />
                <Skeleton width="30%" height={24} radius={theme.radius.pill} />
              </View>
            </Card>
          ) : activeRepair ? (
            <Card variant="elevated">
              <View style={{ gap: theme.spacing.sm }}>
                <View style={{ gap: 2 }}>
                  <Text variant="mono" color="textTertiary">
                    {activeRepair.code}
                  </Text>
                  <Text variant="title3">{activeRepair.deviceName}</Text>
                </View>

                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: theme.spacing.xs,
                    flexWrap: 'wrap',
                  }}
                >
                  <StatusBadge
                    label={describeRepairStatus(activeRepair.status).label}
                    tone={describeRepairStatus(activeRepair.status).tone}
                    accessibilityPrefix="Estado de la reparación"
                  />
                  <Text variant="caption" color="textTertiary">
                    Actualizado {formatRelativeTime(activeRepair.updatedAt)}
                  </Text>
                </View>

                <Button
                  label="Ver seguimiento"
                  variant="primary"
                  size="compact"
                  fullWidth
                  onPress={() => router.push(`/repairs/${activeRepair.id}`)}
                  accessibilityHint={`Abre el seguimiento de ${activeRepair.deviceName}`}
                />
              </View>
            </Card>
          ) : (
            <Card variant="outlined">
              <View style={{ gap: theme.spacing.xxs }}>
                <Text variant="callout" style={{ fontWeight: '600' }}>
                  No tienes reparaciones activas
                </Text>
                <Text variant="footnote" color="textSecondary">
                  Cuando dejes un equipo en el taller, podrás seguirlo desde aquí.
                </Text>
              </View>
            </Card>
          )}
        </View>

        {/* ── Recent order ──────────────────────────────────────────────── */}
        {ordersQuery.isPending || recentOrder ? (
          <View>
            <SectionHeader
              title="Pedido reciente"
              eyebrow="Tienda"
              actionLabel="Ver todos"
              onActionPress={() => router.push('/(tabs)/orders')}
            />

            {ordersQuery.isPending ? (
              <Card>
                <View style={{ gap: theme.spacing.xs }}>
                  <Skeleton width="35%" height={12} />
                  <Skeleton width="50%" height={22} />
                </View>
              </Card>
            ) : recentOrder ? (
              <Card>
                <View style={{ gap: theme.spacing.sm }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <Text variant="mono" color="textTertiary">
                      Pedido {orderNumber(recentOrder)}
                    </Text>
                    <Text variant="headline">{formatCurrency(recentOrder.total)}</Text>
                  </View>

                  <View
                    style={{ flexDirection: 'row', gap: theme.spacing.xxs, flexWrap: 'wrap' }}
                  >
                    <StatusBadge
                      label={describePaymentStatus(recentOrder.paymentStatus).label}
                      tone={describePaymentStatus(recentOrder.paymentStatus).tone}
                      size="small"
                      accessibilityPrefix="Pago"
                    />
                    <StatusBadge
                      label={describeFulfillmentStatus(recentOrder.fulfillmentStatus).label}
                      tone={describeFulfillmentStatus(recentOrder.fulfillmentStatus).tone}
                      size="small"
                      accessibilityPrefix="Entrega"
                    />
                  </View>

                  <Button
                    label="Ver pedido"
                    variant="secondary"
                    size="compact"
                    fullWidth
                    onPress={() => router.push(`/orders/${recentOrder.id}`)}
                  />
                </View>
              </Card>
            ) : null}
          </View>
        ) : null}

        {/* ── Explore the shop ──────────────────────────────────────────── */}
        <Card
          variant="outlined"
          onPress={() => router.push('/(tabs)/shop')}
          accessibilityLabel="Explorar la tienda"
          accessibilityHint="Abre el catálogo de productos"
        >
          <View
            style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}
          >
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: theme.radius.md,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.accentSurface,
              }}
            >
              <Icon name={icons.shop} size={theme.sizes.iconLg} color={theme.colors.accentText} />
            </View>

            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="callout" style={{ fontWeight: '600' }}>
                Explorar tienda
              </Text>
              <Text variant="footnote" color="textSecondary">
                Equipos, accesorios y audio con garantía.
              </Text>
            </View>

            <Icon
              name={icons.chevronRight}
              size={theme.sizes.iconMd}
              color={theme.colors.textTertiary}
            />
          </View>
        </Card>

        {/* ── Quick actions ─────────────────────────────────────────────── */}
        <View>
          <SectionHeader title="Accesos rápidos" />
          <QuickActions
            actions={[
              {
                key: 'repairs',
                label: 'Mis reparaciones',
                icon: icons.repairs,
                onPress: () => router.push('/(tabs)/repairs'),
              },
              {
                key: 'orders',
                label: 'Mis pedidos',
                icon: icons.orders,
                onPress: () => router.push('/(tabs)/orders'),
              },
              {
                key: 'support',
                label: 'Soporte',
                icon: icons.phone,
                onPress: () => router.push('/(tabs)/profile'),
                accessibilityHint: 'Abre el perfil, donde están los datos de contacto',
              },
            ]}
          />
        </View>

        <Divider />

        <MockDataNotice message="Reparaciones y pedidos son datos de ejemplo. Aún no hay integración con el servidor." />
      </View>
    </Screen>
  );
}
