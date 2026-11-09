// Optional outline snapshots. This module has no installation side effects: a
// page without lettering never imports a provider or carries a lettering store.
import type { SceneClass } from './scene.ts';
import { decodeFont, embeddedChain, embeddedFaces, embeddedShaperFor, memoShaper } from './fonts.ts';
import type { FontName, ShapedRun, Shaper } from './fonts.ts';
import type { Font, Run, Segment } from '../vendor/glyph.js';
import { Text, CodeSpan, expandTabs, textRun, advanceBox, formulaOf } from './text.ts';
import type { Box } from './mobject.ts';
import { canonicalJson } from './json.ts';
import { unionBoxes } from './box.ts';
import {bindTextContext, withTextContext} from './text-context.ts';
import { LETTERING_SCRIPTS } from './lettering-scripts.ts';
import type {TextShaping} from './text-context.ts';

/** Real cuts an explainer can ask for, instead of the stroked faux bold and no italic. */
export type LetteringStyle = 'bold' | 'italic';
export interface LetteringRequest {
  faces?: Partial<Record<FontName, string>>;
  /** ISO 15924 script codes, e.g. Arab, Deva, Hebr, Hani. */
  scripts?: readonly string[];
  math?: boolean;
  /** Draw `weight: 'bold'` Text in the face's Bold cut, and allow ItalicText. */
  styles?: readonly LetteringStyle[];
}
/** The cut a run is shaped in: '' for the regular cut. */
export type LetteringCut = '' | 'bold' | 'italic' | 'bold-italic';
/**
 * The name of one cut of a family or face, as snapshots key runs ('sans/bold')
 * and faces ('inter/bold'): the name alone for the regular cut.
 */
export const cutFace = (name: string, cut: LetteringCut): string => cut ? name + '/' + cut : name;
/** The format of scene.lettering.json's outline snapshot: raise it when what a stored field means changes. */
export const LETTERING_VERSION = 3;
/** The format of scene.lettering.json's subset pin (the cut faces of `scripts` lettering). */
export const SUBSET_LETTERING_VERSION = 1;
/**
 * Whether a stored scene.lettering.json was pinned for `request`: an outline snapshot of this
 * version for the same request, or a subset pin of its version for the same scripts, compared as
 * canonical JSON so key order does not matter. loadProject and the command both ask; the command
 * also holds the builder's fingerprint.
 */
export function pinnedFor(pinned: unknown, request: LetteringRequest, outline: boolean): boolean {
  const p = pinned as { version?: unknown; request?: unknown; scripts?: unknown } | null;
  if (!p || typeof p !== 'object') return false;
  return outline
    ? p.version === LETTERING_VERSION && canonicalJson(p.request) === canonicalJson(request)
    : p.version === SUBSET_LETTERING_VERSION && canonicalJson(p.scripts) === canonicalJson(request.scripts);
}
export interface LetteringSnapshot {
  /** The snapshot format (LETTERING_VERSION). */
  version: typeof LETTERING_VERSION;
  /**
   * The capture tool's fingerprint: its Python, requirements, vendored shapers and fallback font
   * bytes, which decide every stored outline. Rayner's own code is not in it: a change there that
   * asks for a different run finds it missing, and capture tests compare fresh runs with stored ones.
   */
  builderHash: string;
  request: LetteringRequest;
  /** Unit-em runs; clusters count source code points, including for RTL runs. */
  runs: Record<string, Run>;
  faces: Record<string, { hash: string; data: string; license: string }>;
  shaper: string;
  /** Original font bytes used by natural diagram metrics; subsets alone cannot identify them. */
  fontInputs?: Record<string, string>;
  /**
   * Run keys only the build draws (contact-sheet titles and the
   * wrapping that measures them), which a page leaves out. Absent when there are none.
   */
  offPage?: string[];
  /**
   * Packed form only (packLettering): each distinct glyph outline once, as path
   * data (outlinePath). A packed glyph has `o`, its outline's index here, in place of `path`.
   */
  outlines?: never;
}

export interface PackedLetteringSnapshot extends Omit<LetteringSnapshot, 'runs' | 'outlines'> {
  runs: Record<string, Omit<Run, 'glyphs'> & {glyphs: (Omit<Run['glyphs'][number], 'path'> & {o: number})[]}>;
  outlines: string[];
}

