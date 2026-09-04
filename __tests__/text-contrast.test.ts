import { colorSchemes, type ColorSchemeName, type ColorTokens } from '@/theme/colors';
import { AA_NORMAL, contrastRatio, mix, parseColor } from '@/theme/contrast';

type FS = { readFileSync(p: string, e: 'utf8'): string };

/**
 * Every step of the text scale is readable on every surface it is painted on.
 *
 * WHAT THIS REPLACES. `textTertiary` measured 2.78:1 on the worst light surface
 * and 3.58:1 on the worst dark one, against the 4.5:1 this project already ships
 * as `AA_NORMAL`. It failed on ALL SIX light surfaces and on five of six dark
 * ones — and it is the token carrying dates, counts, identifiers and helper
 * copy in roughly 150 places. Nothing caught it, because the only contrast
 * tests the project had guarded the colour a TENANT supplies. The colour the
 * app ships itself was unguarded.
 *
 * WHY AT THE THEME BOUNDARY. This is one guarantee about two token values, not
 * a hundred and fifty guarantees about call sites. A screen that draws
 * `textTertiary` on a surface listed here is covered by construction; a screen
 * that invents its own grey was never covered by a per-screen test either.
 */

const SURFACES = [
  'background',
  'backgroundElevated',
  'surface',
  'surfaceElevated',
  'surfacePressed',
  'surfaceSubtle',
] as const satisfies readonly (keyof ColorTokens)[];

const TEXT = ['textPrimary', 'textSecondary', 'textTertiary'] as const;

const SCHEMES: ColorSchemeName[] = ['light', 'dark'];

function ratio(scheme: ColorSchemeName, fg: keyof ColorTokens, bg: keyof ColorTokens): number {
  const palette = colorSchemes[scheme];
  return contrastRatio(
    parseColor(palette[fg] as string)!,
    parseColor(palette[bg] as string)!,
  );
}

describe('the text scale clears AA on every surface', () => {
  const cases = SCHEMES.flatMap((scheme) =>
    TEXT.flatMap((fg) => SURFACES.map((bg) => [scheme, fg, bg] as const)),
  );

  it.each(cases)('%s: %s on %s', (scheme, fg, bg) => {
    // `surfacePressed` is in here deliberately. A card keeps its metadata while
    // a finger is on it, and that is the darkest light surface and the lightest
    // dark one — the worst case for both themes, and the one that was missed.
    expect(ratio(scheme, fg, bg)).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});

describe('the glass fallback is a surface like any other', () => {
  // `GlassSurface` is written fallback-first — its own docstring calls the
  // frosted version "the branch, not the base" — and one of its opaque
  // fallbacks is not a plain token but a blend sitting between `surface` and
  // `surfaceElevated`. Measured rather than argued: a value between two passing
  // surfaces ought to pass, and "ought to" is not a guarantee.
  //
  // What is NOT claimed here is contrast against whatever is behind a real
  // blur. A photograph under frosted glass cannot be promised anything; the
  // opaque fallback is the surface the app can actually be held to.
  it.each(SCHEMES)('%s: tertiary clears AA on the blended sheet fallback', (scheme) => {
    const palette = colorSchemes[scheme];
    const blended = mix(
      parseColor(palette.surfaceElevated)!,
      parseColor(palette.surface)!,
      scheme === 'dark' ? 0.2 : 0.1,
    );

    expect(
      contrastRatio(parseColor(palette.textTertiary)!, blended),
    ).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});

describe('the scale is still a hierarchy', () => {
  // Fixing contrast must not flatten three steps into one. A tertiary that
  // reads exactly like a secondary is a different bug, not a fix.
  it.each(SCHEMES)('%s: primary is the strongest, tertiary the quietest', (scheme) => {
    const primary = ratio(scheme, 'textPrimary', 'surface');
    const secondary = ratio(scheme, 'textSecondary', 'surface');
    const tertiary = ratio(scheme, 'textTertiary', 'surface');

    expect(primary).toBeGreaterThan(secondary);
    expect(secondary).toBeGreaterThan(tertiary);
  });

  it.each(SCHEMES)('%s: the three are distinct colours, not near-duplicates', (scheme) => {
    const palette = colorSchemes[scheme];
    const values = TEXT.map((key) => palette[key] as string);
    expect(new Set(values).size).toBe(TEXT.length);
  });
});

describe('legibility is the app\'s own, not the tenant\'s', () => {
  it('leaves the text scale out of what a tenant can repaint', () => {
    // `applyTenantAccent` composes `{ ...base, accent, accentText,
    // accentSurface, textOnAccent }` — four tokens. A tenant that could reach
    // the text scale could make its own store unreadable, and no amount of
    // measuring here would help.
    const source = (jest.requireActual('fs') as FS).readFileSync(
      'src/theme/tenant-accent.ts',
      'utf8',
    );

    expect(source).not.toMatch(/textTertiary/);
    expect(source).not.toMatch(/textSecondary/);
    expect(source).not.toMatch(/textPrimary/);
  });
});
