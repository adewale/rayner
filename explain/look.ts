import { lerpColor, parseColor } from '../src/color.ts';
import type { Box, Mobject, Scene } from '../src/index.ts';
import type { Palette } from '../integrations/agentic-mermaid/snapshot.ts';

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
  const lum = (c: string) => {
    const lin = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const [r, g, b] = parseColor(c) ?? [255, 255, 255];
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  };
  const [a, z] = [lum(color), lum(p.paper)].sort((x, y) => y - x);
  return (a! + 0.05) / (z! + 0.05);
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
 * What a helper emphasises now: each object that shows it, with what it shows there (a card
 * row, code lines, a mark's colour, a note's words), so moving a focus bar is new emphasis.
 */
export type Emphasis = readonly (readonly [Mobject, string])[];
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
  for (const now of emphasisers.get(scene) ?? [])
    for (const [m, what] of now()) out.set(m, out.has(m) ? `${out.get(m)}; ${what}` : what);
  return out;
}

const readingSubjects = new WeakMap<Scene, readonly Mobject[]>();
/** The objects a reader must compare together before exploring the details.
 * This selects an opening; it neither removes artwork nor changes its scale. */
export function reading(scene: Scene, ...subjects: Mobject[]): void {
  readingSubjects.set(scene, [...subjects]);
}
export function readingOf(scene: Scene): readonly Mobject[] {
  return readingSubjects.get(scene) ?? [];
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
export const boxCenter = (b: Box): [number, number] => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