const COMMANDS = { MoveTo: 'M', LineTo: 'L', QuadTo: 'Q', CubicTo: 'C', Close: 'Z' } as const;
/**
 * An outline as SVG-like path data, in unit em, y up: `M`, `L`, `Q`, `C` and `Z`, each followed by
 * its coordinates in the order the segment holds them, written as JavaScript writes a number, so
 * outlineSegments reads back the same numbers.
 */
export function outlinePath(path: readonly Segment[]): string {
  let d = '';
  for (const s of path) {
    const numbers = s.tag === 'Close' ? [] : s.tag === 'CubicTo' ? [s.x1, s.y1, s.x2, s.y2, s.x, s.y] : s.tag === 'QuadTo' ? [s.x1, s.y1, s.x, s.y] : [s.x, s.y];
    d += COMMANDS[s.tag];
    for (let i = 0; i < numbers.length; i++) {
      const n = String(numbers[i]);
      d += (i && n[0] !== '-' ? ' ' : '') + n;
    }
  }
  return d;
}
/** The segments of path data outlinePath wrote; undefined for anything else. */
export function outlineSegments(d: string): Segment[] | undefined {
  const tokens = d.match(/[MLQCZ]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
  if (tokens.join('').length !== d.replace(/ /g, '').length) return undefined;
  const path: Segment[] = [];
  for (let i = 0; i < tokens.length;) {
    const command = tokens[i++]!, count = command === 'Z' ? 0 : command === 'C' ? 6 : command === 'Q' ? 4 : command === 'M' || command === 'L' ? 2 : -1;
    if (count < 0) return undefined;
    const n = tokens.slice(i, (i += count)).map(Number);
    if (n.length !== count || n.some((x) => !Number.isFinite(x))) return undefined;
    path.push(command === 'Z' ? { tag: 'Close' } : command === 'C' ? { tag: 'CubicTo', x1: n[0]!, y1: n[1]!, x2: n[2]!, y2: n[3]!, x: n[4]!, y: n[5]! }
      : command === 'Q' ? { tag: 'QuadTo', x1: n[0]!, y1: n[1]!, x: n[2]!, y: n[3]! } : { tag: command === 'M' ? 'MoveTo' : 'LineTo', x: n[0]!, y: n[1]! });
  }
  return path;
}
export type StoredLetteringSnapshot = LetteringSnapshot | PackedLetteringSnapshot;

/**
 * A snapshot as written to disk and shipped in a page: each distinct glyph
 * outline stored once. A wrapped build-time label is measured line
 * by line, so its glyphs recur in many runs; packing stores each outline once.
 */
export function packLettering(snapshot: LetteringSnapshot): PackedLetteringSnapshot {
  const outlines: string[] = [], index = new Map<string, number>();
  const runs = Object.fromEntries(Object.entries(snapshot.runs).map(([key, run]) => [key, {
    ...run, glyphs: run.glyphs.map(({ path, ...glyph }) => {
      const d = outlinePath(path);
      let o = index.get(d);
      if (o === undefined) { index.set(d, o = outlines.length); outlines.push(d); }
      return { ...glyph, o };
    }),
  }]));
  return { ...snapshot, runs, outlines };
}
/**
 * A packed snapshot made whole again: its runs are replaced by new ones with
 * each glyph's outline back in `path`, and `outlines` is dropped. Glyph objects
 * are new, so a shallow copy of a packed snapshot leaves the original packed.
 * An unpacked snapshot is returned as it is. Every stored outline must be used.
 */
export function unpackLettering(snapshot: StoredLetteringSnapshot): LetteringSnapshot {
  const outlines = snapshot.outlines;
  if (outlines === undefined) return snapshot;
  const fail = (): never => { throw new Error('scene.lettering.json: its outlines are invalid; run rayner snapshots to rebuild it'); };
  if (!Array.isArray(outlines) || !snapshot.runs || typeof snapshot.runs !== 'object') fail();
  // Each outline read once: the glyphs that share it share its segments.
  const paths = outlines.map((d) => (typeof d === 'string' ? outlineSegments(d) : undefined) ?? fail());
  const used = new Set<number>();
  const runs: LetteringSnapshot['runs'] = {};
  for (const [key, run] of Object.entries(snapshot.runs)) {
    if (!run || !Array.isArray(run.glyphs)) fail();
    runs[key] = { ...run, glyphs: run.glyphs.map(({ o, ...glyph }) => {
      if (!Number.isInteger(o) || !(o! >= 0 && o! < outlines.length)) fail();
      used.add(o!);
      return { ...glyph, path: paths[o!]! };
    }) };
  }
  if (used.size !== outlines.length) fail();
  const {outlines: packed, ...data} = snapshot;
  return {...data, runs};
}
export interface LetteringProvider {
  /** What the scene asked for; styles decide which cuts Text may use. */
  request?: LetteringRequest;
  prepare?(): Promise<void>;
  shape(font: FontName, text: string, size: number, fallback: Shaper, cut?: LetteringCut): Run;
  math(latex: string, size: number, display: boolean): Run;
}
export const letteringOf = (Source: object): LetteringRequest | undefined =>
  (Source as { meta?: { lettering?: LetteringRequest } }).meta?.lettering;
/** The registered scripts that run right to left, and a letter of one of them. */
export const RTL_SCRIPTS: readonly string[] = ['Arab', 'Hebr'];
export const RTL_LETTER = /[\p{Script=Arabic}\p{Script=Hebrew}]/u;
/**
 * Whether a paragraph reads right to left, as UAX #9 rules P2 and P3 decide:
 * by its first strong character, a letter or a bidi mark (RLM and ALM are
 * right to left, LRM left to right). tools/lettering.py resolves the same way.
 */
export function rightToLeft(text: string): boolean {
  const first = text.match(/[\p{L}\u200e\u200f\u061c]/u)?.[0];
  return !!first && (first === '\u200f' || first === '\u061c' || RTL_LETTER.test(first));
}
/** Bidi marks (LRM, RLM, ALM): only the build-time bidi resolver gives them meaning, so their strings are stored runs. */
const BIDI_MARK = /[\u200e\u200f\u061c]/;
export const usesLettering = (request: LetteringRequest, font: FontName, text: string, cut: LetteringCut = ''): boolean =>
  !!cut || !!request.faces?.[font] || (!!request.scripts?.length && BIDI_MARK.test(text)) || (request.scripts ?? []).some((s) => new RegExp(`\\p{Script_Extensions=${s}}`, 'u').test(text));
export const runKey = (font: string, text: string, display = false): string => JSON.stringify([font, text, display]);
export function scaledRun(run: Run, size: number): Run {
  return { ...run, width: run.width * size, ascent: run.ascent * size, descent: run.descent * size,
    s: (run.s ?? 1) * size,
    glyphs: run.glyphs.map((g) => ({ ...g, x: g.x * size, dx: g.dx * size, dy: g.dy * size, ax: g.ax * size, s: (g.s ?? run.s ?? 1) * size })) };
}

// DecimalNumber produces intermediate values at the chosen playback FPS.
// Keep that narrow alphabet available without authorizing new prose at runtime.
export const numericAlphabet = '0123456789+-.eE,%‰‱$€£¥()−\u0020\u00a0\u202f';
export const isNumericText = (text: string): boolean =>
  /^[ (+\-−$€£¥\u00a0\u202f]*\d[\d .,\u00a0\u202f]*(?:[eE][+\-−]?\d+)?[ )%‰‱$€£¥\u00a0\u202f]*$/u.test(text);
const simpleWrapper = (text: string) => /^[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{Script=Common}\p{Script=Inherited}]*$/u.test(text);
function numericTemplates(snapshot: LetteringSnapshot, font: string): [string, string][] {
  const out: [string, string][] = [];
  for (const key of Object.keys(snapshot.runs)) {
    const [family, text] = JSON.parse(key) as [string, string];
    if (family !== font) continue;
    for (const match of text.matchAll(/[+\-−]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+\-−]?\d+)?/gu)) {
      const prefix = text.slice(0, match.index), suffix = text.slice(match.index + match[0].length);
      if (simpleWrapper(prefix) && simpleWrapper(suffix)) out.push([prefix, suffix]);
    }
  }
  return out;
}
function isNumericReplay(text: string, templates: readonly [string, string][]): boolean {
  return isNumericText(text) || templates.some(([prefix, suffix]) => text.startsWith(prefix) && text.endsWith(suffix)
    && text.length > prefix.length + suffix.length && isNumericText(text.slice(prefix.length, text.length - suffix.length)));
}
interface ReplayState {
  ready?: Promise<void>;
  /** Unit-size shapers for numeric replay, by run family: 'sans', 'mono', or a cut such as 'sans/bold'. */
  chains: Record<string, (text: string, size: number) => ShapedRun>;
  templates: Record<string, [string, string][]>;
}
const replays = new WeakMap<LetteringSnapshot, ReplayState>();
export const scriptFaceNames: Readonly<Record<string, string>> = {
  Arab: 'noto-naskh-arabic', Deva: 'noto-sans-devanagari', Hebr: 'noto-sans-hebrew',
  Hani: 'noto-sans-sc', ...Object.fromEntries(LETTERING_SCRIPTS.map((script) => [script, 'inter'])),
};
/** The registry face a family's cuts come from when the request names none. */
export const defaultCutFace: Readonly<Record<FontName, string>> = { sans: 'inter', mono: 'jetbrains-mono' };
/**
 * The cuts a script face may stand in with for `cut`, best first. Scripts in
 * the registry have no italic, so italic text in them draws upright; bold has
 * no stand-in, so a script face without a Bold cut cannot draw bold text.
 */
