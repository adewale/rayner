// Rendering: a scene becomes a flat list of element records (one per leaf
// mobject, in draw order), which either serializes to an SVG string (no DOM
// needed: Workers, Node, tests) or patches a live DOM (browser).

import { VMobject, pathData } from './vmobject.ts';
import type { PathData } from './vmobject.ts';
import type { Box, Mobject, StyleRecord } from './mobject.ts';
import { mergeLeaves, mobjectId } from './mobject.ts';
import type { Scene, Sink } from './scene.ts';
import { perf } from './perf.ts';
import { isHex } from './color.ts';
import { FRAME, STAGE_BOX, UNITS } from './units.ts';

/** A length in integer user units. */
const len = (x: number): string => '' + Math.round(x * UNITS);
/** A world box in user units, [left, top, right, bottom] with y down, unrounded: what the SVG draws it as. */
export const userBox = (b: Readonly<Box>): Box => [b[0] * UNITS, -b[3] * UNITS, b[2] * UNITS, -b[1] * UNITS];
/** A world box as a user-unit rect [x, y, width, height]: model y is up, SVG y is down, so y flips here. */
const userRect = (b: Readonly<Box>): string[] => [len(b[0]), len(-b[3]), len(b[2] - b[0]), len(b[3] - b[1])];
/** Camera: the viewBox is the scene's frame box (16 × 9 at the origin unless the camera moved). */
const viewBoxOf = (scene: Scene): string => userRect(scene.frame.box()!).join(' ');
/** The camera's home viewBox: the whole stage, in user units. */
export const VIEWBOX = userRect(STAGE_BOX).join(' ');
/** Whether a camera box is the home box, to within float noise from an animated camera. */
export const atHome = (view: Readonly<Box>): boolean => view.every((v, i) => Math.abs(v - STAGE_BOX[i]!) < 1e-6);
/** The box of the world on screen: the camera's (`scene.frame`), which the SVG viewBox shows; without one, the whole stage. A new box. */
export const viewOf = (scene: { frame?: { box(): Box | null } }): Box => [...(scene.frame?.box() ?? STAGE_BOX)] as Box;

const fmt = (x: number): string => (Math.round(x * 1000) / 1000).toString();

/** SVG attributes, in emission order. */
export type Attrs = Record<string, string>;

/** One drawable element. Never mutated after creation, except to memoize `svg`. */
export interface ElementRecord {
  id: number;
  tag: string;
  attrs: Attrs;
  transform: string | null;
  tx?: number;
  ty?: number;
  text: string | null;
  /** Immutable inherited world-coordinate clip used by both renderers. */
  clipBox?: Box;
  /** The serialized element, filled in by toSvgString. */
  svg?: string;
}

/** Per-VMobject record memo (see attrsCache): the style and path it was built from. */
interface AttrsCache {
  paint: string;
  id: number;
  d: string;
  fill: string;
  fillOpacity: number;
  stroke: string;
  strokeWidth: number;
  strokeOpacity: number;
  opacity: number;
  drawFraction: number | undefined;
  attrs: Attrs;
  rec: ElementRecord | null;
}

/** Per-group memo for a merged line of glyphs (see mergedCache): one entry per run of equal style. */
interface MergedCache { runs: MergedRun[] }
interface MergedRun {
  id: number;
  start: number;
  pds: Array<PathData | null>;
  fill: string;
  fillOpacity: number;
  stroke: string;
  strokeWidth: number;
  strokeOpacity: number;
  opacity: number;
  rec: ElementRecord;
}

export interface RenderOptions {
  /** Relative path data + translate (strings) or absolute (DOM); see VMobject.pathData. */
  relative?: boolean;
  /**
   * Leave out what the camera cannot show. Off by default: sinks that patch a DOM
   * keep one element per mobject. PNG output turns it on, because resvg
   * 2.6 aborts on an element with `opacity` whose visible box is empty, and with a
   * camera a fading mobject can sit entirely outside the view. A pure function of
   * the state, like everything else here: seeks are unaffected.
   */
  cull?: boolean;
  /** Pixel width of the output the cull is for (default 1280): it keeps anything showing 2 or more of its pixels. */
  width?: number;
}

