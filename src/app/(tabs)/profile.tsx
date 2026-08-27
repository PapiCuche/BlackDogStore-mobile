import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import { View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { apiBaseUrl, appEnvironment, isApiConfigured, useMockData } from '@/config/env';
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
  const brand = useCompanyBrand();
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
        <View>
          <SectionHeader title="Soporte" eyebrow={brand.name} />
          <Card padded={false}>
            {brand.supportPhone ? (
              <ListRow
                label="WhatsApp"
                value={brand.supportPhone}
                icon={icons.phone}
                onPress={() =>
                  openExternal(`https://wa.me/${brand.supportPhone.replace(/\D/g, '')}`)
                }
                accessibilityHint="Abre WhatsApp"
              />
            ) : null}

            {/* Hidden rather than shown empty: the brand master document lists
                no support email, and inventing one would be worse than omitting
                it. See PENDIENTE BRANDING in docs/DESIGN_SYSTEM.md. */}
            {brand.supportEmail ? (
              <>
                <Divider inset={theme.spacing.md} />
                <ListRow
                  label="Correo"
                  value={brand.supportEmail}
                  icon={icons.mail}
                  onPress={() => openExternal(`mailto:${brand.supportEmail}`)}
                />
              </>
            ) : null}

            {brand.address ? (
              <>
                <Divider inset={theme.spacing.md} />
                <ListRow label="Tienda" description={brand.address} icon={icons.pin} />
              </>
            ) : null}

            <Divider inset={theme.spacing.md} />
            <ListRow
              label="Sitio web"
              icon={icons.globe}
              onPress={() => openExternal(brand.website)}
              accessibilityHint="Abre el sitio web en el navegador"
            />
          </Card>
        </View>

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
                </Text>
                <Text variant="caption" color="textTertiary">
                  API: {isApiConfigured ? apiBaseUrl : 'sin configurar'}
                </Text>
              </View>
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

        <Text variant="caption" color="textTertiary" center>
          {brand.name} · {brand.tagline}
        </Text>
      </View>
    </Screen>
  );
}
