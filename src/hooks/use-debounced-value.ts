import { useEffect, useState } from 'react';

/**
 * The value, but only after it has stopped changing for `delayMs`.
 *
 * WHY THIS EXISTS AND `useDeferredValue` DOES NOT DO IT. Deferring lowers the
 * priority of a render so typing stays responsive, and React MAY skip
 * intermediate values when it is busy — but that is a scheduling hint, not a
 * contract. On an idle device every keystroke can still land, and a query key
 * built from the value then starts a request per character. If the goal is
 * "typing fast must not start five searches", a timer is what actually says so.
 *
 * The two are not rivals: this coalesces the INPUT, and TanStack's AbortSignal
 * cancels a request that has already left and is now obsolete. Neither replaces
 * the other, and neither can promise that an aborted request never reached the
 * server — only that the client stopped waiting for its answer.
 *
 * THE FIRST VALUE IS NOT DELAYED. A screen that mounts with a term already in
 * hand should query now; waiting `delayMs` to show a list nobody has typed into
 * would be a stall with no cause.
 *
 * A caller that needs a particular value to bypass the wait — an empty box that
 * should restore its full list at once — compares for it at the call site. That
 * rule belongs to the screen, not to a general-purpose timer.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    if (Object.is(value, settled)) return undefined;

    const timer = setTimeout(() => setSettled(value), delayMs);
    // Cleared on the next change AND on unmount, so a component that goes away
    // mid-timer never sets state on something that is gone.
    return () => clearTimeout(timer);
    // `settled` is deliberately absent: including it would restart the timer
    // when the value finally lands, which is the one moment nothing should be
    // scheduled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, delayMs]);

  return settled;
}
