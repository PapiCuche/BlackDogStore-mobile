import { forwardRef, useState } from 'react';
import {
  Pressable,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '@/theme/theme-provider';

import { Icon, icons } from './icon';
import { Text } from './text';

export type InputProps = Omit<TextInputProps, 'style'> & {
  label: string;
  /** Validation message. Its presence is what puts the field in an error state. */
  error?: string;
  /** Persistent guidance shown when there is no error. */
  hint?: string;
  /** Renders the show/hide toggle and manages `secureTextEntry`. */
  isPassword?: boolean;
  containerStyle?: ViewStyle;
};

/**
 * A labelled text field.
 *
 * The label is a real, always-visible `<Text>` rather than a floating
 * placeholder. Placeholder-as-label disappears the moment the user types,
 * which strands anyone who looks away mid-form, and it is invisible to a screen
 * reader once filled.
 *
 * Errors are wired to `accessibilityLiveRegion` / `accessibilityInvalid` so
 * VoiceOver and TalkBack announce a failure instead of silently colouring a
 * border red.
 */
export const Input = forwardRef<TextInput, InputProps>(function Input(
  { label, error, hint, isPassword = false, containerStyle, ...rest },
  ref,
) {
  const theme = useTheme();
  const [isFocused, setIsFocused] = useState(false);
  const [isSecureVisible, setIsSecureVisible] = useState(false);

  const borderColor = error
    ? theme.colors.danger
    : isFocused
      ? theme.colors.borderStrong
      : theme.colors.border;

  return (
    <View style={[{ gap: 6 }, containerStyle]}>
      <Text variant="subhead" color="textSecondary" style={{ fontWeight: '600' }}>
        {label}
      </Text>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          minHeight: theme.sizes.control,
          paddingHorizontal: theme.spacing.sm,
          borderRadius: theme.radius.md,
          borderWidth: isFocused || error ? 1.5 : theme.sizes.hairline,
          borderColor,
          backgroundColor: theme.colors.surface,
        }}
      >
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          accessibilityHint={hint}
          // The API is `aria-invalid` in current React Native; it maps to the
          // native invalid trait on both platforms.
          aria-invalid={Boolean(error)}
          placeholderTextColor={theme.colors.textTertiary}
          secureTextEntry={isPassword && !isSecureVisible}
          onFocus={(event) => {
            setIsFocused(true);
            rest.onFocus?.(event);
          }}
          onBlur={(event) => {
            setIsFocused(false);
            rest.onBlur?.(event);
          }}
          style={{
            flex: 1,
            paddingVertical: theme.spacing.xs,
            color: theme.colors.textPrimary,
            ...theme.typography.body,
          }}
          {...rest}
        />

        {isPassword ? (
          <Pressable
            onPress={() => setIsSecureVisible((visible) => !visible)}
            accessibilityRole="button"
            accessibilityLabel={isSecureVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={{ paddingLeft: theme.spacing.xs }}
          >
            <Icon
              name={isSecureVisible ? icons.eyeOff : icons.eye}
              size={theme.sizes.iconMd}
              color={theme.colors.textSecondary}
            />
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <Text
          variant="footnote"
          color="danger"
          accessibilityLiveRegion="polite"
          role="alert"
        >
          {error}
        </Text>
      ) : hint ? (
        <Text variant="footnote" color="textTertiary">
          {hint}
        </Text>
      ) : null}
    </View>
  );
});