/** One record per drawable leaf: { id, tag, attrs, text }. */
export function renderElements(scene: Scene, { relative = true, cull = false, width = 1280 }: RenderOptions = {}): ElementRecord[] {
  return perf.span('render.elements', () => renderElementsImpl(scene, relative, cull, width));
}
function renderElementsImpl(scene: Scene, relative: boolean, cull: boolean, width: number): ElementRecord[] {
  const out: ElementRecord[] = [];
  const view = cull ? scene.frame.box()! : null;
  // Culled: the mobject's box, grown by its stroke, leaves less than 2 output pixels
  // of the view in some direction. That drops everything the camera has left (the
  // empty visible box resvg aborts on) and, at most, a strip under 2 px at the
  // frame's edge (resvg would paint it, faintly). A group is skipped whole only
  // when it clears the view by a generous margin, since its stroke widths are its leaves'.
  const unseen = (m: Mobject, margin: number): boolean => {
    const b = m.box();
    if (!b || !view) return false;
    const px = 2 * (view[2] - view[0]) / width;
    return b[2] + margin - view[0] < px || view[2] - (b[0] - margin) < px || b[3] + margin - view[1] < px || view[3] - (b[1] - margin) < px;
  };
  const walk = (m: Mobject, inherited?: Clip): void => {
    if (view && unseen(m, m.children.length ? 0.5 : m.style.stroke === 'none' ? 0 : m.style.strokeWidth / 2)) return;
    const clip = m.clipBox ? clipFor(m.clipBox, inherited?.box) : inherited;
    const emit = (rec: ElementRecord): void => { out.push(clip ? clippedRecord(rec, clip) : rec); };
    // A child-specific viewport cannot be lost by merging its parent.
    if (!relative && m[mergeLeaves] && !m.children.some((c) => c.clipBox)) {
      const merged = mergedRecords(m);
      if (merged !== undefined) { for (const rec of merged) emit(rec); return; }
    }
    // A leaf wholly outside its clip draws nothing, so it is not written. Some rasterizers
    // (resvg 2.6) abort on a translucent element whose clip leaves it no area at all.
    if (clip && !m.children.length) {
      const b = m.box(), w = m.style.strokeWidth, c = clip.box;
      if (b && (b[2] + w < c[0] || b[0] - w > c[2] || b[3] + w < c[1] || b[1] - w > c[3])) return;
    }
    // A translated path would translate its userSpaceOnUse clip as well.
    const rec = elementFor(m, clip ? false : relative);
    if (rec) emit(rec);
    for (const c of m.children) walk(c, clip);
  };
  for (const top of scene.mobjects) walk(top);
  return out;
}

