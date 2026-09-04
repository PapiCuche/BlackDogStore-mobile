import { View } from 'react-native';

import type { StatusTone } from '@/domain/orders/status';
import type { ColorTokens } from '@/theme';
import { useTheme } from '@/theme/theme-provider';

import { Text } from './text';

export type StatusBadgeProps = {
  label: string;
  tone: StatusTone;
  /**
   * Prefix read by a screen reader, e.g. "Estado del pedido".
   * Without it VoiceOver announces a bare "Pagado" with no idea what is paid.
   */
  accessibilityPrefix?: string;
  size?: 'default' | 'small';
};

/**
 * A lifecycle state.
 *
 * The `tone` comes from the domain layer (`describePaymentStatus`,
 * `describeRepairStatus`), never from the screen — that is what guarantees
 * "En reparación" is the same colour everywhere it appears.
 *
 * Colour is never the only signal: the label always carries the meaning in
 * words, so the badge survives greyscale, low vision and colour blindness.
 */
/**
 * The colour a tone is written in.
 *
 * Exported because a state is not always a badge: product availability is plain
 * coloured text next to a price, and it must still be the tone the domain chose.
 * One mapping, so "warning" cannot mean amber here and green there.
 */
export function statusToneColor(tone: StatusTone): keyof ColorTokens {
  return `status${capitalise(tone)}` as keyof ColorTokens;
}

export function StatusBadge({
  label,
  tone,
  accessibilityPrefix,
  size = 'default',
}: StatusBadgeProps) {
  const theme = useTheme();

  const foregroundKey = statusToneColor(tone);
  const backgroundKey = `status${capitalise(tone)}Surface` as keyof ColorTokens;

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={accessibilityPrefix ? `${accessibilityPrefix}: ${label}` : label}
      style={{
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: size === 'small' ? theme.spacing.xs : theme.spacing.sm,
        paddingVertical: size === 'small' ? 4 : 6,
        borderRadius: theme.radius.pill,
        backgroundColor: theme.colors[backgroundKey],
      }}
    >
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: theme.colors[foregroundKey],
        }}
      />
      <Text
        variant="caption"
        style={{ color: theme.colors[foregroundKey], fontWeight: '600' }}
      >
        {label}
      </Text>
    </View>
  );
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
