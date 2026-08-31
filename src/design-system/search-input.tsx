import { Pressable, TextInput, View } from 'react-native';

import { useTheme } from '@/theme/theme-provider';

import { Icon, icons } from './icon';

export type SearchInputProps = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  accessibilityLabel?: string;
  onSubmitEditing?: () => void;
};

/**
 * The catalogue search field.
 *
 * Separate from `Input` because it is a different control with different
 * ergonomics: no label (the magnifier and placeholder carry it), a clear
 * button, and iOS's `search` return key. Forcing both into one component would
 * mean a pile of mutually exclusive props.
 */
export function SearchInput({
  value,
  onChangeText,
  placeholder = 'Buscar productos',
  accessibilityLabel = 'Buscar productos',
  onSubmitEditing,
}: SearchInputProps) {
  const theme = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs,
        height: theme.sizes.controlCompact + 4,
        paddingHorizontal: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surface,
        borderWidth: theme.sizes.hairline,
        borderColor: theme.colors.border,
      }}
    >
      <Icon name={icons.search} size={theme.sizes.iconMd} color={theme.colors.textTertiary} />

      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textTertiary}
        accessibilityLabel={accessibilityLabel}
        role="searchbox"
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
        clearButtonMode="never"
        onSubmitEditing={onSubmitEditing}
        style={{
          flex: 1,
          color: theme.colors.textPrimary,
          ...theme.typography.callout,
        }}
      />

      {value.length > 0 ? (
        <Pressable
          onPress={() => onChangeText('')}
          accessibilityRole="button"
          accessibilityLabel="Borrar búsqueda"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Icon name={icons.clear} size={theme.sizes.iconMd} color={theme.colors.textTertiary} />
        </Pressable>
      ) : null}
    </View>
  );
}
