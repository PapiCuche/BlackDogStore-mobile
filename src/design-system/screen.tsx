import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { screenGutter, sizes } from '@/theme';
import { useTheme } from '@/theme/theme-provider';

export type ScreenProps = {
  children: ReactNode;
  /** Wraps content in a ScrollView. Off for screens that own a FlatList. */
  scrollable?: boolean;
  /** Applies the horizontal page gutter. Off for edge-to-edge lists. */
  padded?: boolean;
  /** Pull-to-refresh. Only meaningful with `scrollable`. */
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Lifts content above the keyboard. On for any screen with a text field. */
  avoidKeyboard?: boolean;
  contentContainerStyle?: ViewStyle;
  testID?: string;
};

/**
 * The page shell.
 *
 * Owns the four things that are easy to get wrong once per screen and then
 * inconsistent forever:
 *
 *  1. SAFE AREA. Only the TOP and the horizontal edges are consumed here. The
 *     bottom belongs to the tab bar: Expo Router's tabs navigator sits below
 *     the scene and applies the home-indicator inset itself, so the scene
 *     already ends above it. Adding `insets.bottom` here as well would produce
 *     a visible dead band above the tab bar on every notched iPhone.
 *  2. BACKGROUND. Painted from tokens so a theme switch cannot leave a white
 *     gutter behind a dark page.
 *  3. KEYBOARD. `padding` on iOS and `height` on Android is the pairing that
 *     actually works; they behave differently and a single value breaks one.
 *  4. LINE LENGTH. Capped at `maxContentWidth` and centred, so the layout does
 *     not become unreadable on an iPad or a foldable.
 */
export function Screen({
  children,
  scrollable = false,
  padded = true,
  onRefresh,
  refreshing = false,
  avoidKeyboard = false,
  contentContainerStyle,
  testID,
}: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const frame: ViewStyle = {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingTop: insets.top,
    paddingLeft: insets.left,
    paddingRight: insets.right,
  };

  const inner: ViewStyle = {
    width: '100%',
    maxWidth: sizes.maxContentWidth,
    alignSelf: 'center',
    ...(padded ? { paddingHorizontal: screenGutter } : null),
  };

  const body = scrollable ? (
    <ScrollView
      testID={testID}
      style={{ flex: 1 }}
      contentContainerStyle={[
        inner,
        // Breathing room at the bottom so the last card is not flush against
        // the tab bar.
        { paddingBottom: theme.spacing.xxl },
        contentContainerStyle,
      ]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.textSecondary}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  ) : (
    <View testID={testID} style={[{ flex: 1 }, inner, contentContainerStyle]}>
      {children}
    </View>
  );

  if (!avoidKeyboard) {
    return <View style={frame}>{body}</View>;
  }

  return (
    <KeyboardAvoidingView
      style={frame}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {body}
    </KeyboardAvoidingView>
  );
}
