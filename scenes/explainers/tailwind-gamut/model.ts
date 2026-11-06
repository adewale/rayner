// Which of Tailwind 4's colours a screen can show, by CSS Color 4's own conversion code.
// Pure TypeScript with no Node APIs: the scene runs it in the page.
//
// The palette: tailwindlabs/tailwindcss v4.3.3 (commit c2b24dd15fed1c59dd521bd86082f520c9f5ad0d),
// packages/tailwindcss/theme.css, the 300, 500 and 700 shades of the 17 coloured families (red to rose;
// the nine grey families that follow them in the file are left out). The lines are copied as written.
// Tailwind CSS is MIT licensed:
//
//   MIT License
//
//   Copyright (c) Tailwind Labs, Inc.
//
//   Permission is hereby granted, free of charge, to any person obtaining a copy
//   of this software and associated documentation files (the "Software"), to deal
//   in the Software without restriction, including without limitation the rights
//   to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
//   copies of the Software, and to permit persons to whom the Software is
//   furnished to do so, subject to the following conditions:
//
//   The above copyright notice and this permission notice shall be included in all
//   copies or substantial portions of the Software.
//
//   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
//   IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
//   FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
//   AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
//   LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
//   OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
//   SOFTWARE.
//
// The colour maths: CSS Color 4 (w3c/csswg-drafts commit e1bd39185acd650512f82e1eeb7b94da21b686c7),
// css-color-4/conversions.js, the specification's sample code, with its matrices copied as written:
//   OKLCH_to_OKLab l.456, OKLab_to_XYZ l.422, XYZ_to_OKLab l.401, XYZ_to_lin_sRGB l.62,
//   lin_sRGB_to_XYZ l.50, XYZ_to_lin_P3 l.104, lin_P3_to_XYZ l.91, gam_sRGB l.31, lin_sRGB l.11
//   (Display P3 uses the sRGB transfer function, l.77 and l.84).
// A colour is inside a gamut when every linear-light component is in [0, 1]: "has no components negative,
// or greater than one" (css-color-4/Overview.bs l.6202, the P3-yellow example in §13.1).
// Gamut mapping: "Binary Search Gamut Mapping with Local MINDE", Overview.bs l.6482–6609: hold OKLCh
// lightness and hue, lower chroma by binary search, and return the clipped colour once it is within one
// JND (deltaEOK 0.02, l.6518) of the colour being tried.

export type Space = 'srgb' | 'p3';
export type Shade = '300' | '500' | '700';
export const SHADES: readonly Shade[] = ['300', '500', '700'];
export const FAMILIES = [
  'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan',
  'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
] as const;
export type Family = (typeof FAMILIES)[number];

