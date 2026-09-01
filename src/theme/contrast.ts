/**
 * Colour maths, so accessibility is a computation and not a hope.
 *
 * WHY THIS FILE EXISTS. From UI7 the accent colour can come from a TENANT — a
 * value typed into a settings form by someone who is not a designer and does
 * not owe us a contrast audit. `#FFEE00` is a perfectly reasonable brand colour
 * and a completely illegible one as text on white (1.2:1).
 *
 * The design system's answer is not to refuse the colour. It is to keep the
 * tenant's identity where identity belongs — fills, marks, emphasis — and to
 * DERIVE the text-safe variant, checked against WCAG, rather than assume it.
 *
 * Everything here is pure and synchronous: it runs while building a theme.
 */

export type Rgb = { r: number; g: number; b: number; a: number };

/** WCAG 2.1 AA for body text. */
export const AA_NORMAL = 4.5;
/** WCAG 2.1 AA for large text (≥18.66px bold or ≥24px) and for UI components. */
export const AA_LARGE = 3;

const HEX_SHORT = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const HEX_LONG = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/i;
const RGB_FN = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/i;

/**
 * Parse a CSS-ish colour, or return null.
 *
 * Null is a real answer, not a failure to handle: a tenant can save anything at
 * all in a colour field, and the caller's job is to fall back to the neutral
 * platform token rather than to render `NaN`.
 */
export function parseColor(value: string | null | undefined): Rgb | null {
  if (!value) return null;
  const input = value.trim();

  const short = HEX_SHORT.exec(input);
  if (short) {
    return {
      r: parseInt(short[1]! + short[1]!, 16),
      g: parseInt(short[2]! + short[2]!, 16),
      b: parseInt(short[3]! + short[3]!, 16),
      a: 1,
    };
  }

  const long = HEX_LONG.exec(input);
  if (long) {
    return {
      r: parseInt(long[1]!, 16),
      g: parseInt(long[2]!, 16),
      b: parseInt(long[3]!, 16),
      a: long[4] === undefined ? 1 : parseInt(long[4], 16) / 255,
    };
  }

  const fn = RGB_FN.exec(input);
  if (fn) {
    const channel = (raw: string) => clamp(Math.round(Number(raw)), 0, 255);
    const alpha = fn[4] === undefined ? 1 : clamp(Number(fn[4]), 0, 1);
    if ([fn[1], fn[2], fn[3]].some((raw) => !Number.isFinite(Number(raw)))) return null;
    return { r: channel(fn[1]!), g: channel(fn[2]!), b: channel(fn[3]!), a: alpha };
  }

  return null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function toHex(color: Rgb): string {
  const part = (channel: number) =>
    clamp(Math.round(channel), 0, 255).toString(16).padStart(2, '0');
  return `#${part(color.r)}${part(color.g)}${part(color.b)}`;
}

export function toRgba(color: Rgb, alpha = color.a): string {
  const part = (channel: number) => clamp(Math.round(channel), 0, 255);
  return `rgba(${part(color.r)}, ${part(color.g)}, ${part(color.b)}, ${clamp(alpha, 0, 1)})`;
}

/**
 * Flatten a translucent colour onto an opaque one.
 *
 * Contrast is a property of what the EYE receives, so a 20% overlay has to be
 * composited before it can be measured. Skipping this is how a "checked"
 * palette still ships an unreadable label.
 */
export function composite(foreground: Rgb, background: Rgb): Rgb {
  const alpha = clamp(foreground.a, 0, 1);
  return {
    r: foreground.r * alpha + background.r * (1 - alpha),
    g: foreground.g * alpha + background.g * (1 - alpha),
    b: foreground.b * alpha + background.b * (1 - alpha),
    a: 1,
  };
}

/** Linear interpolation between two colours. `weight` is how much of `b`. */
export function mix(a: Rgb, b: Rgb, weight: number): Rgb {
  const w = clamp(weight, 0, 1);
  return {
    r: a.r + (b.r - a.r) * w,
    g: a.g + (b.g - a.g) * w,
    b: a.b + (b.b - a.b) * w,
    a: a.a + (b.a - a.a) * w,
  };
}

/** WCAG relative luminance. */
export function relativeLuminance(color: Rgb): number {
  const channel = (raw: number) => {
    const c = clamp(raw, 0, 255) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}

/**
 * WCAG contrast ratio, 1 to 21.
 *
 * Both colours are composited onto `over` first when they are translucent, so
 * the number describes what is actually on screen.
 */
export function contrastRatio(foreground: Rgb, background: Rgb, over?: Rgb): number {
  const base = over ? composite(background, over) : background;
  const opaqueBackground = base.a < 1 && over ? composite(base, over) : base;
  const opaqueForeground =
    foreground.a < 1 ? composite(foreground, opaqueBackground) : foreground;

  const l1 = relativeLuminance(opaqueForeground);
  const l2 = relativeLuminance(opaqueBackground);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Darken or lighten a colour until it clears `minimum` against `background`.
 *
 * Walks toward black or white — whichever direction the background is not — in
 * small steps, and returns the first shade that passes. If nothing passes (a
 * mid-grey background is genuinely hard), it returns the best it found: a
 * slightly-too-low ratio is still far better than the original, and returning
 * null here would just push the same problem to every call site.
 *
 * Hue is preserved as far as the walk allows, because the point is to keep the
 * tenant's colour recognisable, not to replace it with black.
 */
export function ensureContrast(
  color: Rgb,
  background: Rgb,
  minimum: number = AA_NORMAL,
): Rgb {
  const target: Rgb =
    relativeLuminance(background) > 0.4
      ? { r: 0, g: 0, b: 0, a: 1 }
      : { r: 255, g: 255, b: 255, a: 1 };

  let best = color;
  let bestRatio = contrastRatio(color, background);
  if (bestRatio >= minimum) return color;

  for (let step = 1; step <= 20; step += 1) {
    const candidate = mix(color, target, step / 20);
    const ratio = contrastRatio(candidate, background);
    if (ratio > bestRatio) {
      best = candidate;
      bestRatio = ratio;
    }
    if (ratio >= minimum) return candidate;
  }
  return best;
}

/**
 * Which of two foregrounds to draw ON TOP of `background`.
 *
 * Used for the label inside a tenant-coloured button: a yellow fill needs ink,
 * a navy fill needs white, and nobody should be writing that condition by hand
 * in a component.
 */
export function readableOn(background: Rgb, light: Rgb, dark: Rgb): Rgb {
  return contrastRatio(light, background) >= contrastRatio(dark, background) ? light : dark;
}
