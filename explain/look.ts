import { contrastRatio, lerpColor, parseColor } from '../src/color.ts';
import { Text } from '../src/index.ts';
import type { Box, Mobject, Scene } from '../src/index.ts';
import { center } from '../src/box.ts';
import type { Palette } from '../integrations/agentic-mermaid/snapshot.ts';
import type { Seen } from './trace.ts';

/**
 * Secondary text that still reads on the paper: ink pulled up to a third of the way
 * toward the paper, never so far that it drops below 4.5:1 (WCAG 1.4.3), and never
 * the style's faint `muted`. On a paper even the ink cannot reach 4.5:1 on, the ink.
 */
export function soft(p: Palette): string {
  let t = 0.32;
  while (t > 0 && contrast(p, lerpColor(p.ink, p.paper, t)) < 4.5) t = Math.round((t - 0.01) * 100) / 100;
  return lerpColor(p.ink, p.paper, t);
}
/** WCAG contrast of a colour against the paper. */
function contrast(p: Palette, color: string): number {
  // A colour this cannot read counts as white.
  const rgb = (c: string) => parseColor(c) ?? ([255, 255, 255] as const);
  return contrastRatio(rgb(color), rgb(p.paper));
}
/** Of a colour for dark paper and one for light paper, the one that reads on this paper. */
const onPaper = (p: Palette, dark: string, light: string) => (contrast(p, dark) >= contrast(p, light) ? dark : light);
/**
 * The colour for emphasis: trails, marks, focus bars. A style's accent when it
 * has a hue; monochrome styles (hand-drawn, pen-and-ink, blueprint) get a warm
 * orange that reads on their paper.
 */
export function emphasis(p: Palette): string {
  const [r, g, b] = parseColor(p.accent) ?? [0, 0, 0];
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  // A hue needs both relative and absolute chroma: near-black inks (pen-and-ink) are not one.
  if (max > 0 && (max - min) / max > 0.3 && max - min > 48) return p.accent;
  return onPaper(p, '#ffb454', '#d9480f');
}
/**
 * What a helper emphasises now: each part that shows it, as the mobject or its key, with what it
 * shows there (a card row, code lines, a mark's colour, a note's words), so moving a focus bar is
 * new emphasis. A key names the part on the stage at that moment; a key not on the stage marks nothing.
 */
export type Emphasis = readonly (readonly [Mobject | string, string])[];
/** Composites report their own current parts; copies inherit the method, not a closure over the original. */
export const emphasisSource = Symbol('emphasisSource');
interface EmphasisSource { [emphasisSource](): Emphasis }
/**
 * A picture that says what it is: a card, a code panel, a diagram note, a dimension line. The
 * stage describes such a part by its own words wherever it is drawn (kept, inside a view, inside a
 * staged step's picture), so a picture built from state is described as it is built.
 */
export const seenSource = Symbol('seenSource');
export interface SeenSource { [seenSource](): Seen }
/** Whether `m` describes itself. */
export const describesItself = (m: Mobject): m is Mobject & SeenSource => typeof (m as Partial<SeenSource>)[seenSource] === 'function';
/** Give `m` its own description (and, when `emphasis` is given, its own emphasis); returns `m`. */
export function selfDescribed<T extends Mobject>(m: T, seen: () => Seen, emphasis?: () => Emphasis): T {
  Object.assign(m, { [seenSource]: seen, ...(emphasis ? { [emphasisSource]: emphasis } : {}) });
  return m;
}
/**
 * What `m` shows in words: each part that describes itself, as it describes itself, and the text
 * of every other `Text`, in family order. A self-describing part's own text is not repeated.
 */
export function partsSeen(m: Mobject, text: (t: Text) => boolean = () => true): { seen: Seen[]; words: string[] } {
  const seen: Seen[] = [], words: string[] = [];
  const walk = (x: Mobject): void => {
    if (describesItself(x)) { seen.push(x[seenSource]()); return; }
    if (x instanceof Text) { if (text(x)) words.push(x.text); return; }
    for (const c of x.children) walk(c);
  };
  walk(m);
  return { seen, words };
}
const emphasisers = new WeakMap<Scene, Set<() => Emphasis>>();
/**
 * Register what a helper emphasises, read from its own state whenever asked: a lit card row's
 * bar, a code focus bar or diff line, a marked, travelled or focused diagram part, a note
 * beside one. A phone's close-ups visit what a step newly emphasised first
 * (app/embed-closeup.ts), since a caption most often speaks of what its step marked. Nothing
 * drawn, traced or described changes.
 */