/** theme.css lines at v4.3.3, by line number. Family i's shade 300 is line 13 + 12i; 500 is +2, 700 is +4. */
export const THEME_LINES: Readonly<Record<number, string>> = {
  13: '  --color-red-300: oklch(80.8% 0.114 19.571);',
  15: '  --color-red-500: oklch(63.7% 0.237 25.331);',
  17: '  --color-red-700: oklch(50.5% 0.213 27.518);',
  25: '  --color-orange-300: oklch(83.7% 0.128 66.29);',
  27: '  --color-orange-500: oklch(70.5% 0.213 47.604);',
  29: '  --color-orange-700: oklch(55.3% 0.195 38.402);',
  37: '  --color-amber-300: oklch(87.9% 0.169 91.605);',
  39: '  --color-amber-500: oklch(76.9% 0.188 70.08);',
  41: '  --color-amber-700: oklch(55.5% 0.163 48.998);',
  49: '  --color-yellow-300: oklch(90.5% 0.182 98.111);',
  51: '  --color-yellow-500: oklch(79.5% 0.184 86.047);',
  53: '  --color-yellow-700: oklch(55.4% 0.135 66.442);',
  61: '  --color-lime-300: oklch(89.7% 0.196 126.665);',
  63: '  --color-lime-500: oklch(76.8% 0.233 130.85);',
  65: '  --color-lime-700: oklch(53.2% 0.157 131.589);',
  73: '  --color-green-300: oklch(87.1% 0.15 154.449);',
  75: '  --color-green-500: oklch(72.3% 0.219 149.579);',
  77: '  --color-green-700: oklch(52.7% 0.154 150.069);',
  85: '  --color-emerald-300: oklch(84.5% 0.143 164.978);',
  87: '  --color-emerald-500: oklch(69.6% 0.17 162.48);',
  89: '  --color-emerald-700: oklch(50.8% 0.118 165.612);',
  97: '  --color-teal-300: oklch(85.5% 0.138 181.071);',
  99: '  --color-teal-500: oklch(70.4% 0.14 182.503);',
  101: '  --color-teal-700: oklch(51.1% 0.096 186.391);',
  109: '  --color-cyan-300: oklch(86.5% 0.127 207.078);',
  111: '  --color-cyan-500: oklch(71.5% 0.143 215.221);',
  113: '  --color-cyan-700: oklch(52% 0.105 223.128);',
  121: '  --color-sky-300: oklch(82.8% 0.111 230.318);',
  123: '  --color-sky-500: oklch(68.5% 0.169 237.323);',
  125: '  --color-sky-700: oklch(50% 0.134 242.749);',
  133: '  --color-blue-300: oklch(80.9% 0.105 251.813);',
  135: '  --color-blue-500: oklch(62.3% 0.214 259.815);',
  137: '  --color-blue-700: oklch(48.8% 0.243 264.376);',
  145: '  --color-indigo-300: oklch(78.5% 0.115 274.713);',
  147: '  --color-indigo-500: oklch(58.5% 0.233 277.117);',
  149: '  --color-indigo-700: oklch(45.7% 0.24 277.023);',
  157: '  --color-violet-300: oklch(81.1% 0.111 293.571);',
  159: '  --color-violet-500: oklch(60.6% 0.25 292.717);',
  161: '  --color-violet-700: oklch(49.1% 0.27 292.581);',
  169: '  --color-purple-300: oklch(82.7% 0.119 306.383);',
  171: '  --color-purple-500: oklch(62.7% 0.265 303.9);',
  173: '  --color-purple-700: oklch(49.6% 0.265 301.924);',
  181: '  --color-fuchsia-300: oklch(83.3% 0.145 321.434);',
  183: '  --color-fuchsia-500: oklch(66.7% 0.295 322.15);',
  185: '  --color-fuchsia-700: oklch(51.8% 0.253 323.949);',
  193: '  --color-pink-300: oklch(82.3% 0.12 346.018);',
  195: '  --color-pink-500: oklch(65.6% 0.241 354.308);',
  197: '  --color-pink-700: oklch(52.5% 0.223 3.958);',
  205: '  --color-rose-300: oklch(81% 0.117 11.638);',
  207: '  --color-rose-500: oklch(64.5% 0.246 16.439);',
  209: '  --color-rose-700: oklch(51.4% 0.222 16.935);',
};
export const lineOf = (family: Family, shade: Shade) => 13 + 12 * FAMILIES.indexOf(family) + 2 * SHADES.indexOf(shade);

export interface Swatch {
  family: Family;
  shade: Shade;
  /** theme.css line. */
  line: number;
  /** OKLCH lightness as a fraction (the file writes a percentage), chroma, hue in degrees. */
  L: number;
  C: number;
  h: number;
}
/** A theme.css line's colour: `--color-<family>-<shade>: oklch(<L>% <C> <h>);`. */
export function parseLine(text: string): Omit<Swatch, 'line'> {
  const m = /^\s*--color-([a-z]+)-(\d+): oklch\(([\d.]+)% ([\d.]+) ([\d.]+)\);$/.exec(text);
  if (!m) throw new Error(`not a palette line: ${text}`);
  return { family: m[1] as Family, shade: m[2] as Shade, L: +m[3]! / 100, C: +m[4]!, h: +m[5]! };
}
export const swatch = (family: Family, shade: Shade): Swatch => {
  const line = lineOf(family, shade);
  return { ...parseLine(THEME_LINES[line]!), line };
};

