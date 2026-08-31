import { buildTheme, colorSchemes, spacing, sizes } from '@/theme';
import { elevation } from '@/theme/shadows';

/**
 * These are contract tests for the token layer, not snapshots. They pin down
 * the invariants the rest of the design system quietly relies on.
 */
describe('theme tokens', () => {
  it('defines the same colour keys in light and dark', () => {
    // A key present in one scheme and missing in the other is invisible until
    // someone switches themes and gets `undefined` as a colour.
    expect(Object.keys(colorSchemes.light).sort()).toEqual(Object.keys(colorSchemes.dark).sort());
  });

  it('never returns undefined for a declared colour token', () => {
    for (const scheme of ['light', 'dark'] as const) {
      for (const [key, value] of Object.entries(colorSchemes[scheme])) {
        // The key is included in the assertion so a failure names the token.
        expect(`${scheme}.${key}=${value}`).not.toMatch(/=(undefined|null|)$/);
      }
    }
  });

  it('keeps the minimum touch target at the 44pt HIG floor', () => {
    expect(sizes.minTouchTarget).toBeGreaterThanOrEqual(44);
    // Compact controls must still be tappable.
    expect(sizes.controlCompact).toBeGreaterThanOrEqual(sizes.minTouchTarget - 4);
  });

  it('exposes a strictly ascending spacing scale', () => {
    const values = Object.values(spacing);
    for (let index = 1; index < values.length; index += 1) {
      const previous = values[index - 1]!;
      expect(values[index]!).toBeGreaterThan(previous);
    }
  });

  it('memoises the resolved theme so style memos stay stable', () => {
    expect(buildTheme('light')).toBe(buildTheme('light'));
    expect(buildTheme('light')).not.toBe(buildTheme('dark'));
  });

  it('drops shadows in dark mode, where depth comes from the surface ramp', () => {
    expect(elevation('card', 'dark')).toEqual({});
    expect(Object.keys(elevation('card', 'light')).length).toBeGreaterThan(0);
  });
});
