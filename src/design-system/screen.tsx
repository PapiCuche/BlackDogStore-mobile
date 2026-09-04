import { BottomTabBarHeightContext } from 'expo-router/js-tabs';
import { HeaderHeightContext } from 'expo-router/react-navigation';
import { use, type ReactNode } from 'react';
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
 *  1. SAFE AREA AND THE TAB BAR. Only the TOP and the horizontal edges come
 *     from the insets. The bottom comes from the TAB BAR's own height, read
 *     from `BottomTabBarHeightContext`.
 *
 *     UI7 made that necessary. The tab bar is now a floating frosted pane —
 *     `position: absolute`, so content passes underneath it and there is
 *     something for the material to blur. The scene therefore no longer ends
 *     above the bar, and every screen would hide its last row behind it.
 *     Reading the real height here fixes that once, for every screen, instead
 *     of thirty screens each guessing 49 or 56 points.
 *
 *     The CONTEXT is read rather than `useBottomTabBarHeight()`: that hook
 *     throws outside a tab navigator, and this shell is also used by the auth
 *     stack and by every pushed screen. Undefined is a valid answer meaning
 *     "no tab bar here", and it costs no padding.
 *
 *     The stack HEADER is the same story from the other end. It is transparent
 *     from UI7, so the scene runs under it; `HeaderHeightContext` says by how
 *     much, and it already includes the status-bar inset — which is why it
 *     replaces `insets.top` instead of adding to it.
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
  // Undefined outside a tab navigator. That is not a failure — it is a screen
  // with no tab bar under it.
  const tabBarHeight = use(BottomTabBarHeightContext);
  // Defined under a stack header. It ALREADY includes the status-bar inset, so
  // it replaces `insets.top` rather than adding to it — the classic way to end
  // up with a screen that starts an inch too low.
  //
  // ZERO IS NOT A HEADER. A stack screen with `headerShown: false` still
  // publishes this context, with the value 0, and `??` only falls back on
  // null — so `0 ?? insets.top` is 0 and the status-bar inset vanished. The
  // whole tab group is mounted under exactly such a screen, which put the
  // greeting on the home screen underneath the clock and clipped the avatar
  // against the Dynamic Island. Five screens, and no test could see it.
  const headerHeight = use(HeaderHeightContext);
  const topInset = headerHeight ? headerHeight : insets.top;

  const frame: ViewStyle = {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingTop: topInset,
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
        // Breathing room, PLUS whatever the floating tab bar occupies. Without
        // the second term the last card sits behind the frosted pane, which
        // looks like a rendering bug rather than a design.
        { paddingBottom: theme.spacing.xxl + (tabBarHeight ?? 0) },
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
    // A screen that owns its own FlatList gets the space as padding on the
    // CONTAINER, which ends the list's viewport above the bar rather than
    // letting rows travel under it. Slightly less of the effect, and correct
    // without editing every list in the app: the alternative is threading the
    // inset into each `contentContainerStyle`, which only the list itself can
    // do. Recorded as scope, not pretended away.
    <View
      testID={testID}
      style={[{ flex: 1 }, inner, { paddingBottom: tabBarHeight ?? 0 }, contentContainerStyle]}
    >
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
