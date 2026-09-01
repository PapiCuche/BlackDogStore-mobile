import type { ReactNode } from 'react';
import { Pressable, StyleSheet, type ViewStyle } from 'react-native';

import type { MaterialKey } from '@/theme';
import { useTheme } from '@/theme/theme-provider';

import { GlassSurface } from './glass-surface';

export type CardVariant = 'default' | 'elevated' | 'outlined' | 'glass';

export type CardProps = {
  children: ReactNode;
  /** Makes the whole card a single control. Omit for a static container. */
  onPress?: () => void;
  /** Required when `onPress` is set — a tappable card must announce itself. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /**
   * `elevated` lifts the card off the page. `glass` frosts it, and is for panes
   * that FLOAT over content — a hero, a sheet — never for a repeating row.
   */
  variant?: CardVariant;
  padded?: boolean;
  style?: ViewStyle;
};

const MATERIAL: Record<CardVariant, MaterialKey> = {
  default: 'card',
  outlined: 'card',
  elevated: 'raised',
  glass: 'raised',
};

/**
 * The container everything sits in.
 *
 * UI7 rebuilt this on MATERIALS. A card is now a pane with an edge and a
 * specular top hairline, which is what makes a surface read as a physical layer
 * rather than as a grey rectangle — and the hairline costs one absolutely
 * positioned view, not a gradient per card.
 *
 * SOLID BY DEFAULT, and that is the important part. Cards repeat: they are the
 * row of every list in this app. A blurred pane per row is a compositing pass
 * per row, so only `variant="glass"` frosts, and it is reserved for panes that
 * genuinely float over scrolling content.
 *
 * Depth still comes from the surface ramp first and a shadow second — in dark
 * mode `elevation()` returns nothing at all, because a black shadow on a black
 * page is invisible and the material ramp does the work instead.
 */
export function Card({
  children,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  variant = 'default',
  padded = true,
  style,
}: CardProps) {
  const theme = useTheme();

  const base: ViewStyle = {
    padding: padded ? theme.spacing.md : 0,
    ...(variant === 'elevated' ? theme.elevation('card') : null),
  };

  const surface = (content: ReactNode, pressed = false) => (
    <GlassSurface
      material={MATERIAL[variant]}
      solid={variant !== 'glass'}
      radius={theme.radius.lg}
      // `outlined` is the loud edge; the others carry the material's own
      // hairline, which is quieter but never absent — a pane with no edge
      // dissolves into the page.
      bordered
      style={[
        base,
        variant === 'outlined' ? { borderColor: theme.colors.border } : null,
        // A pressed card changes fill rather than scaling or fading: opacity on
        // a whole card dims its text too, which reads as "disabled".
        pressed ? { backgroundColor: theme.colors.surfacePressed } : null,
        style,
      ]}
    >
      {content}
    </GlassSurface>
  );

  if (!onPress) return surface(children);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      style={styles.pressable}
    >
      {({ pressed }) => surface(children, pressed)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // The Pressable is a bare hit area; the pane inside owns every visual.
  pressable: { alignSelf: 'stretch' },
});

/** Re-exported so a screen can name the material a card is made of. */
export type { MaterialKey };