export function emphasises(scene: Scene, now: () => Emphasis): void {
  let set = emphasisers.get(scene);
  if (!set) emphasisers.set(scene, (set = new Set()));
  set.add(now);
}
/** Everything the scene's helpers emphasise now, each object with what it shows. */
export function emphasisOf(scene: Scene): Map<Mobject, string> {
  const out = new Map<Mobject, string>();
  const add = (items: Emphasis) => {
    for (const [part, what] of items) {
      // A key names the part on the stage now (identity is a key); a key not on the stage marks nothing.
      const m = typeof part === 'string' ? scene.find(part) : part;
      if (m) out.set(m, out.has(m) ? `${out.get(m)}; ${what}` : what);
    }
  };
  for (const now of emphasisers.get(scene) ?? [])
    add(now());
  const visited = new Set<Mobject>();
  for (const member of scene.familyMembers())
    for (let owner: Mobject | null = member; owner && !visited.has(owner); owner = owner.parent) {
      visited.add(owner);
      const source = owner as Mobject & Partial<EmphasisSource>;
      if (source[emphasisSource]) add(source[emphasisSource]());
    }
  return out;
}

/**
 * Where a part showing emphasis sits, so a redrawn picture's part counts as the same one: its
 * keys from the outermost keyed ancestor down when it is keyed, else the object itself.
 */
function emphasisAddress(m: Mobject): Mobject | string {
  if (m.key === undefined) return m;
  const keys: string[] = [];
  for (let x: Mobject | null = m; x; x = x.parent) if (x.key !== undefined) keys.unshift(x.key);
  return keys.join(' / ');
}
/**
 * What `now` emphasises that `was` did not: a part that shows emphasis now and did not before,
 * or showed another row, line or colour. A view that redraws a kept mark makes a new object
 * at the same address with the same words, which is not new emphasis.
 */
export function newlyEmphasised(now: ReadonlyMap<Mobject, string>, was: ReadonlyMap<Mobject, string>): Map<Mobject, string> {
  const before = new Map<Mobject | string, string>();
  for (const [m, what] of was) before.set(emphasisAddress(m), what);
  return new Map([...now].filter(([m, what]) => was.get(m) !== what && before.get(emphasisAddress(m)) !== what));
}

const openingSubjects = new WeakMap<Scene, readonly Mobject[]>();
/** The objects a reader must compare together before exploring the details.
 * This selects an opening; it neither removes artwork nor changes its scale. */
export function opening(scene: Scene, ...subjects: Mobject[]): void {
  openingSubjects.set(scene, [...subjects]);
}
export function openingOf(scene: Scene): readonly Mobject[] {
  return openingSubjects.get(scene) ?? [];
}
/** Success and failure colours that read on the paper, for outcomes such as accepted and rejected. */
export const good = (p: Palette) => onPaper(p, '#3fb950', '#1a7f37');
export const bad = (p: Palette) => onPaper(p, '#f85149', '#cf222e');
/**
 * How opaque a dimmed part stays: the least opacity at which ink on this paper
 * still reaches 3:1 (WCAG 1.4.11), so dimmed labels stay legible.
 */
export function dimOpacity(p: Palette): number {
  let a = 0.2;
  while (a < 1 && contrast(p, lerpColor(p.paper, p.ink, a)) < 3) a = Math.round((a + 0.01) * 100) / 100;
  return a;
}
/** A panel surface one shade off the paper. */
export const raised = (p: Palette) => lerpColor(p.paper, p.ink, 0.07);
/** A hairline that separates without shouting. */
export const rule = (p: Palette) => lerpColor(p.paper, p.ink, 0.28);

/**
 * Stage regions below the heading, in scene units (16 × 9, y up). Lay native
 * panels and diagrams into these so nothing is placed on top of anything else.
 */
export const REGIONS = {
  full: [-7.55, -4.25, 7.55, 3.25],
  left: [-7.55, -4.25, -0.15, 3.25],
  right: [0.15, -4.25, 7.55, 3.25],
  /** Two thirds left, one third right: a diagram beside a card or code. */
  main: [-7.55, -4.25, 2.35, 3.25],
  side: [2.65, -4.25, 7.55, 3.25],
  top: [-7.55, -0.35, 7.55, 3.25],
  bottom: [-7.55, -4.25, 7.55, -0.65],
} as const satisfies Record<string, Box>;
export type Region = keyof typeof REGIONS;
/**
 * A region (or box) as a fresh box, with any edge moved: `regionBox('top', { bottom: 1 })`
 * is a shorter top, `regionBox('full', { left: -2.75 })` a column on the right.
 */
export function regionBox(
  r: Region | Box,
  { left, bottom, right, top }: { left?: number; bottom?: number; right?: number; top?: number } = {},
): Box {
  const b: Box = typeof r === 'string' ? [...REGIONS[r]] : [...r];
  return [left ?? b[0], bottom ?? b[1], right ?? b[2], top ?? b[3]];
}
export const boxCenter = (b: Box): [number, number] => center(b);