// ---------------------------------------------------------------- conversions.js, as written
type Vec3 = readonly [number, number, number];
type Mat3 = readonly [Vec3, Vec3, Vec3];
const mul = (M: Mat3, v: Vec3): [number, number, number] => [
  M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2],
  M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2],
  M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2],
];
// l.62
const XYZ_TO_LIN_SRGB: Mat3 = [
  [12831 / 3959, -329 / 214, -1974 / 3959],
  [-851781 / 878810, 1648619 / 878810, 36519 / 878810],
  [705 / 12673, -2585 / 12673, 705 / 667],
];
// l.50
const LIN_SRGB_TO_XYZ: Mat3 = [
  [506752 / 1228815, 87881 / 245763, 12673 / 70218],
  [87098 / 409605, 175762 / 245763, 12673 / 175545],
  [7918 / 409605, 87881 / 737289, 1001167 / 1053270],
];
// l.104
const XYZ_TO_LIN_P3: Mat3 = [
  [446124 / 178915, -333277 / 357830, -72051 / 178915],
  [-14852 / 17905, 63121 / 35810, 423 / 17905],
  [11844 / 330415, -50337 / 660830, 316169 / 330415],
];
// l.91
const LIN_P3_TO_XYZ: Mat3 = [
  [608311 / 1250200, 189793 / 714400, 198249 / 1000160],
  [35783 / 156275, 247089 / 357200, 198249 / 2500400],
  [0 / 1, 32229 / 714400, 5220557 / 5000800],
];
// l.422
const LMS_TO_XYZ: Mat3 = [
  [1.2268798758459243, -0.5578149944602171, 0.2813910456659647],
  [-0.0405757452148008, 1.112286803280317, -0.0717110580655164],
  [-0.0763729366746601, -0.4214933324022432, 1.5869240198367816],
];
const OKLAB_TO_LMS: Mat3 = [
  [1.0, 0.3963377773761749, 0.2158037573099136],
  [1.0, -0.1055613458156586, -0.0638541728258133],
  [1.0, -0.0894841775298119, -1.2914855480194092],
];
// l.401
const XYZ_TO_LMS: Mat3 = [
  [0.819022437996703, 0.3619062600528904, -0.1288737815209879],
  [0.0329836539323885, 0.9292868615863434, 0.0361446663506424],
  [0.0481771893596242, 0.2642395317527308, 0.6335478284694309],
];
const LMS_TO_OKLAB: Mat3 = [
  [0.210454268309314, 0.7936177747023054, -0.0040720430116193],
  [1.9779985324311684, -2.4285922420485799, 0.450593709617411],
  [0.0259040424655478, 0.7827717124575296, -0.8086757549230774],
];
const TO_LINEAR: Record<Space, Mat3> = { srgb: XYZ_TO_LIN_SRGB, p3: XYZ_TO_LIN_P3 };
const FROM_LINEAR: Record<Space, Mat3> = { srgb: LIN_SRGB_TO_XYZ, p3: LIN_P3_TO_XYZ };

const oklchToOklab = (L: number, C: number, h: number): Vec3 => [L, C * Math.cos((h * Math.PI) / 180), C * Math.sin((h * Math.PI) / 180)];
const oklabToXyz = (lab: Vec3) => mul(LMS_TO_XYZ, mul(OKLAB_TO_LMS, lab).map((c) => c ** 3) as unknown as Vec3);
const xyzToOklab = (xyz: Vec3) => mul(LMS_TO_OKLAB, mul(XYZ_TO_LMS, xyz).map((c) => Math.cbrt(c)) as unknown as Vec3);
// l.11 and l.31: the sRGB transfer function, extended to negative values by reflection.
const toLinear = (v: number) => {
  const a = Math.abs(v);
  return a <= 0.04045 ? v / 12.92 : Math.sign(v) * ((a + 0.055) / 1.055) ** 2.4;
};
const toGamma = (v: number) => {
  const a = Math.abs(v);
  return a > 0.0031308 ? Math.sign(v) * (1.055 * a ** (1 / 2.4) - 0.055) : 12.92 * v;
};

