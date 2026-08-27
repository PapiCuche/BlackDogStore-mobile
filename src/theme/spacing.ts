/**
 * Spacing scale.
 *
 * One scale, nine steps. A layout that needs a value not on this scale is
 * usually a layout that has drifted — reach for the nearest step instead of
 * adding a tenth.
 */
export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
  section: 48,
} as const;

export type SpacingToken = keyof typeof spacing;

/** Horizontal page gutter. Every full-width screen uses this, nothing else. */
export const screenGutter = spacing.lg;