/** A fixed rectangular viewport, resolved once per clipped group. */
interface Clip { box: Box; id: string; attrs: Attrs }
function clipFor(box: Box, parent?: Box): Clip {
  if (box.length !== 4 || !box.every(Number.isFinite) || box[0] > box[2] || box[1] > box[3])
    throw new RangeError('m.clipBox: it must be a finite, ordered box in world coordinates, [minX, minY, maxX, maxY]');
  if (parent) {
    const x = Math.max(box[0], parent[0]), y = Math.max(box[1], parent[1]);
    box = [x, y, Math.max(x, Math.min(box[2], parent[2])), Math.max(y, Math.min(box[3], parent[3]))];
  }
  const coords = userRect(box);
  return {box, id: 'rayner-clip-' + coords.join('_'), attrs: {x:coords[0]!,y:coords[1]!,width:coords[2]!,height:coords[3]!}};
}
const serializeClip = (c: Clip): string => `<clipPath id="${c.id}" clipPathUnits="userSpaceOnUse"><rect${serializeAttrs(c.attrs)}/></clipPath>`;
/** The `<clipPath>` a record clipped to `clipBox` (ElementRecord.clipBox) refers to, as toSvgString writes it. */
export const clipPathOf = (clipBox: Box): { id: string; svg: string } => {
  const c = clipFor(clipBox);
  return { id: c.id, svg: serializeClip(c) };
};
const clippedRecords = new WeakMap<ElementRecord, {id:string; rec:ElementRecord}>();
function clippedRecord(rec: ElementRecord, clip: Clip): ElementRecord {
  const cached = clippedRecords.get(rec);
  if (cached?.id === clip.id) return cached.rec;
  // A single last-value cache stays bounded when an updater changes the viewport.
  const clipped: ElementRecord = {...rec, attrs:{...rec.attrs,'clip-path':`url(#${clip.id})`}, clipBox:[...clip.box]};
  delete clipped.svg;
  clippedRecords.set(rec,{id:clip.id,rec:clipped});
  return clipped;
}
function clipsOf(els: readonly ElementRecord[]): Clip[] {
  const clips = new Map<string,Clip>();
  for(const el of els) if(el.clipBox){const clip=clipFor(el.clipBox);clips.set(clip.id,clip);}
  return [...clips.values()];
}

/**
 * Records are memoized per mobject, in two layers:
 *  - `attrs` (path data + style) is reused while the shape string and style
 *    fields are unchanged, and its serialized form is cached alongside;
 *  - the record itself ({ id, tag, attrs, transform }) is reused while the
 *    translation is also unchanged.
 * A rigidly moving path therefore costs one small object and one short string
 * per frame, and an unchanged one costs a few comparisons. Records are never
 * mutated after creation, so they can be kept per frame (see Recording).
 */
/** Each path's record memo, and each merged group's: the renderer's own, so no field of a mobject holds them. */
const attrsCache = new WeakMap<VMobject, AttrsCache>(), mergedCache = new WeakMap<Mobject, MergedCache>();

function elementFor(m: Mobject, relative: boolean): ElementRecord | null {
  const s = m.style;
  if (s.opacity <= 0) return null;
  if (m instanceof VMobject) {
    if (!m.hasPoints()) return null;
    const pd = pathData(m, relative);
    const paint = JSON.stringify([s.lineCap, s.lineJoin, s.fillRule, s.dashArray, s.dashOffset, s.miterLimit, s.paintOrder]);
    let k = attrsCache.get(m), id = mobjectId(m);
    if (!(k && k.paint === paint && k.id === id && k.d === pd.d && k.fill === s.fill && k.fillOpacity === s.fillOpacity && k.stroke === s.stroke &&
        k.strokeWidth === s.strokeWidth && k.strokeOpacity === s.strokeOpacity && k.opacity === s.opacity && k.drawFraction === s.drawFraction)) {
      perf.count('attrs miss');
      attrsCache.set(m, k = { paint, id, d: pd.d, fill: s.fill, fillOpacity: s.fillOpacity, stroke: s.stroke, strokeWidth: s.strokeWidth, strokeOpacity: s.strokeOpacity, opacity: s.opacity, drawFraction: s.drawFraction, attrs: vmobjectAttrs(m, s, pd), rec: null });
    }
    if (k.rec && k.rec.tx === pd.tx && k.rec.ty === pd.ty) { perf.count('element hit'); return k.rec; }
    perf.count('element moved');
    return (k.rec = { id, tag: 'path', attrs: k.attrs, transform: pd.tx || pd.ty ? 'translate(' + pd.tx + ' ' + pd.ty + ')' : null, tx: pd.tx, ty: pd.ty, text: null });
  }
  return null;
}

/**
 * One <path> per run of same-styled leaves: the leaves' path data
 * concatenated. Per-element costs in the browser (style recalc, layout, paint
 * invalidation) scale with element count, and the playback trace showed every
 * late frame was one writing hundreds of glyph elements at once: a code block
 * fading in (740 attribute writes per frame) or morphing (317). A line of glyphs
 * almost always shares one style, so this is one element per line, keyed by
 * the group's id; a syntax-coloured line is one element per colour run, each
 * keyed by its first leaf's id. Invisible runs emit nothing. Returns undefined
 * when a leaf needs its own element (a partial draw during Write, or paint
 * attributes) so the caller falls back to one element per leaf.
 */
