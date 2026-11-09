import assert from 'node:assert/strict';
import type { Trace } from '../../../explain/testing.ts';
import { Text } from '../../../src/index.ts';
import type { VMobject } from '../../../src/index.ts';
import { loadFonts, assertStepState } from '../../../explain/testing.ts';

/** Each authored scenario's steps against the program the explainer explains. */
export async function check(trace: Trace, values: Record<string, string>): Promise<void> {
  await loadFonts();
  const font = values.font as 'sans' | 'mono',
    other = font === 'sans' ? 'mono' : 'sans';
  assertStepState(trace, 'measure', {
    font: values.font,
    width: new Text('Hello, outlines', { font, fontSize: 0.9 }).advance(),
  });
  const evidenceOf = (step: string) => trace.steps.find((s) => s.step === step)!.evidence ?? [];
  // The measure step's caption adds the line up: JetBrains Mono gives each of the line's
  // characters one advance, and the l gains most from it.
  const advances = (f: 'sans' | 'mono') => [...'Hello, outlines'].map((c) => new Text(c, { font: f, fontSize: 0.9 }).advance());
  const [sansAdv, monoAdv] = [advances('sans'), advances('mono')];
  assert.ok(monoAdv.every((a) => Math.abs(a - monoAdv[0]!) < 1e-4), 'JetBrains Mono: one advance for every character');
  const caption = String(trace.steps.find((s) => s.step === 'measure')!.meta.caption);
  assert.ok(caption.includes(`all 15 characters ${monoAdv[0]!.toFixed(3)}, so its line is 15 × ${monoAdv[0]!.toFixed(3)} = 8.10`), caption);
  const gains = sansAdv.map((a, i) => monoAdv[i]! - a);
  assert.equal('Hello, outlines'[gains.indexOf(Math.max(...gains))], 'l', 'the l gains most');
  // The card adds the difference up by groups: Inter's narrowest letters, the other narrow
  // characters, the one letter Inter draws wider, and the rest.
  const group = (keep: (c: string) => boolean) =>
    +[...'Hello, outlines'].reduce((n, c, i) => (keep(c) ? n + gains[i]! : n), 0).toFixed(3);
  assertStepState(trace, 'measure', {
    gains: {
      'l, l, l, i': group((c) => c === 'l' || c === 'i'),
      'comma, space, t': group((c) => c === ',' || c === ' ' || c === 't'),
      H: group((c) => c === 'H'),
      'the other 7': group((c) => 'eousne'.includes(c)),
    },
  });
  // Outline shapes, compared point by point once each glyph is centred and scaled
  // to one size: each glyph pairs with itself at 60%, and the other font's pairs
  // only where an outline really is the same.
  const outlines = (f: 'sans' | 'mono', size: number) =>
    new Text('Hello, outlines', { font: f, fontSize: size }).children.map((g) => normalOutline(g as VMobject));
  const mine = outlines(font, 0.9),
    smaller = outlines(font, 0.9 * 0.6),
    theirs = outlines(other, 0.9);
  const same = pairOutlines(mine, smaller),
    across = pairOutlines(mine, theirs);
  assert.equal(same, mine.length);
  // The scene says that across the two fonts nothing pairs.
  assert.equal(across, 0);
  assert.deepEqual(evidenceOf('letterforms'), [
    { kind: 'match', matched: same, morphed: 0, removed: mine.length - same, added: smaller.length - same },
    { kind: 'match', matched: across, morphed: 0, removed: mine.length - across, added: theirs.length - across },
  ]);
  assertStepState(trace, 'letterforms', { shapePairs: { sameFont: same, otherFont: across } });
}

/** A glyph's outline, centred on its box and scaled so the box's longer side is 1. */
function normalOutline(g: VMobject): { closed: boolean[]; points: number[][] } {
  const all = g.subpaths.flatMap((a) => Array.from(a));
  const xs = all.filter((_, i) => i % 2 === 0),
    ys = all.filter((_, i) => i % 2 === 1);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const size = Math.max(x1 - x0, y1 - y0),
    cx = (x0 + x1) / 2,
    cy = (y0 + y1) / 2;
  return {
    closed: [...g.closed],
    points: g.subpaths.map((a) => Array.from(a, (v, i) => (v - (i % 2 ? cy : cx)) / size)),
  };
}

/** How many outlines of `xs` pair one to one with an outline of `ys` that is the same path, point for point. */
function pairOutlines(xs: ReturnType<typeof normalOutline>[], ys: ReturnType<typeof normalOutline>[]): number {
  const same = (p: ReturnType<typeof normalOutline>, q: ReturnType<typeof normalOutline>) =>
    p.points.length === q.points.length &&
    p.closed.every((c, i) => c === q.closed[i]) &&
    p.points.every((a, i) => a.length === q.points[i]!.length && a.every((v, k) => Math.abs(v - q.points[i]![k]!) < 1e-4));
  const used = new Set<number>();
  let n = 0;
  for (const x of xs) {
    const j = ys.findIndex((y, k) => !used.has(k) && same(x, y));
    if (j >= 0) used.add(j), n++;
  }
  return n;
}
