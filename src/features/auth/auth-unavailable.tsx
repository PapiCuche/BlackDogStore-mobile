import { View } from 'react-native';

import { authRuntimePolicy } from '@/auth/auth-policy';
import { appEnvironment } from '@/config/env';
import { Card, Icon, icons, Screen, Text } from '@/design-system';
import { useTheme } from '@/theme/theme-provider';

import { BrandLockup } from './brand-lockup';
import { useCompanyBrand } from '@/hooks/use-company-brand';

/**
 * Shown instead of a sign-in form when this build has no way to authenticate.
 *
 * Two rules shape the copy:
 *
 *  1. NO FORM. A field that cannot possibly succeed is worse than no field: the
 *     user types a real password into something that will always reject it, and
 *     concludes their credentials are wrong.
 *  2. NO JARGON. No BR numbers, no JWT, no CSRF, no `/api/v1/`. The customer did
 *     nothing wrong and none of that is theirs to reason about. The technical
 *     detail appears only in the development diagnostic block below, which is
 *     compiled out of the reader's attention in a release because it is gated on
 *     `appEnvironment === 'development'`.
 *
 * It is also not styled as an error. Nothing is broken from the user's side, so
 * a red alert would be both inaccurate and alarming.
 */
export function AuthUnavailableScreen({
  title = 'Acceso temporalmente no disponible',
  message = 'Estamos preparando la conexión segura de esta aplicación con tu cuenta.',
}: {
  title?: string;
  message?: string;
}) {
  const theme = useTheme();
  const brandState = useCompanyBrand();
  const isDevelopment = appEnvironment === 'development';

  return (
    <Screen scrollable contentContainerStyle={{ flexGrow: 1 }}>
      <View style={{ flex: 1, justifyContent: 'center', gap: theme.spacing.xl }}>
        <BrandLockup state={brandState} />

        <View
          accessible
          accessibilityRole="alert"
          accessibilityLabel={`${title}. ${message}`}
          style={{ alignItems: 'center', gap: theme.spacing.sm }}
        >
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.surfaceSubtle,
            }}
          >
            <Icon name={icons.info} size={theme.sizes.iconXl} color={theme.colors.textTertiary} />
          </View>

          <Text variant="title2" center accessibilityRole="header">
            {title}
          </Text>

          <Text variant="subhead" color="textSecondary" center style={{ maxWidth: 320 }}>
            {message}
          </Text>
        </View>

        {/* Development-only diagnostic. Never rendered in a release build. */}
        {isDevelopment ? (
          <Card variant="outlined">
            <View style={{ gap: 2 }}>
              <Text variant="overline" color="textTertiary" style={{ textTransform: 'uppercase' }}>
                Diagnóstico de desarrollo
              </Text>
              <Text variant="caption" color="textTertiary">
                auth: {authRuntimePolicy.mode} · {authRuntimePolicy.decision}
              </Text>
              <Text variant="caption" color="textTertiary">
                {authRuntimePolicy.reason}
              </Text>
            </View>
          </Card>
        ) : null}
      </View>
    </Screen>
  );
}
