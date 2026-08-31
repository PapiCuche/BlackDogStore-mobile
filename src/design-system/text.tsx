import { useMemo } from 'react';
import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { useTheme } from '@/theme/theme-provider';
import type { ColorTokens, TypographyToken } from '@/theme';

export type TextVariant = TypographyToken;
export type TextColor = keyof Pick<
  ColorTokens,
  | 'textPrimary'
  | 'textSecondary'
  | 'textTertiary'
  | 'textOnAction'
  | 'accentText'
  | 'danger'
  | 'statusSuccess'
  | 'statusWarning'
  | 'statusDanger'
>;

export type TextProps = RNTextProps & {
  variant?: TextVariant;
  color?: TextColor;
  /** Convenience for the very common centred caption/empty-state case. */
  center?: boolean;
};

/**
 * The only text primitive in the app.
 *
 * Screens never reach for React Native's `Text` directly: doing so is how a
 * hardcoded `fontSize: 15` and a `color: '#666'` get into a codebase that has a
 * scale for both.
 *
 * `allowFontScaling` is deliberately left at its default of `true`. Dynamic
 * Type must keep working — a layout that breaks at large text sizes is a layout
 * bug to fix, not a reason to opt out of an accessibility setting.
 */
export function Text({
  variant = 'body',
  color = 'textPrimary',
  center = false,
  style,
  ...rest
}: TextProps) {
  const theme = useTheme();

  const baseStyle = useMemo<TextStyle>(
    () => ({
      ...(theme.typography[variant] as TextStyle),
      color: theme.colors[color],
      ...(center ? { textAlign: 'center' as const } : null),
    }),
    [theme, variant, color, center],
  );

  return <RNText style={[baseStyle, style]} {...rest} />;
}