export const scriptCuts = (cut: LetteringCut): LetteringCut[] =>
  cut === 'italic' ? ['italic', ''] : cut === 'bold-italic' ? ['bold-italic', 'bold'] : [cut];
/** The cuts a request allows: the regular cut, and each combination of its styles. */
export function requestCuts(request: LetteringRequest): LetteringCut[] {
  const bold = request.styles?.includes('bold'), italic = request.styles?.includes('italic');
  return ['', ...(bold ? ['bold' as const] : []), ...(italic ? ['italic' as const] : []), ...(bold && italic ? ['bold-italic' as const] : [])];
}
export function snapshotProvider(stored: StoredLetteringSnapshot): LetteringProvider {
  const snapshot = unpackLettering(stored);
  let replay = replays.get(snapshot);
  if (!replay) replays.set(snapshot, replay = { chains: {}, templates: {} });
  const state = replay;
  const lookup = (font: string, text: string, size: number, display = false) => {
    const run = snapshot.runs[runKey(font, text, display)];
    if (run) return scaledRun(run, size);
    if (font !== 'math' && state.chains[font]
      && isNumericReplay(text, state.templates[font] ?? [])) {
      const numeric = state.chains[font](text, 1);
      if (numeric.glyphs.some((g) => g.gid === 0)) throw new Error(`new Text(): the lettering snapshot's numerals cannot draw ${JSON.stringify(text)}; run rayner snapshots`);
      return scaledRun(numeric, size);
    }
    throw new Error(`new Text(): the lettering snapshot has no run for ${JSON.stringify(text)} (${font}); run rayner snapshots`);
  };
  return {
    prepare() {
      return state.ready ??= (async () => {
        const families = requestCuts(snapshot.request).flatMap((cut) => (['sans', 'mono'] as const).flatMap((font) => {
          const family = cutFace(font, cut);
          state.templates[family] = numericTemplates(snapshot, family);
          return (cut ? state.templates[family].length : snapshot.request.faces?.[font] || state.templates[family].length)
            ? [{ font, cut, family }] : [];
        }));
        if (!families.length) return;
        const embedded = await embeddedFaces();
        const scriptNames = [...new Set((snapshot.request.scripts ?? []).flatMap((script) => scriptFaceNames[script] ?? []))];
        const decoded = new Map<string, Promise<Font>>();
        const face = (name: string) => {
          let f = decoded.get(name);
          if (!f) decoded.set(name, f = decodeFont(snapshot.faces[name]!.data, `scene.lettering.json: the subset of ${name}`));
          return f;
        };
        for (const { font, cut, family } of families) {
          // The order capture shaped in (tools/lib/lettering.ts): the requested cut,
          // the scripts' nearest cuts, then the embedded faces.
          const scripts = await Promise.all(scriptNames.flatMap((name) => {
            const found = scriptCuts(cut).map((c) => cutFace(name, c)).find((n) => snapshot.faces[n]);
            return found ? [face(found)] : [];
          }));
          const name = cut ? cutFace(snapshot.request.faces?.[font] ?? defaultCutFace[font], cut) : snapshot.request.faces?.[font];
          let chain: Font[];
          if (name) {
            if (!snapshot.faces[name]) throw new Error(`scene.lettering.json: it has no subset for the requested face ${name}; run rayner snapshots`);
            chain = [await face(name), ...scripts, ...embeddedChain(embedded, font)];
          } else {
            const [own, ...rest] = embeddedChain(embedded, font);
            chain = [own!, ...scripts, ...rest];
          }
          state.chains[family] = memoShaper(chain, family);
        }
      })();
    },
    request: snapshot.request,
    shape: (font, text, size, fallback, cut = '') => usesLettering(snapshot.request, font, text, cut)
      ? lookup(cutFace(font, cut), text, size) : fallback(text, size),
    math: (text, size, display) => lookup('math', text, size, display),
  };
}