function mergedRecords(g: Mobject): ElementRecord[] | undefined {
  const kids = g.children;
  for (const c of kids) {
    if (!(c instanceof VMobject) || c.children.length) return undefined;
    const s = c.style;
    if (s.drawFraction != null || s.lineCap || s.lineJoin || s.fillRule || s.dashArray || s.paintOrder) return undefined;
  }
  // Every child is a VMobject: the loop above returned otherwise
  const leaves = kids as VMobject[], old = mergedCache.get(g)?.runs, runs: MergedRun[] = [], out: ElementRecord[] = [];
  for (let i = 0, j = 0; i < leaves.length; i = j) {
    const s0 = leaves[i]!.style;
    for (j = i + 1; j < leaves.length; j++) {
      const s = leaves[j]!.style;
      if (s.fill !== s0.fill || s.fillOpacity !== s0.fillOpacity || s.stroke !== s0.stroke || s.strokeWidth !== s0.strokeWidth ||
          s.strokeOpacity !== s0.strokeOpacity || s.opacity !== s0.opacity) break;
    }
    if (s0.opacity <= 0) continue;
    const id = mobjectId(i === 0 && j === leaves.length ? g : leaves[i]!);
    const pds: Array<PathData | null> = [];
    for (let n = i; n < j; n++) pds.push(leaves[n]!.hasPoints() ? pathData(leaves[n]!, false) : null);
    let k = old?.[runs.length];
    if (k && k.id === id && k.start === i && k.pds.length === pds.length && k.pds.every((p, n) => p === pds[n]) && k.fill === s0.fill &&
        k.fillOpacity === s0.fillOpacity && k.stroke === s0.stroke && k.strokeWidth === s0.strokeWidth && k.strokeOpacity === s0.strokeOpacity && k.opacity === s0.opacity) {
      perf.count('merged hit');
    } else {
      perf.count('merged miss');
      const d = pds.map((p) => (p ? p.d : '')).join('');
      const rec: ElementRecord = { id, tag: 'path', attrs: vmobjectAttrs(leaves[i]!, s0, { d }), transform: null, text: null };
      k = { id, start: i, pds, fill: s0.fill, fillOpacity: s0.fillOpacity, stroke: s0.stroke, strokeWidth: s0.strokeWidth, strokeOpacity: s0.strokeOpacity, opacity: s0.opacity, rec };
    }
    runs.push(k);
    out.push(k.rec);
  }
  mergedCache.set(g, { runs });
  return out;
}

function vmobjectAttrs(m: VMobject, s: StyleRecord, pd: { d: string }): Attrs {
  {
    const attrs: Attrs = {
      d: pd.d,
      fill: s.fill,
      'fill-opacity': fmt(s.fillOpacity),
      stroke: s.stroke,
    };
    // WebKit can paint a hairline on fill-only glyphs if stroke attributes
    // accompany stroke="none". Emit stroke paint only when a stroke exists.
    if (s.stroke !== 'none') {
      attrs['stroke-width'] = len(s.strokeWidth);
      attrs['stroke-opacity'] = fmt(s.strokeOpacity);
      attrs['stroke-linejoin'] = s.lineJoin ?? 'round';
      attrs['stroke-linecap'] = s.lineCap ?? 'round';
    }
    if (s.fillRule) attrs['fill-rule'] = s.fillRule;
    const dashes = s.stroke === 'none' ? null : dashPattern(s.dashArray);
    if (dashes) {
      attrs['stroke-dasharray'] = dashes.map(len).join(' ');
      if (s.dashOffset) attrs['stroke-dashoffset'] = len(s.dashOffset);
    }
    if (s.stroke !== 'none' && s.miterLimit != null) attrs['stroke-miterlimit'] = fmt(s.miterLimit);
    if (s.paintOrder) attrs['paint-order'] = s.paintOrder;
    if (s.opacity < 1) attrs.opacity = fmt(s.opacity);
    if (s.stroke !== 'none' && s.drawFraction != null && s.drawFraction < 1) {
      const L = perf.span('arcLength', () => m.arcLength()) + 0.001;
      const revealed = dashes ? dashedReveal(dashes, s.dashOffset ?? 0, L, s.drawFraction) : null;
      if (revealed) {
        // A dashed stroke stays dashed while it is drawn: its own pattern up to the
        // drawn length, then one gap past the end
        attrs['stroke-dasharray'] = revealed;
        delete attrs['stroke-dashoffset'];
      } else {
        attrs['stroke-dasharray'] = len(L);
        attrs['stroke-dashoffset'] = len(L * (1 - s.drawFraction));
      }
    }
    return attrs;
  }
}

