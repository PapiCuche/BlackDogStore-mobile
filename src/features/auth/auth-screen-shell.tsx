import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Screen, Text } from '@/design-system';
import { useCompanyBrand } from '@/hooks/use-company-brand';
import { useTheme } from '@/theme/theme-provider';

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

  return (
    <Screen scrollable avoidKeyboard contentContainerStyle={{ flexGrow: 1 }}>
      <View style={{ flex: 1, justifyContent: 'center', paddingVertical: theme.spacing.xl }}>
        {showBrand ? (
          <View style={{ marginBottom: theme.spacing.xxl }}>
            <BrandLockup state={brandState} />
          </View>
        ) : null}

        <View style={{ gap: theme.spacing.xxs, marginBottom: theme.spacing.lg }}>
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
