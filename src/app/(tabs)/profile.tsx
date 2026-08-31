import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import { View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import {
  apiBaseUrl,
  appEnvironment,
  configurationIssues,
  isApiConfigured,
  legacyCatalogPolicy,
  mockDataPolicy,
  tenant,
  useMockData,
} from '@/config/env';
import { featureIntegration } from '@/config/integration-status';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Divider,
  icons,
  ListRow,
  Screen,
  SectionHeader,
  Text,
} from '@/design-system';
import { displayName, initials } from '@/domain/customers/types';
import { useCompanyBrand } from '@/hooks/use-company-brand';
import { useAppTheme, THEME_PREFERENCES, type ThemePreference } from '@/theme/theme-provider';
import { useTheme } from '@/theme/theme-provider';
import { hapticSelection } from '@/utils/haptics';

const themeLabels: Record<ThemePreference, string> = {
  system: 'Automático',
  light: 'Claro',
  dark: 'Oscuro',
};

/**
 * Profile, preferences and support.
 *
 * Also the app's honesty page: it shows which environment the build points at
 * and the real integration status of every feature. During a phase where most
 * screens run on fixtures, having that one tap away is worth more than another
 * decorative section.
 */
export default function ProfileScreen() {
  const theme = useTheme();
  const brandState = useCompanyBrand();
  const { session, signOut } = useAuth();
  const { preference, setPreference } = useAppTheme();

  const customer = session?.customer ?? null;
  const name = displayName(customer);

  const openExternal = (url: string) => {
    void Linking.openURL(url).catch(() => undefined);
  };

  return (
    <Screen scrollable>
      <View
        style={{
          alignItems: 'center',
          gap: theme.spacing.sm,
          paddingTop: theme.spacing.lg,
          paddingBottom: theme.spacing.xl,
        }}
      >
        <Avatar initials={initials(customer)} size="lg" />
        <View style={{ alignItems: 'center', gap: 2 }}>
          <Text variant="title2" accessibilityRole="header">
            {name ?? 'Invitado'}
          </Text>
          {customer?.email ? (
            <Text variant="subhead" color="textSecondary">
              {customer.email}
            </Text>
          ) : null}
        </View>

        {session?.mode === 'mock' ? (
          <Badge label="Sesión de desarrollo" tone="accent" uppercase />
        ) : null}
      </View>

      <View style={{ gap: theme.spacing.xl }}>
        {/* ── Appearance ────────────────────────────────────────────────── */}
        <View>
          <SectionHeader title="Apariencia" />
          <Card padded={false}>
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel="Tema de la aplicación"
            >
              {THEME_PREFERENCES.map((option, index) => (
                <View key={option}>
                  {index > 0 ? <Divider inset={theme.spacing.md} /> : null}
                  <ListRow
                    label={themeLabels[option]}
                    description={
                      option === 'system' ? 'Sigue la configuración del sistema' : undefined
                    }
                    icon={index === 0 ? icons.theme : undefined}
                    onPress={() => {
                      hapticSelection();
                      setPreference(option);
                    }}
                    trailing={
                      preference === option ? (
                        <Text variant="headline" color="accentText">
                          ✓
                        </Text>
                      ) : (
                        <View style={{ width: theme.sizes.iconMd }} />
                      )
                    }
                  />
                </View>
              ))}
            </View>
          </Card>
        </View>

        {/* ── Support ───────────────────────────────────────────────────── */}
        {brandState.status === 'ready' ? (
          <View>
            <SectionHeader title="Soporte" eyebrow={brandState.brand.name} />
            <Card padded={false}>
              {brandState.brand.supportPhone ? (
                <ListRow
                  label="WhatsApp"
                  value={brandState.brand.supportPhone}
                  icon={icons.phone}
                  onPress={() =>
                    openExternal(
                      `https://wa.me/${brandState.brand.supportPhone.replace(/\D/g, '')}`,
                    )
                  }
                  accessibilityHint="Abre WhatsApp"
                />
              ) : null}

              {/* Hidden rather than shown empty: the brand master document lists
                  no support email, and inventing one would be worse than
                  omitting it. See PENDIENTE BRANDING in docs/DESIGN_SYSTEM.md. */}
              {brandState.brand.supportEmail ? (
                <>
                  <Divider inset={theme.spacing.md} />
                  <ListRow
                    label="Correo"
                    value={brandState.brand.supportEmail}
                    icon={icons.mail}
                    onPress={() => openExternal(`mailto:${brandState.brand.supportEmail}`)}
                  />
                </>
              ) : null}

              {brandState.brand.address ? (
                <>
                  <Divider inset={theme.spacing.md} />
                  <ListRow
                    label="Tienda"
                    description={brandState.brand.address}
                    icon={icons.pin}
                  />
                </>
              ) : null}

              {brandState.brand.website ? (
                <>
                  <Divider inset={theme.spacing.md} />
                  <ListRow
                    label="Sitio web"
                    icon={icons.globe}
                    onPress={() => openExternal(brandState.brand.website)}
                    accessibilityHint="Abre el sitio web en el navegador"
                  />
                </>
              ) : null}
            </Card>
          </View>
        ) : brandState.status === 'unavailable' ? (
          // No invented contact details. A build whose tenant brand has not
          // resolved has nothing truthful to put here.
          <View>
            <SectionHeader title="Soporte" />
            <Card variant="outlined">
              <Text variant="footnote" color="textSecondary">
                {brandState.reason}
              </Text>
            </Card>
          </View>
        ) : null}

        {/* ── Integration status ────────────────────────────────────────── */}
        <View>
          <SectionHeader
            title="Estado de integración"
            eyebrow="Desarrollo"
          />
          <Card>
            <View style={{ gap: theme.spacing.sm }}>
              {Object.entries(featureIntegration).map(([key, feature]) => (
                <View
                  key={key}
                  accessible
                  accessibilityLabel={`${feature.label}: ${feature.status}`}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: theme.spacing.sm,
                  }}
                >
                  <Text variant="subhead" style={{ flex: 1 }}>
                    {feature.label}
                  </Text>
                  <Badge label={feature.status} tone="outline" uppercase />
                </View>
              ))}

              <Divider />

              <View style={{ gap: 2 }}>
                <Text variant="caption" color="textTertiary">
                  Entorno: {appEnvironment}
                  {useMockData ? ' · mocks activos' : ' · API activa'}
                  {' · '}
                  {mockDataPolicy.reason}
                </Text>
                <Text variant="caption" color="textTertiary">
                  Empresa: {tenant.status === 'resolved' ? tenant.slug : 'sin configurar'}
                </Text>
                <Text variant="caption" color="textTertiary">
                  API: {isApiConfigured ? apiBaseUrl : 'sin configurar'}
                </Text>
                {/* The catalogue source is the one thing most likely to be
                    misread as "integrated". Say it plainly. */}
                <Text variant="caption" color="textTertiary">
                  Catálogo: {legacyCatalogPolicy.source} · {legacyCatalogPolicy.decision}
                </Text>
              </View>

              {/* Only ever non-empty in a misconfigured release build. Shown
                  rather than thrown: crashing a store build over a missing
                  variable is worse than reporting it clearly. */}
              {configurationIssues.length > 0 ? (
                <View
                  accessible
                  accessibilityRole="alert"
                  style={{
                    gap: 4,
                    padding: theme.spacing.sm,
                    borderRadius: theme.radius.sm,
                    backgroundColor: theme.colors.statusDangerSurface,
                  }}
                >
                  <Text variant="caption" style={{ color: theme.colors.statusDanger }}>
                    Configuración inválida
                  </Text>
                  {configurationIssues.map((issue) => (
                    <Text
                      key={issue.code}
                      variant="caption"
                      style={{ color: theme.colors.statusDanger }}
                    >
                      • {issue.message}
                    </Text>
                  ))}
                </View>
              ) : null}
            </View>
          </Card>
        </View>

        {/* ── Session ───────────────────────────────────────────────────── */}
        <Button
          label="Cerrar sesión"
          variant="destructive"
          icon={icons.signOut}
          fullWidth
          onPress={() => {
            void signOut().then(() => router.replace('/(auth)/login'));
          }}
          accessibilityHint="Cierra la sesión y vuelve a la pantalla de inicio de sesión"
        />

        {brandState.status === 'ready' ? (
          <Text variant="caption" color="textTertiary" center>
            {brandState.brand.name}
            {brandState.brand.tagline ? ` · ${brandState.brand.tagline}` : ''}
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}