/** An OKLCH colour's linear-light red, green and blue in `space`; inside the gamut each is in [0, 1]. */
export const linearRgb = (L: number, C: number, h: number, space: Space) => mul(TO_LINEAR[space], oklabToXyz(oklchToOklab(L, C, h)));
/** Whether a screen with this gamut can show the colour as written. */
export const inside = (L: number, C: number, h: number, space: Space) => linearRgb(L, C, h, space).every((v) => v >= 0 && v <= 1);
/** The gamut's edge at this lightness and hue: the largest chroma still inside, to 1e-9, by bisection. */
export function edge(L: number, h: number, space: Space): number {
  let lo = 0,
    hi = 0.5;
  while (hi - lo > 1e-9) {
    const mid = (lo + hi) / 2;
    if (inside(L, mid, h, space)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** deltaEOK: Euclidean distance in OKLab (Overview.bs §ΔEOK, l.8639). */
const deltaEOK = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/** Clip: the colour in the screen's gamma-encoded RGB, each component clamped to [0, 1], back in OKLab. */
function clipped(lab: Vec3, space: Space): Vec3 {
  const rgb = mul(TO_LINEAR[space], oklabToXyz(lab)).map((v) => Math.min(1, Math.max(0, toGamma(v))));
  return xyzToOklab(mul(FROM_LINEAR[space], rgb.map(toLinear) as unknown as Vec3));
}
const toOklch = (lab: Vec3) => ({ L: lab[0], C: Math.hypot(lab[1], lab[2]), h: ((Math.atan2(lab[2], lab[1]) * 180) / Math.PI + 360) % 360 });

/**
 * What CSS Color 4's "Binary Search Gamut Mapping with Local MINDE" (Overview.bs l.6539–6609) gives for a
 * colour on a screen with this gamut, in OKLCH. A colour inside is returned unchanged.
 */
export function cssMap(L: number, C: number, h: number, space: Space): { L: number; C: number; h: number } {
  const JND = 0.02,
    EPS = 0.0001;
  if (L >= 1 || L <= 0) throw new Error('lightness outside (0, 1) maps to white or black');
  if (inside(L, C, h, space)) return { L, C, h };
  let current = oklchToOklab(L, C, h);
  let clip = clipped(current, space);
  if (deltaEOK(clip, current) < JND) return toOklch(clip);
  let min = 0,
    max = C,
    minInGamut = true;
  while (max - min > EPS) {
    const chroma = (min + max) / 2;
    current = oklchToOklab(L, chroma, h);
    if (minInGamut && inside(L, chroma, h, space)) {
      min = chroma;
      continue;
    }
    clip = clipped(current, space);
    const E = deltaEOK(clip, current);
    if (E < JND) {
      if (JND - E < EPS) return toOklch(clip);
      minInGamut = false;
      min = chroma;
    } else max = chroma;
  }
  return toOklch(clip);
}

// ---------------------------------------------------------------- the explainer's answers
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const r1 = (x: number) => Math.round(x * 10) / 10;

export interface Row {
  family: Family;
  line: number;
  L: number;
  C: number;
  h: number;
  /** The sRGB and Display P3 edges at this colour's L and h, to three decimals as the radar plots them. */
  srgb: number;
  p3: number;
  /** Chroma as a percentage of each edge, to one decimal. */
  ofSrgb: number;
  ofP3: number;
  outsideSrgb: boolean;
  outsideP3: boolean;
  /** What an sRGB screen shows after CSS gamut mapping: its chroma to three decimals, the hue shift in
   * degrees to one decimal, and its chroma as a percentage of the sRGB edge at its own new L and h. */
  shown: number;
  hueShift: number;
  shownOfSrgb: number;
  /** Each edge as a percentage of the other, to one decimal. */
  p3OfSrgb: number;
  srgbOfP3: number;
}
export function rows(shade: Shade): Row[] {
  return FAMILIES.map((family) => {
    const { line, L, C, h } = swatch(family, shade);
    const srgb = edge(L, h, 'srgb'),
      p3 = edge(L, h, 'p3');
    const shown = cssMap(L, C, h, 'srgb');
    return {
      family,
      line,
      L,
      C,
      h,
      srgb: r3(srgb),
      p3: r3(p3),
      ofSrgb: r1((100 * C) / srgb),
      ofP3: r1((100 * C) / p3),
      outsideSrgb: !inside(L, C, h, 'srgb'),
      outsideP3: !inside(L, C, h, 'p3'),
      shown: r3(shown.C),
      hueShift: r1(Math.abs(((shown.h - h + 540) % 360) - 180)),
      shownOfSrgb: r1((100 * shown.C) / edge(shown.L, shown.h, 'srgb')),
      p3OfSrgb: r1((100 * p3) / srgb),
      srgbOfP3: r1((100 * srgb) / p3),
    };
  });
}

/** A family and a number about it. */
export interface Fact {
  family: Family;
  value: number;
}
export interface Summary {
  shade: Shade;
  count: number;
  outsideSrgb: Family[];
  insideSrgb: Family[];
  outsideP3: Family[];
  /** The colour furthest past the sRGB edge in chroma, to three decimals. */
  furthest: Fact;
  /** The colour with the largest chroma as a percentage of the sRGB edge, and the smallest. */
  mostOfSrgb: Fact;
  leastOfSrgb: Fact;
  /** The colour nearest the P3 edge (largest percentage) and the chroma it has to spare; the furthest inside. */
  nearestP3: Fact & { spare: number };
  leastOfP3: Fact;
  /** The P3 edge as a percentage of the sRGB edge: smallest and largest. */
  p3OfSrgb: { lo: Fact; hi: Fact };
  /** The sRGB edge as a percentage of the P3 edge: smallest and largest. */
  srgbOfP3: { lo: Fact; hi: Fact };
  /** On an sRGB screen after mapping: the largest chroma lost (written and shown), and the largest hue shift. */
  lost: Fact & { from: number; to: number };
  hueShift: Fact;
  /** Neighbouring spokes' hue angles, going round: the smallest and largest gap, in whole degrees. */
  hueGap: { lo: { from: Family; to: Family; value: number }; hi: { from: Family; to: Family; value: number } };
}
export function summarize(shade: Shade): Summary {
  const all = rows(shade);
  const most = (f: (r: Row) => number): Row => all.reduce((a, b) => (f(b) > f(a) ? b : a));
  const least = (f: (r: Row) => number): Row => all.reduce((a, b) => (f(b) < f(a) ? b : a));
  const fact = (r: Row, value: number): Fact => ({ family: r.family, value });
  const far = most((r) => r.C - edge(r.L, r.h, 'srgb'));
  const share = (r: Row) => r.C / edge(r.L, r.h, 'srgb'),
    shareP3 = (r: Row) => r.C / edge(r.L, r.h, 'p3');
  const near = most(shareP3);
  const lost = most((r) => r.C - r.shown);
  const ratio = (r: Row) => edge(r.L, r.h, 'p3') / edge(r.L, r.h, 'srgb');
  const gaps = all.map((r, i) => {
    const next = all[(i + 1) % all.length]!;
    return { from: r.family, to: next.family, value: Math.round((next.h - r.h + 360) % 360) };
  });
  return {
    shade,
    count: all.length,
    outsideSrgb: all.filter((r) => r.outsideSrgb).map((r) => r.family),
    insideSrgb: all.filter((r) => !r.outsideSrgb).map((r) => r.family),
    outsideP3: all.filter((r) => r.outsideP3).map((r) => r.family),
    furthest: fact(far, r3(far.C - edge(far.L, far.h, 'srgb'))),
    mostOfSrgb: fact(most(share), most(share).ofSrgb),
    leastOfSrgb: fact(least(share), least(share).ofSrgb),
    nearestP3: { ...fact(near, near.ofP3), spare: r3(edge(near.L, near.h, 'p3') - near.C) },
    leastOfP3: fact(least(shareP3), least(shareP3).ofP3),
    p3OfSrgb: { lo: fact(least(ratio), least(ratio).p3OfSrgb), hi: fact(most(ratio), most(ratio).p3OfSrgb) },
    srgbOfP3: { lo: fact(most(ratio), most(ratio).srgbOfP3), hi: fact(least(ratio), least(ratio).srgbOfP3) },
    lost: { ...fact(lost, r3(lost.C - lost.shown)), from: lost.C, to: lost.shown },
    hueShift: fact(most((r) => r.hueShift), most((r) => r.hueShift).hueShift),
    hueGap: { lo: gaps.reduce((a, b) => (b.value < a.value ? b : a)), hi: gaps.reduce((a, b) => (b.value > a.value ? b : a)) },
  };
}