/**
 * A dash list as numbers (scene units), or null when it draws a solid line: SVG lists
 * are numbers split by spaces and/or commas, and a list that is empty, 'none',
 * negative, non-finite or sums to zero is solid. (An odd list repeats to an even one.)
 */
function dashPattern(list: string | undefined): number[] | null {
  if (!list) return null;
  const parts = list.trim().split(/[\s,]+/).filter((v) => v !== '');
  if (!parts.length || parts[0] === 'none') return null;
  const nums = parts.map(Number);
  if (nums.some((v) => !Number.isFinite(v) || v < 0) || !(nums.reduce((a, b) => a + b, 0) > 0)) return null;
  return nums;
}

/** Most dash entries a partly drawn dashed stroke may emit before it is drawn solid instead. */
const MAX_REVEAL_DASHES = 4096;

/**
 * The dash list that shows `pattern` (phase `offset`) along the first `fraction`
 * of a path `total` long, and nothing after: on/off lengths in integer units,
 * from boundaries rounded once each so many short dashes do not drift.
 */
function dashedReveal(list: readonly number[], offset: number, total: number, fraction: number): string | null {
  const pattern = list.length % 2 ? [...list, ...list] : list;
  const drawn = total * Math.max(0, fraction);
  const period = pattern.reduce((a, b) => a + b, 0);
  let phase = ((offset % period) + period) % period, j = 0;
  while (phase >= pattern[j]!) { phase -= pattern[j]!; j = (j + 1) % pattern.length; }
  // Boundaries along the path where the stroke turns on or off, starting "on"
  const marks: number[] = [];
  let at = 0, on = j % 2 === 0;
  if (!on) marks.push(0); // starts in a gap: a zero-length dash first
  let left = pattern[j]! - phase;
  while (at + left < drawn) {
    at += left;
    marks.push(at);
    if (marks.length > MAX_REVEAL_DASHES) return null;
    j = (j + 1) % pattern.length; on = !on; left = pattern[j]!;
  }
  if (on) marks.push(drawn);
  // marks alternate end-of-dash, end-of-gap, ...; the last gap runs past the path's end
  const ints = marks.map((x) => Math.round(x * UNITS));
  const out: number[] = [];
  let prev = 0;
  for (const x of ints) { out.push(x - prev); prev = x; }
  if (out.length % 2) out.push(Math.round(total * UNITS) + UNITS);
  else out[out.length - 1]! += Math.round(total * UNITS) + UNITS;
  return out.join(' ');
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

/** XML 1.0 Char, excluding the surrogate range (those are checked as pairs). */
function xmlCharOk(code: number): boolean {
  return code === 0x9 || code === 0xa || code === 0xd || (code >= 0x20 && code <= 0xd7ff) || (code >= 0xe000 && code <= 0xfffd);
}

/**
 * Attribute and text data: drop code points XML 1.0 cannot represent, then
 * escape the four markup characters. A value with nothing to change is returned
 * as-is (path data and colours take this path).
 */
function esc(v: string): string {
  let dirty = false;
  for (let i = 0; i < v.length; i++) {
    const c = v.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const d = v.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) { i++; continue; }
    }
    if (c === 38 || c === 60 || c === 62 || c === 34 || !xmlCharOk(c)) { dirty = true; break; }
  }
  if (!dirty) return v;
  let out = '';
  for (let i = 0; i < v.length; i++) {
    const c = v.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const d = v.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) { out += v[i]! + v[i + 1]!; i++; continue; }
    }
    if (!xmlCharOk(c)) continue;
    const ch = v[i]!;
    out += Object.hasOwn(ESCAPES, ch) ? ESCAPES[ch]! : ch;
  }
  return out;
}

