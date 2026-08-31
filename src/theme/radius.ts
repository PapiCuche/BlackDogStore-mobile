/**
 * Corner radii. Soft, never round-for-the-sake-of-it.
 *
 * `card` is the value a Card uses; changing it re-shapes the product in one
 * place, which is the entire reason it is not spelled `18` at each call site.
 */
export const radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

export type RadiusToken = keyof typeof radius;

export const cardRadius = radius.lg;
export const controlRadius = radius.md;
