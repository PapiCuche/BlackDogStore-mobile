import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme/theme-provider';

import { Text } from './text';

export type AppHeaderProps = {
  title: string;
  /** Small all-caps line above the title. */
  eyebrow?: string;
  subtitle?: string;
  /** Trailing control — an avatar, an IconButton. */
  trailing?: ReactNode;
};

/**
 * A large in-page title.
 *
 * This is NOT the navigation bar. Native stack headers are configured through
 * `Stack.Screen options` and rendered by UIKit; drawing a second fake header
 * underneath one is how apps end up with two titles and a broken back gesture.
 * `AppHeader` is for the tab screens, which run headerless on purpose so the
 * title can scroll away with the content.
 */
export function AppHeader({ title, eyebrow, subtitle, trailing }: AppHeaderProps) {
  const theme = useTheme();

  return (
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
        {eyebrow ? (
          <Text variant="overline" color="textTertiary" style={{ textTransform: 'uppercase' }}>
            {eyebrow}
          </Text>
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

      {trailing}
    </View>
  );
}
