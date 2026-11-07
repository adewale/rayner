// Shapers for the embedded fonts, built on the vendored glyph shaper.
// The fonts (Inter, JetBrains Mono, and Noto fallbacks; all OFL) are subset by
// tools/fonts.sh into src/font-data.ts: Latin-1, punctuation, super- and
// subscripts, number forms, arrows, math, shapes, and digits and numerals from
// Arabic, Devanagari and Chinese. The mono face carries no ligature lookups, so
// code reads as literal source, like a diff.
//
// Each face is a chain, tried in order per character, as a browser falls back
// across a font-family list: mono, then sans, then the fallbacks. A run the
// first face draws whole is shaped once, as before; otherwise it is split into
// pieces by the first face in the chain that has each character, and each piece
// is shaped in its own face. The fallbacks hold only characters that need no
// shaping, so splitting loses nothing but kerning across a piece boundary.
import { loadFont, run } from '../vendor/glyph.js';
import type { Font, Run, ShapedGlyph } from '../vendor/glyph.js';
import { SANS, MONO, FALLBACK } from './font-data.ts';
import { perf } from './perf.ts';

/** The embedded faces. */
export type FontName = 'sans' | 'mono';
/** Shape `text` at `size` scene units: glyph outlines and advances. Memoized. */
export type Shaper = (text: string, size: number) => Run;

