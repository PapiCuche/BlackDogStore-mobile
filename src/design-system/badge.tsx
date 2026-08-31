import { View } from 'react-native';

import { useTheme } from '@/theme/theme-provider';

import { Text } from './text';

export type BadgeTone = 'neutral' | 'accent' | 'outline';

export type BadgeProps = {
  label: string;
  tone?: BadgeTone;
  /** Renders the label in caps with tracking, like the web `.section-label`. */
  uppercase?: boolean;
};

/**
 * A small non-interactive label.
 *
 * For anything that represents a lifecycle state, use `StatusBadge` instead —
 * it takes a tone from the domain rather than from the call site, so a status
 * cannot be coloured wrong by a screen.
 */
export function Badge({ label, tone = 'neutral', uppercase = false }: BadgeProps) {
  const theme = useTheme();

  const toneStyle =
    tone === 'accent'
      ? { backgroundColor: theme.colors.accentSurface, borderColor: 'transparent' as const }
      : tone === 'outline'
        ? { backgroundColor: 'transparent' as const, borderColor: theme.colors.border }
        : { backgroundColor: theme.colors.surfaceSubtle, borderColor: 'transparent' as const };

  return (
    <View
      style={{
        alignSelf: 'flex-start',
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: 4,
        borderRadius: theme.radius.pill,
        borderWidth: theme.sizes.hairline,
        ...toneStyle,
      }}
    >
      <Text
        variant={uppercase ? 'overline' : 'caption'}
        color={tone === 'accent' ? 'accentText' : 'textSecondary'}
        style={uppercase ? { textTransform: 'uppercase' } : undefined}
      >
        {label}
      </Text>
    </View>
  );
}
