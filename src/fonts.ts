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

const FONTS = { sans: SANS, mono: MONO };
/** The faces each name draws with, in fallback order, by their names in FACES. */
const CHAINS: Record<keyof typeof FONTS, readonly string[]> = {
  sans: ['sans', ...FALLBACK.map(([name]) => name)],
  mono: ['mono', 'sans', ...FALLBACK.map(([name]) => name)],
};
const FACES: ReadonlyMap<string, string> = new Map([...Object.entries(FONTS), ...FALLBACK]);

/** The embedded faces. */
export type FontName = keyof typeof FONTS;
/** Shape `text` at `size` scene units: glyph outlines and advances. Memoized. */
export type Shaper = (text: string, size: number) => Run;

function bytesOf(b64: string): Uint8Array {
  const bin = atob(b64); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

let loading: Promise<Record<FontName, Shaper>> | null = null;

/** Shaped runs kept per face: far more than one scene uses, so seeks never reshape. */
const SHAPE_MEMO_MAX = 8192;
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
function undrawable(text: string, r: Run): string {
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
const ATTACHED = /^[\p{M}\u200C\u200D\uFE00-\uFE0F\u{E0100}-\u{E01EF}]$/u;

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

async function buildShapers(): Promise<Record<FontName, Shaper>> {
  const end = perf.begin('fonts.decode');
  const out: Partial<Record<FontName, Shaper>> = {};
  const faces = new Map<string, Font>();
  for (const [name, b64] of FACES) {
    const r = await loadFont(bytesOf(b64));
    if (r.tag === 'Ok') faces.set(name, r.value);
    // A fallback face that cannot load leaves its characters missing, which every command reports;
    // it must not stop text that never needs it.
    else if (name in FONTS) throw new Error(name + ': ' + JSON.stringify(r.error));
  }
  for (const key of Object.keys(FONTS) as FontName[]) {
    const chain = CHAINS[key].flatMap((name) => faces.get(name) ?? []);
    // Shaping is a pure function of (font, text, size): memoize it. Re-running a
    // scene (every seek does) then costs no shaping at all, and identical
    // segment arrays let Text reuse its flattened outlines.
    // The memo is bounded, least recently used out first: a DecimalNumber shapes a new
    // string every frame, so a long count (or a Worker serving many scenes) would
    // otherwise keep every one of them.
    const memo = new Map<string, Run & { missing?: string }>();
    out[key] = (text, size) => {
      const k = size + '\u0000' + text;
      let r = memo.get(k);
      if (r) { memo.delete(k); memo.set(k, r); }
      else {
        memo.set(k, (r = shapeChain(chain, key, text, size)));
        r.missing = undrawable(text, r);
        if (memo.size > SHAPE_MEMO_MAX) memo.delete(memo.keys().next().value!);
      }
      // Recorded on every call, memoized or not: a check needs to see each string it draws.
      if (r.missing) missing.set(text, r.missing);
      return r;
    };
  }
  end();
  // Both keys of FONTS were filled above
  return out as Record<FontName, Shaper>;
}
