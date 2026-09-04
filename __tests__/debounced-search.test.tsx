import { act, renderHook } from '@testing-library/react-native';

import { useDebouncedValue } from '@/hooks/use-debounced-value';

/**
 * What the debounce actually promises, and what it does not.
 *
 * IT DOES NOT PROMISE ONE HTTP REQUEST PER SEARCH. A person who types «Rod»,
 * reads the list, and then finishes «Rodrigo» has made two searches and should
 * get two. The promise is narrower and testable: the intermediate letters of a
 * fast burst do not each become a query term.
 *
 * An earlier version of this screen used `useDeferredValue` and claimed the
 * stronger thing. Deferring lowers render priority and lets React SKIP
 * intermediate values when it is busy — a scheduling hint, not a contract, and
 * on an idle device it may skip none at all. These tests exist because the
 * comment and the behaviour had drifted apart, which is worse than either being
 * wrong alone.
 */

/** The screen's rule: an empty box bypasses the wait. */
function searchTerm(typed: string, debounced: string): string {
  return typed === '' ? '' : debounced;
}

describe('useDebouncedValue', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('returns the first value immediately, with no wait to show a list', async () => {
    // Case 1. Mounting with an empty term must query now — waiting 250 ms to
    // show a list nobody has typed into would be a stall with no cause.
    const { result } = await renderHook(() => useDebouncedValue('', 250));
    expect(result.current).toBe('');
  });

  it('coalesces a fast burst into the final term', async () => {
    // Case 2. R → Ro → Rod inside one window becomes ONE term, not three.
    const { result, rerender } = await renderHook(
      ({ value }: { value: string }) => useDebouncedValue(value, 250),
      { initialProps: { value: '' } },
    );

    for (const value of ['R', 'Ro', 'Rod']) {
      await rerender({ value });
      await act(async () => { jest.advanceTimersByTime(50); });
      // Still the old term: none of the intermediate letters became a search.
      expect(result.current).toBe('');
    }

    await act(async () => { jest.advanceTimersByTime(250); });
    expect(result.current).toBe('Rod');
  });

  it('gives two settled terms for two real pauses', async () => {
    // Case 3. Two intentions deserve two searches. This is the case that makes
    // "one request per search" false, and it is correct behaviour.
    const { result, rerender } = await renderHook(
      ({ value }: { value: string }) => useDebouncedValue(value, 250),
      { initialProps: { value: '' } },
    );

    await rerender({ value: 'Rod' });
    await act(async () => { jest.advanceTimersByTime(250); });
    expect(result.current).toBe('Rod');

    await rerender({ value: 'Rodrigo' });
    await act(async () => { jest.advanceTimersByTime(250); });
    expect(result.current).toBe('Rodrigo');
  });

  it('restores the full list at once when the field is cleared', async () => {
    // Case 4. The screen's rule, applied to the pair. Clearing means "show me
    // everybody again" and must not wait for a timer.
    const { result, rerender } = await renderHook(
      ({ value }: { value: string }) => useDebouncedValue(value, 250),
      { initialProps: { value: '' } },
    );

    await rerender({ value: 'Rodrigo' });
    await act(async () => { jest.advanceTimersByTime(250); });
    expect(searchTerm('Rodrigo', result.current)).toBe('Rodrigo');

    // Cleared. The debounced value still says «Rodrigo» for a moment…
    await rerender({ value: '' });
    // …and the screen already asks for the full list anyway.
    expect(searchTerm('', result.current)).toBe('');

    // And once the timer lands, both agree — no second query, same key.
    await act(async () => { jest.advanceTimersByTime(250); });
    expect(searchTerm('', result.current)).toBe('');
    expect(result.current).toBe('');
  });

  it('respects the delay it is given', async () => {
    const { result, rerender } = await renderHook(
      ({ value }: { value: string }) => useDebouncedValue(value, 1000),
      { initialProps: { value: 'a' } },
    );

    await rerender({ value: 'b' });
    await act(async () => { jest.advanceTimersByTime(999); });
    expect(result.current).toBe('a');

    await act(async () => { jest.advanceTimersByTime(1); });
    expect(result.current).toBe('b');
  });

  // LAST in this describe, deliberately: it unmounts the hook, and the shared
  // renderer state that leaves behind made whatever ran next read `null`.
  // ── Case 5, and why it is NOT a test ──────────────────────────────────────
  //
  // "Unmounting with a timer pending must not set state" has no honest
  // assertion in React 19. Three were tried and all three were theatre:
  //
  //   · watching `console.error` for a setState-after-unmount warning — React
  //     18 removed that warning, so deleting the cleanup left the test green;
  //   · counting timers — React and the test renderer keep several of their
  //     own and `rerender` adds more, so neither the count nor the delta
  //     belongs to this hook;
  //   · spying on `clearTimeout` — under fake timers the id the effect clears
  //     is not the one a spy on `global` observes.
  //
  // The reason none of them worked is worth stating: in React 19 a setState on
  // an unmounted component is a silent no-op, so omitting the cleanup is not
  // observable from outside. `clearTimeout` stays in the hook because leaving a
  // timer armed is still waste, not because a test can catch its absence.
  //
  // A test that cannot fail for the right reason is worse than no test: it
  // reports coverage of a guarantee nobody is actually holding.
});

describe('the intake screen states the rule it actually keeps', () => {
  type FS = { readFileSync(p: string, e: 'utf8'): string };
  const fs = jest.requireActual('fs') as FS;
  const SCREEN = 'src/app/internal/service/orders/new.tsx';

  /** The file with its comments removed — the prose explains what the code
   *  must NOT do, so a guard that reads it fires on the explanation. */
  function code(path: string): string {
    return fs
      .readFileSync(path, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .map((line) => {
        const t = line.trim();
        if (t.startsWith('//') || t.startsWith('*')) return '';
        return line.replace(/(^|[^:])\/\/.*$/, '$1');
      })
      .join('\n');
  }

  it('debounces explicitly rather than relying on deferred rendering', () => {
    const source = code(SCREEN);
    expect(source).toMatch(/useDebouncedValue\(typed, CUSTOMER_SEARCH_DEBOUNCE_MS\)/);
    // In the CODE. The comment above it legitimately names `useDeferredValue`
    // to explain why it was replaced.
    expect(source).not.toMatch(/useDeferredValue/);
  });

  it('lets an empty box skip the wait', () => {
    const source = code(SCREEN);
    expect(source).toMatch(/typed === ''\s*\?\s*''\s*:\s*debouncedSearch/);
  });

  it('claims no guarantee it cannot keep', () => {
    // Deliberately reads the RAW file, comments included: this one is about
    // what the prose promises, and an overclaim lives in a comment by
    // definition. It is the assertion that would have caught the original.
    const source = fs.readFileSync(SCREEN, 'utf8');
    expect(source).not.toMatch(/ONE REQUEST PER SEARCH/i);
    expect(source).not.toMatch(/exactly one (HTTP )?request/i);
    expect(source).not.toMatch(/not one per keystroke/i);
  });

  it('keeps the AbortSignal path, which is a different guarantee', () => {
    // Debounce stops a search from STARTING; the signal cancels one already in
    // flight. Neither replaces the other.
    const hook = fs.readFileSync('src/hooks/use-internal-service.ts', 'utf8');
    const at = hook.indexOf('useServiceCustomerSearch');
    expect(hook.slice(at, at + 400)).toMatch(/queryFn:\s*\(\{ signal \}\)/);
  });
});
