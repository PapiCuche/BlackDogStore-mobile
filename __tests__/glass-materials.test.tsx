import { Platform, View } from 'react-native';

import { GlassSurface } from '@/design-system';
import {
  buildMaterials,
  buildTheme,
  contrastRatio,
  parseColor,
  supportsBlurMaterials,
  type ColorSchemeName,
  type MaterialKey,
} from '@/theme';

import { renderWithProviders } from './support/render';

/**
 * UI7 — the material layer.
 *
 * The claim these tests defend is not "it looks like glass". It is that the
 * app looks FINISHED when the glass is switched off, because three ordinary
 * situations switch it off: Android, "Reduce Transparency", and any surface
 * that repeats in a list.
 */

const SCHEMES: ColorSchemeName[] = ['light', 'dark'];
const KEYS: MaterialKey[] = ['chrome', 'card', 'raised', 'overlay'];

// `mock`-prefixed so Jest's hoisted factory may close over it.
const mockReducedTransparency = jest.fn(() => false);
jest.mock('@/hooks/use-reduced-transparency', () => ({
  useReducedTransparency: () => mockReducedTransparency(),
}));

beforeEach(() => {
  mockReducedTransparency.mockReturnValue(false);
});

describe('every material can stand without the blur', () => {
  it.each(KEYS)('%s carries an OPAQUE fallback in both schemes', (key) => {
    for (const scheme of SCHEMES) {
      const theme = buildTheme(scheme);
      const material = theme.materials[key];
      const fallback = parseColor(material.fallbackColor);

      expect(fallback).not.toBeNull();
      // Opaque, not "mostly opaque": a translucent bar with nothing blurred
      // behind it is simply an unreadable bar.
      expect(fallback!.a).toBe(1);
    }
  });

  it.each(KEYS)('%s keeps body text legible on its fallback', (key) => {
    for (const scheme of SCHEMES) {
      const theme = buildTheme(scheme);
      const text = parseColor(theme.colors.textPrimary)!;
      const fill = parseColor(theme.materials[key].fallbackColor)!;

      expect(contrastRatio(text, fill)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(KEYS)('%s has an edge, or it dissolves into the page', (key) => {
    for (const scheme of SCHEMES) {
      const material = buildTheme(scheme).materials[key];

      expect(parseColor(material.borderColor)).not.toBeNull();
      expect(parseColor(material.highlightColor)).not.toBeNull();
    }
  });

  it('declares a blur intensity inside the range expo-blur accepts', () => {
    for (const scheme of SCHEMES) {
      for (const key of KEYS) {
        const { intensity } = buildTheme(scheme).materials[key];
        expect(intensity).toBeGreaterThanOrEqual(1);
        expect(intensity).toBeLessThanOrEqual(100);
      }
    }
  });

  it('matches the blur tint to the scheme', () => {
    expect(buildTheme('dark').materials.card.blurTint).toBe('dark');
    expect(buildTheme('light').materials.card.blurTint).toBe('light');
  });
});

describe('materials follow the tenant, without a second palette', () => {
  it('rebuilds from whatever colour tokens it is given', () => {
    // Not a parallel set of hexes to keep in sync: one token source, two
    // presentations of it.
    const tinted = buildTheme('light', '#1A4E8A');
    const plain = buildTheme('light');

    expect(buildMaterials(tinted.colors, 'light').card.fallbackColor).toBe(
      plain.materials.card.fallbackColor,
    );
  });

  it('never tints a material with the brand colour', () => {
    // Panes are made of the page, not of the tenant. A brand-tinted card is a
    // brand-tinted everything, and the accent stops meaning anything.
    const theme = buildTheme('dark', '#D4AF37');

    for (const key of KEYS) {
      expect(JSON.stringify(theme.materials[key]).toLowerCase()).not.toContain('212, 175, 55');
      expect(JSON.stringify(theme.materials[key]).toLowerCase()).not.toContain('d4af37');
    }
  });
});

describe('GlassSurface decides once, for everyone', () => {
  it('renders the opaque material when transparency is reduced', async () => {
    // Someone who turned this on is telling the OS that translucency costs
    // them legibility. That is not a style preference to override.
    mockReducedTransparency.mockReturnValue(true);

    const { getByTestId } = await renderWithProviders(
      <GlassSurface material="chrome" testID="pane">
        <View />
      </GlassSurface>,
    );

    const style = getByTestId('pane').props.style;
    expect(JSON.stringify(style)).toContain(buildTheme('light').materials.chrome.fallbackColor);
  });

  it('renders the opaque material for anything that repeats', async () => {
    const { getByTestId } = await renderWithProviders(
      <GlassSurface material="card" solid testID="row">
        <View />
      </GlassSurface>,
    );

    expect(JSON.stringify(getByTestId('row').props.style)).toContain(
      buildTheme('light').materials.card.fallbackColor,
    );
  });

  it('gates the frosted path on the platform, not on a guess', () => {
    // Android reaches efficient blur only through SDK 31+ RenderNode plus a
    // `BlurTargetView` behind every pane. That is an architectural change to
    // every screen for an effect Material Design does not ask for.
    expect(supportsBlurMaterials).toBe(Platform.OS === 'ios');
  });

  it('renders its children either way', async () => {
    for (const reduced of [true, false]) {
      mockReducedTransparency.mockReturnValue(reduced);
      const { getByTestId } = await renderWithProviders(
        <GlassSurface>
          <View testID="content" />
        </GlassSurface>,
      );
      expect(getByTestId('content')).toBeTruthy();
    }
  });

  it('clips to its radius, which both platforms need for a rounded pane', async () => {
    const { getByTestId } = await renderWithProviders(
      <GlassSurface radius={20} testID="pane">
        <View />
      </GlassSurface>,
    );

    const style = JSON.stringify(getByTestId('pane').props.style);
    expect(style).toContain('"borderRadius":20');
    expect(style).toContain('hidden');
  });

  it('can drop its border for full-bleed chrome', async () => {
    const { getByTestId } = await renderWithProviders(
      <GlassSurface bordered={false} testID="pane">
        <View />
      </GlassSurface>,
    );

    expect(JSON.stringify(getByTestId('pane').props.style)).toContain('"borderWidth":0');
  });
});

describe('the primitive is the only place that knows about blur', () => {
  type FileSystem = {
    readFileSync(path: string, encoding: 'utf8'): string;
    readdirSync(path: string): string[];
    statSync(path: string): { isDirectory(): boolean };
  };
  type PathModule = { join(...parts: string[]): string };

  const fs = jest.requireActual('fs') as FileSystem;
  const nodePath = jest.requireActual('path') as PathModule;

  function sourceFiles(dir: string): string[] {
    return fs.readdirSync(dir).flatMap((entry: string) => {
      const full = nodePath.join(dir, entry);
      if (fs.statSync(full).isDirectory()) return sourceFiles(full);
      return /\.tsx?$/.test(entry) ? [full] : [];
    });
  }

  it('is the only module that imports expo-blur', () => {
    // Otherwise "turn the blur off" becomes an audit of thirty files instead
    // of one prop.
    const offenders = [...sourceFiles('src')].filter(
      (file) =>
        /from 'expo-blur'/.test(fs.readFileSync(file, 'utf8')) &&
        !file.endsWith('glass-surface.tsx'),
    );

    expect(offenders).toEqual([]);
  });
});
