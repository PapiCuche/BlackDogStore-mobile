import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Badge, Screen, Text } from '@/design-system';
import { useCompanyBrand } from '@/hooks/use-company-brand';
import { useTheme } from '@/theme/theme-provider';

import { useAuth } from '@/auth/auth-provider';

import { BrandLockup } from './brand-lockup';

/**
 * Shared layout for the five authentication screens.
 *
 * `avoidKeyboard` is on for all of them: every one has a text field, and an iOS
 * keyboard covering the submit button is the single most common mobile form
 * bug.
 */
export function AuthScreenShell({
  title,
  subtitle,
  children,
  footer,
  showBrand = true,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  showBrand?: boolean;
}) {
  const theme = useTheme();
  const brandState = useCompanyBrand();
  const { policy } = useAuth();

  return (
    <Screen scrollable avoidKeyboard contentContainerStyle={{ flexGrow: 1 }}>
      <View style={{ flex: 1, justifyContent: 'center', paddingVertical: theme.spacing.xl }}>
        {showBrand ? (
          <View style={{ marginBottom: theme.spacing.xxl }}>
            <BrandLockup state={brandState} />
          </View>
        ) : null}

        <View style={{ gap: theme.spacing.xxs, marginBottom: theme.spacing.lg }}>
          {/* Discreet, never dramatic: enough that nobody mistakes a demo
              session for a real one, not so loud it dominates the screen. */}
          {policy.mode === 'mock' ? (
            <View style={{ marginBottom: theme.spacing.xxs }}>
              <Badge label="Modo demo" tone="accent" uppercase />
            </View>
          ) : null}

          <Text variant="title1" accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? (
            <Text variant="subhead" color="textSecondary">
              {subtitle}
            </Text>
          ) : null}
        </View>

        <View style={{ gap: theme.spacing.md }}>{children}</View>

        {footer ? <View style={{ marginTop: theme.spacing.xl }}>{footer}</View> : null}
      </View>
    </Screen>
  );
}
