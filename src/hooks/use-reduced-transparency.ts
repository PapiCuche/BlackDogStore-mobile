import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

/**
 * Whether the OS "Reduce Transparency" setting is on.
 *
 * The sibling of `useReducedMotion`, and it deserves the same respect. Someone
 * who turned this on is telling the system that translucent panes cost them
 * legibility — low vision, glare sensitivity, a screen in direct sunlight. A
 * design language built on frosted material has to be able to stop being
 * frosted, or it is a design language that excludes them.
 *
 * iOS-only in React Native: `isReduceTransparencyEnabled` has no Android
 * counterpart. Android already renders the opaque material for a separate
 * reason (see `materials.ts`), so the two answers agree there anyway.
 *
 * Starts `false` and corrects itself on the first frame. The wrong direction
 * for one frame is a pane that is briefly frosted, not a pane that is briefly
 * missing.
 */
export function useReducedTransparency(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    let cancelled = false;

    AccessibilityInfo.isReduceTransparencyEnabled()
      .then((enabled) => {
        if (!cancelled) setReduced(enabled);
      })
      .catch(() => undefined);

    const subscription = AccessibilityInfo.addEventListener(
      'reduceTransparencyChanged',
      (enabled: boolean) => setReduced(enabled),
    );

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  return reduced;
}
