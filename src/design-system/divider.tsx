import { View, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/theme-provider';

export type DividerProps = {
  /** Indent from the left, to align with text that follows an icon or avatar. */
  inset?: number;
  style?: ViewStyle;
};

/**
 * A hairline rule.
 *
 * Width is `StyleSheet.hairlineWidth`, not 1 — on a 3x iPhone display a 1pt
 * rule is three device pixels and reads as a heavy line.
 */
export function Divider({ inset = 0, style }: DividerProps) {
  const theme = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          height: theme.sizes.hairline,
          backgroundColor: theme.colors.border,
          marginLeft: inset,
        },
        style,
      ]}
    />
  );
}