/** One service per provider; each Text retains its own service through copy and replay. */
const contexts = new WeakMap<LetteringProvider, TextShaping>();
function cutOf(text: Text, provider: LetteringProvider): LetteringCut {
  if (text[formulaOf]) return '';
  const bold = text.weight === 'bold' && !!provider.request?.styles?.includes('bold');
  return text.italic ? (bold ? 'bold-italic' : 'italic') : bold ? 'bold' : '';
}
/** The source mapping used by Text: grapheme-based tab stops, code-point clusters. */
function spanForm(text: Text): { shaped: string; source: number[] } {
  const { text: shaped, source } = expandTabs(text.text, text.tabWidth);
  return { shaped, source };
}

// Each text retains its shaping service, including spans queried after its
// scene finishes or on a copied Code line.
/**
 * Matching keys for the glyphs of a Text built from lettering runs: the whole
 * cluster each glyph draws (a conjunct, a ligature, a letter with its marks),
 * and how many glyphs draw it. TransformMatchingText then pairs a glyph only
 * with a glyph of the same cluster drawn the same way, so a cluster whose
 * glyphs change (क to the conjunct क्ष) fades out and in instead of morphing
 * one glyph into another. Keys by source index into the Text's text; recomputed
 * when the text changes.
 */
const clusterKeys = new WeakMap<Text, { text: string; keys: Map<number, string> }>();
/**
 * A Text's run as its build shaped it, with each glyph's cluster as a source
 * index into its text; undefined for a Text built with no provider, or drawn
 * from a given run (maths), whose clusters are not source indices.
 */
