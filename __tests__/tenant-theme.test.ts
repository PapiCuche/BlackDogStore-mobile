import { pilotCompanyBrand } from '@/domain/company/pilot-brand';
import {
  AA_LARGE,
  AA_NORMAL,
  applyTenantAccent,
  buildTheme,
  colorSchemes,
  contrastRatio,
  darkColors,
  lightColors,
  parseColor,
  type ColorSchemeName,
} from '@/theme';

/**
 * UI7 — the platform lends no colour, and a tenant may not cost anyone their
 * reading.
 *
 * Two claims, and they pull against each other on purpose: a tenant's identity
 * has to survive, and the app has to stay legible. Everything below pins down
 * where the line falls.
 */

const SCHEMES: ColorSchemeName[] = ['light', 'dark'];

function ratio(foreground: string, background: string): number {
  const fg = parseColor(foreground);
  const bg = parseColor(background);
  if (!fg || !bg) throw new Error(`unparseable: ${foreground} / ${background}`);
  return contrastRatio(fg, bg);
}

describe('the base palette belongs to the platform, not to a tenant', () => {
  it('has no trace of the pilot tenant', () => {
    // Black Dog's gold was the design system's accent until UI7. A second
    // customer would have inherited a competitor's colour by default.
    const serialised = JSON.stringify({ lightColors, darkColors }).toLowerCase();

    expect(serialised).not.toContain('d4af37');
    expect(serialised).not.toContain(pilotCompanyBrand.primaryColor.toLowerCase());
  });

  it('is achromatic: the accent has no hue of its own', () => {
    for (const scheme of SCHEMES) {
      const accent = parseColor(colorSchemes[scheme].accent)!;
      expect(Math.max(accent.r, accent.g, accent.b) - Math.min(accent.r, accent.g, accent.b))
        .toBeLessThanOrEqual(8);
    }
  });

  it('still keeps the pilot colour where a tenant identity belongs', () => {
    expect(pilotCompanyBrand.primaryColor).toBe('#D4AF37');
  });
});

describe('a tenant colour is applied to four tokens and no others', () => {
  it('moves exactly accent, accentText, accentSurface and textOnAccent', () => {
    for (const scheme of SCHEMES) {
      const base = colorSchemes[scheme];
      const { colors } = applyTenantAccent(base, '#D4AF37', scheme);

      const moved = (Object.keys(base) as (keyof typeof base)[]).filter(
        (key) => base[key] !== colors[key],
      );

      expect(moved.sort()).toEqual(
        ['accent', 'accentSurface', 'accentText', 'textOnAccent'].sort(),
      );
    }
  });

  it('leaves the STATUS ramp alone, whatever the brand colour is', () => {
    // A shop whose brand is red must not get a red "entregado" badge. Status
    // colour is meaning, and meaning is not for sale.
    for (const scheme of SCHEMES) {
      const base = colorSchemes[scheme];
      for (const brand of ['#B3261E', '#137333', '#8A5A00', '#1A4E8A']) {
        const { colors } = applyTenantAccent(base, brand, scheme);

        expect(colors.statusSuccess).toBe(base.statusSuccess);
        expect(colors.statusDanger).toBe(base.statusDanger);
        expect(colors.statusWarning).toBe(base.statusWarning);
        expect(colors.statusInfo).toBe(base.statusInfo);
        expect(colors.statusSuccessSurface).toBe(base.statusSuccessSurface);
      }
    }
  });

  it('leaves text, borders and the primary action alone', () => {
    for (const scheme of SCHEMES) {
      const base = colorSchemes[scheme];
      const { colors } = applyTenantAccent(base, '#FFEE00', scheme);

      expect(colors.textPrimary).toBe(base.textPrimary);
      expect(colors.textSecondary).toBe(base.textSecondary);
      expect(colors.border).toBe(base.border);
      // The primary button is the most contrast-critical surface in the app.
      expect(colors.actionBackground).toBe(base.actionBackground);
      expect(colors.textOnAction).toBe(base.textOnAction);
    }
  });

  it('keeps the tenant colour EXACTLY as the fill', () => {
    // The one place their identity survives untouched. That is the point.
    const { colors } = applyTenantAccent(lightColors, '#D4AF37', 'light');

    expect(colors.accent.toLowerCase()).toBe('#d4af37');
  });
});