const attrStrings = new WeakMap<Attrs, string>(); // attrs object -> ' k="v" ...'
function serializeAttrs(attrs: Attrs): string {
  let s = attrStrings.get(attrs);
  if (s === undefined) {
    s = '';
    for (const k of Object.keys(attrs)) s += ` ${k}="${esc(attrs[k] ?? '')}"`;
    attrStrings.set(attrs, s);
  }
  return s;
}
/** One element record as SVG markup, as toSvgString writes it. */
export function serializeElement(el: ElementRecord): string {
  const t = el.transform ? ` transform="${esc(el.transform)}"` : '';
  return `<${el.tag}${t}${serializeAttrs(el.attrs)}` + (el.text == null ? '/>' : `>${esc(el.text)}</${el.tag}>`);
}

export interface SvgOptions {
  /** Positive safe-integer pixel width; height follows the 16:9 frame. */
  width?: number;
  /** #rgb or #rrggbb, normalized to lowercase #rrggbb. Default: the scene's paper (`scene.colors.paper`). */
  background?: string;
  /** Leave out what the camera cannot show; see RenderOptions. */
  cull?: boolean;
}

export function toSvgString(scene: Scene, { width = 1280, background = scene.colors.paper, cull = false }: SvgOptions = {}): string {
  if (typeof width !== 'number' || !Number.isSafeInteger(width) || width < 1)
    throw new TypeError('toSvgString(): width must be a positive safe integer');
  if (!isHex(background))
    throw new TypeError('toSvgString(): background must be a #rgb or #rrggbb colour');
  const hex = background.slice(1).toLowerCase();
  background = '#' + (hex.length === 3 ? [...hex].map((ch) => ch + ch).join('') : hex);
  const height = Number((BigInt(width) * BigInt(FRAME.h) + BigInt(FRAME.w / 2)) / BigInt(FRAME.w));
  // Camera: the viewBox follows the frame; the background rect fills whatever it shows
  const [vx, vy, vw, vh] = userRect(scene.frame.box()!);
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${vx} ${vy} ${vw} ${vh}">`;
  s += `<rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="${background}"/>`;
  const els = renderElements(scene, { cull, width });
  const end = perf.begin('render.serialize');
  const parts = [s];
  const clips = clipsOf(els);
  if (clips.length) parts.push('<defs>',...clips.map(serializeClip),'</defs>');
  for (const el of els) parts.push(el.svg ??= serializeElement(el));
  parts.push('</svg>');
  end();
  return parts.join('');
}

// ---- sinks ---------------------------------------------------------------