/** Base64 font data as bytes. */
export function bytesOf(b64: string): Uint8Array {
  const bin = atob(b64); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
/** Decode base64 font data; `label` names it when it cannot be decoded. */
export async function decodeFont(b64: string, label: string): Promise<Font> {
  const r = await loadFont(bytesOf(b64));
  if (r.tag !== 'Ok') throw new Error(`${label}: ${JSON.stringify(r.error)}`);
  return r.value;
}

/** The embedded faces, decoded: the two families and the fallbacks in FALLBACK's order. */
export interface EmbeddedFaces { sans: Font; mono: Font; fallback: readonly Font[] }
let embeddedDecode: Promise<EmbeddedFaces> | null = null;
/**
 * Decode the embedded faces, once; every caller shares the decode. A fallback face
 * that cannot load is left out, so its characters are reported missing, which every
 * command does; it must not stop text that never needs it. A family that cannot load throws.
 */
export function embeddedFaces(): Promise<EmbeddedFaces> {
  return embeddedDecode ??= (async () => {
    const fallback: Font[] = [];
    for (const [, b64] of FALLBACK) {
      const r = await loadFont(bytesOf(b64));
      if (r.tag === 'Ok') fallback.push(r.value);
    }
    return { sans: await decodeFont(SANS, 'sans'), mono: await decodeFont(MONO, 'mono'), fallback };
  })();
}
/**
 * The faces `font` draws with, in fallback order, as a browser falls back across a
 * font-family list: mono, then sans, then the fallbacks. `extra` faces join each
 * family right after its embedded face, so a character the embedded faces draw is
 * drawn as before.
 */
export function embeddedChain(faces: EmbeddedFaces, font: FontName,
  extra: Readonly<Partial<Record<FontName, readonly Font[]>>> = {}): Font[] {
  const sans = [faces.sans, ...(extra.sans ?? [])];
  return font === 'mono' ? [faces.mono, ...(extra.mono ?? []), ...sans, ...faces.fallback] : [...sans, ...faces.fallback];
}

let loading: Promise<Record<FontName, Shaper>> | null = null;

/** Shaped runs kept per shaper: far more than one scene uses, so seeks never reshape. */
export const SHAPE_MEMO_MAX = 8192;
let shapers: Readonly<Record<FontName, Shaper>> | null = null;
let compatibilityShapers: Readonly<Record<FontName, Shaper>> | undefined;
/** Legacy useLettering() selection; the decoded embedded table stays immutable. */
export function setDefaultShapers(value: Readonly<Record<FontName, Shaper>> | undefined) { compatibilityShapers = value; }

/** Characters no face in the chain can draw (glyph 0), by the string that held them. */
const missing = new Map<string, string>();
/** What was shaped since the last call that the fonts could not draw; clears the record. */
export function takeMissingGlyphs(): Map<string, string> {
  const out = new Map(missing);
  missing.clear();
  return out;
}
/** A run's undrawable clusters. Control characters have no glyph in any face, so they are not missing. */
export function undrawable(text: string, r: Run): string {
  const chars = [...text],
    starts = [...new Set(r.glyphs.map((g) => g.cluster))].sort((a, b) => a - b);
  return r.glyphs
    .filter((g) => g.gid === 0)
    .map((g) => chars.slice(g.cluster, starts.find((s) => s > g.cluster) ?? chars.length).join(''))
    .join('')
    .replace(/\p{Cc}/gu, '');
}

/**
 * Decode the embedded fonts (once; concurrent callers share one decode).
 * Scene.run() calls this, so scenes never need to.
 */
export function loadFonts(): Promise<Readonly<Record<FontName, Shaper>>> {
  loading ??= buildShapers().then((s) => (shapers = Object.freeze(s)));
  return loading;
}

/** The shaper for 'sans' or 'mono'. Throws if fonts haven't been loaded. */
export function shaperFor(font: FontName): Shaper { return compatibilityShapers?.[font] ?? embeddedShaperFor(font); }

export function embeddedShaperFor(font: FontName): Shaper {
  if (!shapers) throw new Error('Fonts are not loaded: await loadFonts() first (Scene.run() does this for scenes)');
  switch (font) {
    case 'sans': return shapers.sans;
    case 'mono': return shapers.mono;
    default: throw new Error("Unknown font: use 'sans' or 'mono'");
  }
}

/** Characters that draw with the character before them, whatever face it took: marks, joiners, variation selectors. */
export const ATTACHED = /^[\p{M}\u200C\u200D\uFE00-\uFE0F\u{E0100}-\u{E01EF}]$/u;

/**
 * Shape `text` in the first face of `chain`, falling back per character to the
 * first face that has it. The result reads as one run in the first face's
 * metrics: clusters index `text`, pens continue across pieces, and a glyph from
 * another face carries its own scale `s`.
 */
export function shapeChain(chain: readonly Font[], key: string, text: string, size: number): Run {
  const shape = (font: Font, t: string): Run => {
    const r = run(font, key, t, size);
    if (r.tag !== 'Ok') throw new Error('shape: ' + JSON.stringify(r.error));
    return r.value;
  };
  const first = shape(chain[0]!, text);
  if (chain.length === 1 || !first.glyphs.some((g) => g.gid === 0)) return first;
  const chars = [...text];
  const owner: number[] = [];
  chars.forEach((ch, i) => {
    const found = chain.findIndex((f) => f.glyphOf(ch.codePointAt(0)!) !== 0);
    // Nothing draws it: leave it to the first face, which reports it missing
    owner.push(i > 0 && ATTACHED.test(ch) ? owner[i - 1]! : Math.max(found, 0));
  });
  if (owner.every((o) => o === 0)) return first;
  const glyphs: ShapedGlyph[] = [];
  let pen = 0;
  for (let start = 0; start < chars.length; ) {
    let end = start + 1;
    while (end < chars.length && owner[end] === owner[start]) end++;
    const piece = shape(chain[owner[start]!]!, chars.slice(start, end).join(''));
    for (const g of piece.glyphs)
      glyphs.push({ ...g, cluster: g.cluster + start, x: g.x + pen, s: g.s ?? piece.s ?? size / 1000 });
    pen += piece.width;
    start = end;
  }
  return { glyphs, width: pen, ascent: first.ascent, descent: first.descent, s: first.s };
}

/** A shaped run with its undrawable clusters (see undrawable): empty when the faces draw all of it. */
export type ShapedRun = Run & { missing: string };
/**
 * A shaper over `chain`, memoized. Shaping is a pure function of (font, text,
 * size): re-running a scene (every seek does) then costs no shaping at all, and
 * identical segment arrays let Text reuse its flattened outlines. The memo is
 * bounded to `max` runs, least recently used out first: a DecimalNumber shapes a
 * new string every frame, so a long count (or a Worker serving many scenes) would
 * otherwise keep every one of them. `first` annotates a run when it is first
 * shaped; `each` sees every call, memoized or not, as a check needs to see each
 * string it draws.
 */
export function memoShaper<X extends object = object>(chain: readonly Font[], key: string, hooks: {
  first?: (text: string, run: ShapedRun) => X;
  each?: (text: string, size: number, run: ShapedRun & X) => void;
} = {}, max = SHAPE_MEMO_MAX): (text: string, size: number) => ShapedRun & X {
  const memo = new Map<string, ShapedRun & X>();
  return (text, size) => {
    const k = size + '\u0000' + text;
    let r = memo.get(k);
    if (r) { memo.delete(k); memo.set(k, r); }
    else {
      const run = shapeChain(chain, key, text, size), shaped: ShapedRun = Object.assign(run, { missing: undrawable(text, run) });
      memo.set(k, (r = Object.assign(shaped, hooks.first?.(text, shaped)) as ShapedRun & X));
      if (memo.size > max) memo.delete(memo.keys().next().value!);
    }
    hooks.each?.(text, size, r);
    return r;
  };
}

async function buildShapers(): Promise<Record<FontName, Shaper>> {
  const end = perf.begin('fonts.decode');
  const faces = await embeddedFaces();
  // Recorded on every call, memoized or not: a check needs to see each string it draws.
  const each = (text: string, _size: number, r: ShapedRun) => { if (r.missing) missing.set(text, r.missing); };
  const out: Record<FontName, Shaper> = {
    sans: memoShaper(embeddedChain(faces, 'sans'), 'sans', { each }),
    mono: memoShaper(embeddedChain(faces, 'mono'), 'mono', { each }),
  };
  end();
  return out;
}
