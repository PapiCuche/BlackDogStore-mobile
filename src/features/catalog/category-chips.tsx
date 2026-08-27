import { Pressable, ScrollView } from 'react-native';

import { Text } from '@/design-system';
import type { Category } from '@/domain/products/types';
import { useTheme } from '@/theme/theme-provider';
import { hapticSelection } from '@/utils/haptics';

export type CategoryChipsProps = {
  categories: readonly Category[];
  /** Null means "Todo". */
  selectedSlug: string | null;
  onSelect: (slug: string | null) => void;
};

/**
 * Horizontal category filter.
 *
 * Uses `accessibilityRole="radio"` with `selected` state rather than a plain
 * button: it is a single-choice filter, and announcing "seleccionado" is what
 * tells a screen reader user which one is active.
 */
export function CategoryChips({ categories, selectedSlug, onSelect }: CategoryChipsProps) {
  const theme = useTheme();

  const options: { slug: string | null; name: string }[] = [
    { slug: null, name: 'Todo' },
    ...categories.map((category) => ({ slug: category.slug, name: category.name })),
  ];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="radiogroup"
      contentContainerStyle={{ gap: theme.spacing.xs, paddingVertical: theme.spacing.xxs }}
    >
      {options.map((option) => {
        const isSelected = option.slug === selectedSlug;
        return (
          <Pressable
            key={option.slug ?? '__all__'}
            onPress={() => {
              hapticSelection();
              onSelect(option.slug);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={option.name}
            style={({ pressed }) => ({
              minHeight: theme.sizes.chip,
              paddingHorizontal: theme.spacing.sm,
              justifyContent: 'center',
              borderRadius: theme.radius.pill,
              borderWidth: theme.sizes.hairline,
              borderColor: isSelected ? 'transparent' : theme.colors.border,
              backgroundColor: isSelected
                ? theme.colors.actionBackground
                : pressed
                  ? theme.colors.surfacePressed
                  : theme.colors.surface,
            })}
          >
            <Text
              variant="subhead"
              style={{
                fontWeight: '600',
                color: isSelected ? theme.colors.textOnAction : theme.colors.textSecondary,
              }}
            >
              {option.name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
