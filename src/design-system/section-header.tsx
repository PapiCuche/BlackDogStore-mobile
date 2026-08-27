import { Pressable, View } from 'react-native';

import { useTheme } from '@/theme/theme-provider';

import { Icon, icons } from './icon';
import { Text } from './text';

export type SectionHeaderProps = {
  title: string;
  /** Small all-caps label above the title. */
  eyebrow?: string;
  /** Optional trailing action, e.g. "Ver todo". */
  actionLabel?: string;
  onActionPress?: () => void;
};

/**
 * The heading of a screen section.
 *
 * The title is marked `accessibilityRole="header"` so VoiceOver's rotor and
 * TalkBack's heading navigation can jump between sections — that is the whole
 * reason this is a component and not two `<Text>`s.
 */
export function SectionHeader({
  title,
  eyebrow,
  actionLabel,
  onActionPress,
}: SectionHeaderProps) {
  const theme = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: theme.spacing.sm,
        marginBottom: theme.spacing.sm,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        {eyebrow ? (
          <Text variant="overline" color="textTertiary" style={{ textTransform: 'uppercase' }}>
            {eyebrow}
          </Text>
        ) : null}
        <Text variant="title3" accessibilityRole="header">
          {title}
        </Text>
      </View>

      {actionLabel && onActionPress ? (
        <Pressable
          onPress={onActionPress}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          // Small text target, expanded to the 44pt minimum without changing
          // the visual layout.
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={({ pressed }) => [
            { flexDirection: 'row', alignItems: 'center', gap: 2 },
            pressed ? { opacity: 0.55 } : null,
          ]}
        >
          <Text variant="subhead" color="accentText" style={{ fontWeight: '600' }}>
            {actionLabel}
          </Text>
          <Icon name={icons.chevronRight} size={theme.sizes.iconSm} color={theme.colors.accentText} />
        </Pressable>
      ) : null}
    </View>
  );
}