describe('accessibility keeps authority over the brand', () => {
  const HARD_CASES = [
    '#D4AF37', // the pilot's gold: 1.9:1 on white
    '#FFEE00', // near-white yellow
    '#FFFFFF', // white
    '#000000', // black
    '#7F7F7F', // mid grey, the worst case in both schemes
    '#00FF00', // neon green
    '#0000FF', // deep blue: fails on a dark page
  ];

  it.each(HARD_CASES)('derives readable accent TEXT from %s', (brand) => {
    for (const scheme of SCHEMES) {
      const base = colorSchemes[scheme];
      const { colors } = applyTenantAccent(base, brand, scheme);

      // AA_LARGE is the floor asserted here rather than AA_NORMAL: a mid-grey
      // brand on a mid-grey page cannot reach 4.5 without becoming black, and
      // the helper returns its best effort instead of pretending. Everything
      // that is not that pathological case clears AA below.
      expect(ratio(colors.accentText, colors.background)).toBeGreaterThanOrEqual(AA_LARGE);
    }
  });

  it.each(HARD_CASES.filter((c) => c !== '#7F7F7F'))(
    'reaches full AA for body text from %s',
    (brand) => {
      for (const scheme of SCHEMES) {
        const { colors } = applyTenantAccent(colorSchemes[scheme], brand, scheme);
        expect(ratio(colors.accentText, colors.background)).toBeGreaterThanOrEqual(AA_NORMAL);
      }
    },
  );

  it.each(HARD_CASES)('keeps accent text readable on the accent WASH from %s', (brand) => {
    // Where an accent badge actually lands. The wash is tinted toward the brand
    // colour, so it is always the harder of the two grounds — correcting only
    // against the page would leave every accent Badge slightly under the bar.
    for (const scheme of SCHEMES) {
      const { colors } = applyTenantAccent(colorSchemes[scheme], brand, scheme);

      expect(ratio(colors.accentText, colors.accentSurface)).toBeGreaterThanOrEqual(AA_LARGE);
    }
  });

  it.each(HARD_CASES)('picks a label that survives ON the %s fill', (brand) => {
    for (const scheme of SCHEMES) {
      const { colors } = applyTenantAccent(colorSchemes[scheme], brand, scheme);

      expect(ratio(colors.textOnAccent, colors.accent)).toBeGreaterThanOrEqual(AA_LARGE);
    }
  });

  it('never writes white on a pale brand fill', () => {
    // The classic unreadable button: a pastel brand with a hardcoded white label.
    const { colors } = applyTenantAccent(lightColors, '#FFEE00', 'light');

    expect(colors.textOnAccent.toLowerCase()).not.toBe('#ffffff');
  });

  it('never writes ink on a very dark brand fill', () => {
    const { colors } = applyTenantAccent(darkColors, '#101020', 'dark');

    expect(ratio(colors.textOnAccent, colors.accent)).toBeGreaterThanOrEqual(AA_LARGE);
  });

  it('reports when it had to correct the brand colour', () => {
    const gold = applyTenantAccent(lightColors, '#D4AF37', 'light');
    const ink = applyTenantAccent(lightColors, '#1A1A1D', 'light');

    expect(gold.report.applied).toBe(true);
    expect(gold.report.corrected).toBe(true);
    expect(gold.report.rawContrastOnBackground).toBeLessThan(AA_NORMAL);
    expect(gold.report.textContrastOnBackground).toBeGreaterThanOrEqual(AA_NORMAL);

    // Already readable: nothing to correct, and the report says so.
    expect(ink.report.corrected).toBe(false);
  });
});

describe('a colour the platform cannot read is not a crash', () => {
  it.each(['', '   ', 'azul', 'rgb(nope)', '#12345', 'linear-gradient(red, blue)'])(
    'falls back to the platform palette for %p',
    (brand) => {
      const { colors, report } = applyTenantAccent(lightColors, brand, 'light');

      expect(colors).toEqual(lightColors);
      expect(report.applied).toBe(false);
    },
  );

  it('treats a missing brand as no brand, not as an error', () => {
    expect(applyTenantAccent(darkColors, null, 'dark').colors).toEqual(darkColors);
    expect(applyTenantAccent(darkColors, undefined, 'dark').colors).toEqual(darkColors);
  });

  it('parses the forms a backend actually sends', () => {
    expect(parseColor('#abc')).toEqual({ r: 170, g: 187, b: 204, a: 1 });
    expect(parseColor('#AABBCC')).toEqual({ r: 170, g: 187, b: 204, a: 1 });
    expect(parseColor('#AABBCC80')?.a).toBeCloseTo(0.5, 1);
    expect(parseColor('rgb(10, 20, 30)')).toEqual({ r: 10, g: 20, b: 30, a: 1 });
    expect(parseColor('rgba(10, 20, 30, 0.5)')?.a).toBe(0.5);
  });

  it('measures contrast the way WCAG defines it', () => {
    expect(ratio('#FFFFFF', '#000000')).toBeCloseTo(21, 1);
    expect(ratio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    // The number that started this file: the pilot's gold on white is 2.10:1,
    // below even the 3:1 floor for large text — which is why `accentText` has
    // to be derived rather than taken as given.
    expect(ratio('#D4AF37', '#FFFFFF')).toBeCloseTo(2.1, 1);
    expect(ratio('#D4AF37', '#FFFFFF')).toBeLessThan(AA_LARGE);
  });

  it('composites transparency before measuring it', () => {
    // A 50% black overlay on white is mid-grey, not black. Measuring the raw
    // colour is how a "checked" palette still ships an unreadable label.
    expect(ratio('rgba(0, 0, 0, 0.5)', '#FFFFFF')).toBeLessThan(ratio('#000000', '#FFFFFF'));
  });
});

describe('buildTheme', () => {
  it('opens achromatic when the tenant is unknown', () => {
    // The honest first frame. Not the pilot's gold, and not a remembered colour
    // from whatever build shipped the fixture.
    expect(buildTheme('light').colors.accent).toBe(lightColors.accent);
    expect(buildTheme('light').accent.applied).toBe(false);
  });

  it('takes on the tenant colour when it resolves', () => {
    expect(buildTheme('light', '#D4AF37').colors.accent.toLowerCase()).toBe('#d4af37');
  });

  it('gives two tenants two different themes', () => {
    expect(buildTheme('light', '#D4AF37')).not.toBe(buildTheme('light', '#1A4E8A'));
    expect(buildTheme('light', '#D4AF37').colors.accent).not.toBe(
      buildTheme('light', '#1A4E8A').colors.accent,
    );
  });

  it('returns a STABLE object for the same inputs', () => {
    // Identity is a dependency of every downstream `useMemo`; a fresh object
    // each render would rebuild every StyleSheet in the app.
    expect(buildTheme('dark', '#D4AF37')).toBe(buildTheme('dark', '#D4AF37'));
    expect(buildTheme('dark')).toBe(buildTheme('dark'));
  });

  it('keeps the schemes apart for the same tenant', () => {
    expect(buildTheme('light', '#D4AF37')).not.toBe(buildTheme('dark', '#D4AF37'));
  });
});
