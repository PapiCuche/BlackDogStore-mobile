import { HeaderHeightContext } from 'expo-router/react-navigation';
import { screen } from '@testing-library/react-native';
import { View } from 'react-native';

import { Screen } from '@/design-system';

import { renderWithProviders } from './support/render';

/**
 * A screen with no navigation header still starts below the status bar.
 *
 * FOUND BY RUNNING THE APP, not by reading it. On an iPhone 17 Pro the home
 * screen drew "Hola, Prueba" underneath the system clock and clipped the avatar
 * against the Dynamic Island. All five tab screens did it, and no test, lint
 * rule or type could see it.
 *
 * The cause is one operator. `Screen` takes its top padding from
 * `HeaderHeightContext`, which already includes the status-bar inset and so
 * correctly REPLACES `insets.top` — but a stack screen configured with
 * `headerShown: false` still publishes that context with the value 0, and `??`
 * falls back only on null. `0 ?? insets.top` is 0. The whole tab group is
 * mounted under exactly such a screen, so the inset silently vanished.
 *
 * WHY THIS FILE RE-MOCKS THE INSETS. `jest.setup` stubs every inset to 0, which
 * is fine for screens that do not care and useless here: with a top inset of 0
 * the broken expression and the fixed one both yield 0, and the test would pass
 * against the bug it exists to catch. A non-zero inset is the whole experiment.
 */

const INSET_TOP = 59;

jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual('react-native-safe-area-context');
  return {
    ...actual,
    useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
  };
});

/**
 * `testID` lands on the scrolling body; the frame that owns `paddingTop` is its
 * parent. Walking up until a `paddingTop` appears keeps this from breaking the
 * next time a wrapper is added between them.
 */
function paddingTopOf(testID: string): unknown {
  type Node = { props?: { style?: unknown }; parent?: Node | null };
  let node: Node | null = screen.getByTestId(testID) as unknown as Node;

  for (let depth = 0; node && depth < 8; depth += 1) {
    const style = [node.props?.style].flat(Infinity).filter(Boolean) as object[];
    const { paddingTop } = Object.assign({}, ...style) as { paddingTop?: unknown };
    if (paddingTop !== undefined) return paddingTop;
    node = node.parent ?? null;
  }
  return undefined;
}

describe('Screen chooses the right top padding', () => {
  it('uses the safe-area inset when the header context says zero', async () => {
    // The tab group's exact situation: the context EXISTS and says zero,
    // because the stack screen above it sets `headerShown: false`.
    await renderWithProviders(
      <HeaderHeightContext.Provider value={0}>
        <Screen testID="no-header">
          <View />
        </Screen>
      </HeaderHeightContext.Provider>,
    );

    expect(paddingTopOf('no-header')).toBe(INSET_TOP);
  });

  it('uses the header height when a header really is there', async () => {
    // A pushed stack screen. The header already contains the status-bar inset,
    // so adding the inset on top would start the page an inch too low.
    await renderWithProviders(
      <HeaderHeightContext.Provider value={96}>
        <Screen testID="with-header">
          <View />
        </Screen>
      </HeaderHeightContext.Provider>,
    );

    expect(paddingTopOf('with-header')).toBe(96);
  });

  it('uses the safe-area inset outside a navigator entirely', async () => {
    // No provider at all, so the context is undefined rather than zero — the
    // case the original `??` did handle. Kept so the fix cannot regress it.
    await renderWithProviders(
      <Screen testID="no-navigator">
        <View />
      </Screen>,
    );

    expect(paddingTopOf('no-navigator')).toBe(INSET_TOP);
  });
});