/** Collects every frame as an SVG string. Works anywhere JS runs. */
export class StringSink implements Sink {
  readonly #opts: SvgOptions;
  readonly frames: string[];
  constructor(opts: SvgOptions = {}) { this.#opts = opts; this.frames = []; }
  async frame(scene: Scene): Promise<void> { this.frames.push(toSvgString(scene, this.#opts)); }
  last(): string | undefined { return this.frames[this.frames.length - 1]; }
}

/** Keeps only the latest frame; cheap when you only want a snapshot. */
export class SnapshotSink implements Sink {
  readonly #opts: SvgOptions;
  svg: string;
  constructor(opts: SvgOptions = {}) { this.#opts = opts; this.svg = ''; }
  async frame(scene: Scene): Promise<void> { this.svg = toSvgString(scene, this.#opts); }
}

/** DomSink's per-element state: the live node and what was last written to it. */
interface DomNode {
  el: Element;
  attrs: Attrs;
  text: string | null;
  rec: ElementRecord | null;
  transform?: string | null;
  attrsRef?: Attrs;
}

/** The longest a live DomSink goes without a patch while it drops late frames, in milliseconds. */
const MAX_FREEZE_MS = 100;

/**
 * @internal DomSink's hook that brings the DOM to exactly these records (one frame), and the viewBox to
 * the camera's when given: the player's close-up sink overrides it to draw records without a frame
 * and to map the camera. A symbol, so no member an author writes on a subclass shares its name.
 */
export const applyRecords = Symbol('apply');

/**
 * Patches a live <svg> in place: one stable element per mobject, attributes
 * diffed, elements reordered only when draw order changes. Paces frames to
 * real time with requestAnimationFrame.
 */
export class DomSink implements Sink {
  readonly #doc: Document;
  readonly svg: SVGSVGElement;
  readonly #NS = 'http://www.w3.org/2000/svg';
  /** Each mobject's element, by the mobject's id. */
  readonly #nodes = new Map<number, DomNode>();
  readonly #realtime: boolean;
  /** When scene time 0 is due on the wall clock, or null to anchor at the next frame. */
  #anchor: number | null = null;
  #lastPatch = 0;
  #defs: SVGDefsElement | null = null;
  #clipSignature = '';
  /** Camera: the viewBox last written, so an unchanged camera costs no DOM write. */
  #viewBox = VIEWBOX;

  /** The background given at construction; without one the SVG takes the scene's paper at each frame. */
  readonly #background: string | undefined;

  constructor(container: Element, { background, realtime = true }: { background?: string; realtime?: boolean } = {}) {
    // A container in a live document always has one
    this.#doc = container.ownerDocument!;
    this.svg = this.#doc.createElementNS(this.#NS, 'svg');
    this.svg.setAttribute('viewBox', VIEWBOX);
    this.#background = background;
    if (background !== undefined) this.svg.style.background = background;
    this.svg.style.width = '100%';
    this.svg.style.display = 'block';
    container.appendChild(this.svg);
    this.#realtime = realtime;
  }

  /**
   * Real-time pacing, driven by requestAnimationFrame against a wall-clock
   * schedule (scene time t is due at anchor + t). Each frame is patched in the
   * animation frame it's due in, so frames land on vsync; when the scene falls
   * more than a frame behind, that frame's DOM patch is dropped instead of
   * slowing playback, but never for longer than MAX_FREEZE_MS. A stall longer
   * than 250ms (a pause, a hidden tab) re-anchors the schedule.
   */
  async frame(scene: Scene, dt = 0): Promise<void> {
    if (!this.#realtime || dt === 0) { this.#anchor = null; this.#patch(scene); return; }
    const now = performance.now();
    if (this.#anchor != null && now - (this.#anchor + scene.time * 1000) > 250) this.#anchor = null;
    if (this.#anchor != null && now > this.#anchor + scene.time * 1000 + dt * 1000 && now - this.#lastPatch < MAX_FREEZE_MS) {
      perf.count('frames dropped');
      return;
    }
    // Decide on the rAF timestamp (the vsync time), not performance.now() inside the
    // callback: callback delay is noisy, and near a vsync boundary that noise flips
    // frames between 1 and 3 vsyncs (16/50 ms judder at a 33 ms cadence).
    for (;;) {
      const vsync = await nextAnimationFrame();
      if (this.#anchor == null) this.#anchor = vsync - scene.time * 1000;
      if (vsync >= this.#anchor + scene.time * 1000 - 8) { this.#patch(scene); return; }
    }
  }

  /** Draw the scene's frame now, unpaced. */
  #patch(scene: Scene): void {
    if (this.#background === undefined && this.svg.style.background !== scene.colors.paper) this.svg.style.background = scene.colors.paper;
    // Absolute path data: measured faster for live DOM patching than translate + relative
    this[applyRecords](renderElements(scene, { relative: false }), viewBoxOf(scene));
  }

  /** @internal See applyRecords. */
  [applyRecords](els: readonly ElementRecord[], viewBox?: string): void {
    this.#lastPatch = performance.now();
    const end = perf.begin('dom.patch');
    // Camera: one attribute write when the frame moved, none otherwise
    if (viewBox !== undefined && viewBox !== this.#viewBox) { this.svg.setAttribute('viewBox', viewBox); this.#viewBox = viewBox; }
    const clips = clipsOf(els), signature = clips.map((c)=>c.id).join(' ');
    if (signature !== this.#clipSignature) {
      this.#clipSignature = signature;
      if (!clips.length) { this.#defs?.remove(); this.#defs = null; }
      else {
        if (!this.#defs) { this.#defs = this.#doc.createElementNS(this.#NS,'defs'); this.svg.insertBefore(this.#defs,this.svg.firstChild); }
        this.#defs.replaceChildren(...clips.map((c)=>{
          const path=this.#doc.createElementNS(this.#NS,'clipPath'), rect=this.#doc.createElementNS(this.#NS,'rect');
          path.setAttribute('id',c.id);path.setAttribute('clipPathUnits','userSpaceOnUse');
          for(const [k,v] of Object.entries(c.attrs))rect.setAttribute(k,v);
          path.appendChild(rect);return path;
        }));
      }
    }
    const seen = new Set<number>();
    let cursor = this.#defs ? this.#defs.nextSibling : this.svg.firstChild;
    for (const rec of els) {
      seen.add(rec.id);
      let node = this.#nodes.get(rec.id);
      if (!node || node.el.tagName !== rec.tag) {
        if (node) node.el.remove();
        const el = this.#doc.createElementNS(this.#NS, rec.tag);
        node = { el, attrs: Object.create(null) as Record<string, string>, text: null, rec: null };
        this.#nodes.set(rec.id, node);
      }
      // Records are memoized: the same object means nothing about this element changed
      if (node.rec === rec) {
        if (node.el !== cursor) this.svg.insertBefore(node.el, cursor);
        else cursor = cursor.nextSibling;
        continue;
      }
      node.rec = rec;
      if (rec.transform !== node.transform) {
        if (rec.transform) node.el.setAttribute('transform', rec.transform); else node.el.removeAttribute('transform');
        node.transform = rec.transform;
      }
      // Text is independent of the immutable attrs object. A new record may
      // reuse those attrs while replacing its text.
      if (rec.text !== node.text) { node.el.textContent = rec.text ?? ''; node.text = rec.text; }
      // Same attrs object: neither attribute values nor their membership changed.
      if (node.attrsRef === rec.attrs) {
        if (node.el !== cursor) this.svg.insertBefore(node.el, cursor);
        else cursor = cursor.nextSibling;
        continue;
      }
      node.attrsRef = rec.attrs;
      for (const k of Object.keys(rec.attrs)) {
        const v = rec.attrs[k] ?? '';
        if (node.attrs[k] !== v) { node.el.setAttribute(k, v); node.attrs[k] = v; }
      }
      for (const k of Object.keys(node.attrs)) {
        if (!Object.hasOwn(rec.attrs, k)) { node.el.removeAttribute(k); delete node.attrs[k]; }
      }
      // Keep document order equal to draw order with minimal moves
      if (node.el !== cursor) this.svg.insertBefore(node.el, cursor);
      else cursor = cursor.nextSibling;
    }
    for (const [id, node] of this.#nodes) {
      if (!seen.has(id)) { node.el.remove(); this.#nodes.delete(id); }
    }
    end();
  }
}

const nextAnimationFrame = (): Promise<number> => new Promise((res) => requestAnimationFrame(res));
