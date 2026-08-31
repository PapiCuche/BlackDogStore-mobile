import { StyleSheet } from 'react-native';

/**
 * Fixed dimensions.
 *
 * `minTouchTarget` is 44 because that is the Apple Human Interface Guidelines
 * minimum; it is a floor for every pressable in the design system, not a
 * suggestion.
 */
export const sizes = {
  minTouchTarget: 44,

  /** Height of a primary control (Button, Input). */
  control: 52,
  /** Height of a secondary/inline control. */
  controlCompact: 40,
  /** Height of a chip / filter pill. */
  chip: 36,

  iconXs: 14,
  iconSm: 16,
  iconMd: 20,
  iconLg: 24,
  iconXl: 32,

  avatarSm: 32,
  avatarMd: 44,
  avatarLg: 64,

  /** Square thumbnail used by product and repair cards. */
  thumbnail: 72,

  hairline: StyleSheet.hairlineWidth,

  /** Caps line length on iPad and large Android tablets. */
  maxContentWidth: 640,
} as const;

export type SizeToken = keyof typeof sizes;
