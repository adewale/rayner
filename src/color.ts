// Colors travel through the API as hex strings and are parsed only to blend.

type RGB = [r: number, g: number, b: number];

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
 * secondary labels, `accent` for emphasis and plotted data, `bad` for a `Cross`, and `paper` for the
 * background an SVG sink draws. A stage sets them from its palette; a scene without one keeps
 * `NEUTRAL_COLORS`, dark ink on white paper.
 */
export interface SceneColors {
  paper: string;
  ink: string;
  soft: string;
  accent: string;
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
  accent: '#0969da',
  bad: '#cf222e',
});
