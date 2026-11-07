// Colors travel through the API as hex strings and are parsed only to blend.

export type RGB = [r: number, g: number, b: number];

const cache = new Map<string, RGB>();

export function parseColor(hex: string | null | undefined): RGB | null {
  if (hex == null || hex === 'none') return null;
  let c = cache.get(hex);
  if (c) return c;
  // #rgb, #rgba, #rrggbb or #rrggbbaa (alpha is ignored); anything else is not a colour this can mix.
  if (!/^#?(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(hex)) return null;
  let h = hex.replace('#', '');
  if (h.length <= 4) h = h.slice(0, 3).split('').map((ch) => ch + ch).join('');
  c = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  cache.set(hex, c);
  return c;
}

/** Whether `s` is a hex colour: #rgb or #rrggbb, and with `alpha` #rgba or #rrggbbaa too. */
export function isHex(s: unknown, { alpha = false }: { alpha?: boolean } = {}): s is string {
  return typeof s === 'string' && (alpha ? /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i : /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i).test(s);
}

/**
 * WCAG relative luminance, 0 for black to 1 for white, of a colour parseColor reads (alpha
 * ignored) or of channels 0 to 255. Linearised with sRGB's 0.04045 threshold; WCAG 2's 0.03928
 * gives the same values for 8-bit channels.
 */
export function luminance(color: string | Readonly<RGB>): number {
  const c = typeof color === 'string' ? parseColor(color) : color;
  if (!c) throw new TypeError(`luminance(): ${JSON.stringify(color)} is not a colour; give #rgb, #rrggbb or a colour name`);
  const lin = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
}
/** WCAG contrast ratio of two colours, from 1 to 21, whichever is lighter. */
export function contrastRatio(a: string | Readonly<RGB>, b: string | Readonly<RGB>): number {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const hex2 = (n: number): string => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');

export function toHex(rgb: Readonly<RGB>): string {
  return '#' + hex2(rgb[0]) + hex2(rgb[1]) + hex2(rgb[2]);
}

/** The colour `t` of the way from `a` to `b` in sRGB, as `#rrggbb` (Manim's `interpolate_color`); an unparseable end is taken whole. */
export function lerpColor(a: string, b: string, t: number): string {
  if (a === b) return a;
  const ca = parseColor(a), cb = parseColor(b);
  if (!ca) return t < 0.5 ? a : b;
  if (!cb) return t < 0.5 ? a : b;
  return toHex([ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t]);
}

/**
 * The colours a scene's engine defaults take. A part built without a colour (a `Text` with no
 * `color`, an `Axes` with no `stroke`, a `SurroundingRectangle`, a `Circumscribe`) takes one of
 * these by role when it first enters the scene: `ink` for text and lines, `soft` for guides and
 * secondary labels, `emphasis` for emphasis and plotted data, `bad` for a `Cross`, and `paper` for the
 * background an SVG sink draws. A stage sets them from its palette; a scene without one keeps
 * `NEUTRAL_COLORS`, dark ink on white paper.
 */
export interface SceneColors {
  paper: string;
  ink: string;
  soft: string;
  emphasis: string;
  bad: string;
}
/** A role an engine default takes from the scene's colours. */
export type ColorRole = Exclude<keyof SceneColors, 'paper'>;
/**
 * The colours of a scene without a stage: dark ink on white paper. Each role has its own value, so a
 * style field still holding one is known to be the default (see `Mobject.defaultColors`).
 */
export const NEUTRAL_COLORS: Readonly<SceneColors> = Object.freeze({
  paper: '#ffffff',
  ink: '#1f2328',
  soft: '#59636e',
  emphasis: '#0969da',
  bad: '#cf222e',
});

/**
 * A named style's colours, as Agentic Mermaid styles name them: the input a stage or a diagram is
 * styled from (`palette(name)`, a stage's `palette` option, a diagram snapshot's palette). `accent`
 * is the style's own accent and `muted` its faint colour; what a scene draws with is the stage's
 * look (`s.look`), which derives from these the colours that read on the paper.
 */
export interface Palette {
  paper: string;
  ink: string;
  accent: string;
  muted: string;
}