function sourceRun(text: Text): {run: Run; clusters: number[]} | undefined {
  if (!text.shaping || text[formulaOf]) return undefined;
  const form = spanForm(text), run = text.shapeRun(form.shaped, text[textRun].fontSize);
  return {run, clusters: run.glyphs.map(g => form.source[g.cluster] ?? text.text.length)};
}
function clusterKey(text: Text, cluster: number): string | undefined {
  let memo = clusterKeys.get(text);
  if (!memo || memo.text !== text.text) {
    const shaped = sourceRun(text);
    if (!shaped) return undefined;
    const {run, clusters: starts} = shaped, cut = text.italic ? (text.weight === 'bold' ? 'bold-italic' : 'italic') : text.weight === 'bold' ? 'bold' : '';
    const sorted = [...new Set(starts)].sort((a, b) => a - b);
    // Only glyphs with outlines become the Text's children, so only they count
    const counts = new Map<number, number>();
    run.glyphs.forEach((g, i) => { if (g.path?.length) counts.set(starts[i]!, (counts.get(starts[i]!) ?? 0) + 1); });
    const keys = new Map<number, string>();
    sorted.forEach((start, i) => keys.set(start,
      `${text.font} ${text.weight}${cut ? ' ' + cut : ''} ${text.text.slice(start, sorted[i + 1] ?? text.text.length)} ×${counts.get(start) ?? 0}`));
    clusterKeys.set(text, memo = { text: text.text, keys });
  }
  return memo.keys.get(cluster);
}

function spanBox(span: CodeSpan): Box | undefined {
  const text = span.owner, form = spanForm(text), shaped = sourceRun(text);
  if (!shaped) return undefined;
  const {run, clusters} = shaped;
  const rtl = clusters.some((cluster, i) => i > 0 && cluster < clusters[i - 1]!);
  if (!rtl) return undefined;
  const starts = [...new Set(clusters)].sort((a, b) => a - b);
  const endOf = (cluster: number) => starts.find((start) => start > cluster) ?? text.text.length;
  const selected = span.from === span.to ? []
    : run.glyphs.filter((_, i) => clusters[i]! < span.to && endOf(clusters[i]!) > span.from);
  const frame = text[advanceBox], scale = run.width ? (frame[2]! - frame[0]!) / run.width : 0;
  let left = Infinity, right = -Infinity;
  for (const glyph of selected) {
    const a = frame[0]! + glyph.x * scale, b = frame[0]! + (glyph.x + glyph.ax) * scale;
    left = Math.min(left, a, b); right = Math.max(right, a, b);
  }
  if (!selected.length) {
    // A zero-width range is a caret at the logical boundary, including RTL ends.
    const logical = starts.find((start) => endOf(start) > span.from) ?? starts.at(-1);
    const cell = run.glyphs.filter((_, i) => clusters[i] === logical);
    const next = starts.find((start) => start > (logical ?? 0));
    const previous = [...starts].reverse().find((start) => start < (logical ?? 0));
    const position = (cluster: number | undefined) => run.glyphs.find((_, i) => clusters[i] === cluster)?.x;
    const here = position(logical) ?? 0;
    const clusterText = logical === undefined ? '' : text.text.slice(logical, endOf(logical));
    const previousDelta = previous === undefined ? undefined : here - position(previous)!;
    const nextDelta = next === undefined ? undefined : position(next)! - here;
    const delta = previousDelta === undefined ? nextDelta : nextDelta === undefined ? previousDelta
      : Math.abs(previousDelta) < Math.abs(nextDelta) ? previousDelta : nextDelta;
    const backwards = (RTL_LETTER.test(clusterText) && /\p{L}/u.test(clusterText)) || (delta ?? 0) < 0;
    const x0 = cell.length ? Math.min(...cell.map((g) => g.x)) : 0;
    const x1 = cell.length ? Math.max(...cell.map((g) => g.x + g.ax)) : run.width;
    const atEnd = span.from >= (logical === undefined ? 0 : endOf(logical));
    left = right = frame[0]! + (backwards !== atEnd ? x1 : x0) * scale;
  }
  const result: Box = [left, frame[1]!, right, frame[3]!];
  const selectedClusters = new Set(selected.map((glyph) => form.source[glyph.cluster] ?? text.text.length));
  const inkGlyphs = text.children.filter((glyph) => selectedClusters.has((glyph as { cluster?: number }).cluster ?? -1));
  return unionBoxes([result, ...inkGlyphs.map((glyph) => glyph.box())])!;
}
export function textShaping(provider: LetteringProvider): TextShaping {
  let context = contexts.get(provider);
  if (!context) {
    context = {
      prepare: provider.prepare?.bind(provider),
      shape(owner, text, size) {
        if (owner.italic && !provider.request?.styles?.includes('italic'))
          throw new Error("new ItalicText(): it needs meta.lettering.styles to include 'italic', and a fresh lettering snapshot (rayner snapshots)");
        return owner[formulaOf] ? provider.math(text, size, owner[formulaOf].display)
          : provider.shape(owner.font, text, size, embeddedShaperFor(owner.font), cutOf(owner, provider));
      },
      realBold: owner => cutOf(owner, provider).startsWith('bold'),
      spanBox,
      clusterKey,
    };
    contexts.set(provider, context);
  }
  return context;
}
/** Build-time text outside a run can opt into the same retained shaping service. */
export function withSceneLettering<T>(Source: object, work: () => Promise<T>): Promise<T> {
  return withTextContext(Source, work);
}
export function bindLettering<C extends SceneClass>(Source: C, provider: LetteringProvider | StoredLetteringSnapshot,
  {explicit = (Source as {meta?: {textContext?: string}}).meta?.textContext === 'explicit'}: {explicit?: boolean} = {}): C {
  const Bound = class extends (Source as SceneClass) {};
  bindTextContext(Bound, textShaping('version' in provider ? snapshotProvider(provider) : provider), explicit);
  return Bound as C;
}

/** Keep the existing Latin/Greek/Cyrillic subset workflow unless more is requested. */
export function usesOutlineLettering(Source: object): boolean {
  const r = letteringOf(Source);
  return !!r && (Object.hasOwn(r, 'faces') || Object.hasOwn(r, 'math') || Object.hasOwn(r, 'styles') ||
    (Array.isArray(r.scripts) && r.scripts.some((s) => !(LETTERING_SCRIPTS as readonly string[]).includes(s))));
}
