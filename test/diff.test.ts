// Diff-driven transforms: the line and token diffs (held to the real git CLI),
// TransformDiff's pairing (the diff's, and only the diff's), seeking, motion,
// and the evidence it leaves in the trace.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  Scene, Code, Text, FadeIn, LaggedStart, TransformDiff, TransformMatchingText, VMobject,
  diffLines, parseUnifiedDiff, keyed,
} from '../src/index.ts';
import { StringSink, renderText, renderFrame } from '../src/output.ts';
import { SnapshotSink } from '../src/svg.ts';
import { MotionSink, analyzeMotion, traceScene, loadFonts } from '../explain/testing.ts';
import { diffTokens, tokenize, hunkHeader } from '../src/diff.ts';
import type { Hunk, Mobject, Sink } from '../src/index.ts';
import { drawsFrom } from './lib/random-scene.ts';
import { beginAnimation } from '../src/animation.ts';

const header = (hs: Hunk[]) => hs.map(hunkHeader);

/** `git diff --no-index` of two texts (lines), as its unified diff output. */
function gitDiff(a: readonly string[], b: readonly string[], context = 0): string {
  const dir = mkdtempSync(join(tmpdir(), 'rayner-diff-'));
  const file = (name: string, lines: readonly string[]) => { const p = join(dir, name); writeFileSync(p, lines.map((l) => l + '\n').join('')); return p; };
  try {
    // Exit status 1 means "they differ": the diff is on stdout either way
    return execFileSync('git', ['diff', '--no-index', '--no-color', '--no-ext-diff', '--diff-algorithm=myers', `--unified=${context}`, file('a', a), file('b', b)], { encoding: 'utf8' });
  } catch (e) {
    const out = (e as { status?: number; stdout?: string });
    if (out.status === 1 && typeof out.stdout === 'string') return out.stdout;
    throw e;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('diffLines: empty, identical, all changed, insert at top, a moved block', () => {
  assert.deepEqual(diffLines([], []), []);
  assert.deepEqual(diffLines(['a', 'b'], ['a', 'b']), []);
  assert.deepEqual(diffLines([], ['a', 'b']), [{ oldStart: 0, oldLines: 0, newStart: 1, newLines: 2, ops: ['+', '+'], lines: ['a', 'b'] }]);
  assert.deepEqual(diffLines(['a', 'b'], []), [{ oldStart: 1, oldLines: 2, newStart: 0, newLines: 0, ops: ['-', '-'], lines: ['a', 'b'] }]);
  assert.deepEqual(diffLines(['a', 'b'], ['x', 'y', 'z']), [{ oldStart: 1, oldLines: 2, newStart: 1, newLines: 3, ops: ['-', '-', '+', '+', '+'], lines: ['a', 'b', 'x', 'y', 'z'] }]);
  // Insert after line 2: an empty old side is numbered by the line before it
  assert.deepEqual(header(diffLines(['a', 'b', 'c'], ['a', 'b', 'n', 'c'])), ['@@ -2,0 +3 @@']);
  assert.deepEqual(header(diffLines(['a', 'b', 'c'], ['n', 'a', 'b', 'c'])), ['@@ -0,0 +1 @@']);
  // A moved block is a removal and an insertion: the diff keeps the longer common part
  const moved = diffLines(['a', 'b', 'c', 'd', 'e'], ['d', 'e', 'a', 'b', 'c']);
  assert.deepEqual(header(moved), ['@@ -0,0 +1,2 @@', '@@ -4,2 +5,0 @@']);
  assert.deepEqual(moved.map((h) => h.ops.join('')), ['++', '--']);
  // Each hunk lists its removals before its additions
  assert.deepEqual(diffLines(['a', 'x', 'b'], ['a', 'y', 'b'])[0]!.ops, ['-', '+']);
});

test('diffTokens: shared tokens in order, ranges into each line', () => {
  assert.deepEqual(tokenize('f(a, "b c") + 12'), [
    { text: 'f', from: 0, to: 1 }, { text: '(', from: 1, to: 2 }, { text: 'a', from: 2, to: 3 }, { text: ',', from: 3, to: 4 },
    { text: ' ', from: 4, to: 5 }, { text: '"b c"', from: 5, to: 10 }, { text: ')', from: 10, to: 11 }, { text: ' ', from: 11, to: 12 },
    { text: '+', from: 12, to: 13 }, { text: ' ', from: 13, to: 14 }, { text: '12', from: 14, to: 16 },
  ]);
  const a = '  return env.DB.get(id);', b = '  const row = await env.DB.get(id);';
  const ops = diffTokens(a, b);
  // Rebuilding each side from its ops gives the line back, ranges and all
  assert.equal(ops.filter((t) => t.op !== '+').map((t) => t.text).join(''), a);
  assert.equal(ops.filter((t) => t.op !== '-').map((t) => t.text).join(''), b);
  for (const t of ops) {
    if (t.op !== '+') assert.equal(a.slice(...t.a), t.text);
    if (t.op !== '-') assert.equal(b.slice(...t.b), t.text);
  }
  assert.deepEqual(ops.filter((t) => t.op === '-').map((t) => t.text), ['return']);
  assert.deepEqual(ops.filter((t) => t.op === '+').map((t) => t.text).join(''), 'const row = await');
  assert.deepEqual(diffTokens('', ''), []);
  assert.deepEqual(diffTokens('x', 'x'), [{ op: '=', text: 'x', a: [0, 1], b: [0, 1] }]);
});

test('parseUnifiedDiff: headers, context, omitted counts, no-newline markers; malformed input throws', () => {
  const text = [
    'diff --git a/f.ts b/f.ts', 'index 1..2 100644', '--- a/f.ts', '+++ b/f.ts',
    '@@ -1,3 +1,3 @@ function f() {', ' a', '-b', '+B', ' c', '@@ -9 +9,0 @@', '-z', '\\ No newline at end of file', '',
  ].join('\n');
  assert.deepEqual(parseUnifiedDiff(text), [
    { oldStart: 1, oldLines: 3, newStart: 1, newLines: 3, ops: ['=', '-', '+', '='], lines: ['a', 'b', 'B', 'c'] },
    { oldStart: 9, oldLines: 1, newStart: 9, newLines: 0, ops: ['-'], lines: ['z'] },
  ]);
  assert.deepEqual(parseUnifiedDiff(''), []);
  assert.throws(() => parseUnifiedDiff('@@ -1,2 +1 @@\n-a\n'), /shorter than its header/);
  assert.throws(() => parseUnifiedDiff('@@ -1 +1 @@\n-a\n-b\n+c\n'), /more lines than its header/);
  assert.throws(() => parseUnifiedDiff('@@ -1 +1 @@\n-a\n+b\ndiff --git a/g b/g\n--- a/g\n+++ b/g\n@@ -1 +1 @@\n-x\n+y\n'), /parseUnifiedDiff\(\): the diff has a second file header/);
});

test('git agrees: parse(git diff) equals diffLines on random edits, and git round-trips through the parser', () => {
  const r = drawsFrom(Number(process.env.SEED ?? 20261025));
  let fresh = 0;
  const line = () => `${r.pick(['const', 'let', 'return', 'if', 'await'])} v${fresh++} = ${r.int(0, 99)};`;
  for (let trial = 0; trial < 24; trial++) {
    // Unique lines: exactly one minimal diff, so git and diffLines must print the same hunks
    const before = Array.from({ length: r.int(0, 14) }, line);
    const after: string[] = [];
    for (const l of before) {
      if (r.bool(0.15)) after.push(line()); // replaced
      else if (!r.bool(0.15)) after.push(l); // kept (else deleted)
      if (r.bool(0.15)) for (let k = r.int(1, 3); k > 0; k--) after.push(line()); // inserted
    }
    const ours = diffLines(before, after);
    assert.deepEqual(parseUnifiedDiff(gitDiff(before, after)), ours, `trial ${trial}`);
    // With context lines, git's hunks still describe the same edit: a TransformDiff accepts them
    const withContext = parseUnifiedDiff(gitDiff(before, after, 2));
    const removed = (hs: Hunk[]) => hs.flatMap((h) => h.ops.filter((o) => o === '-')).length;
    assert.equal(removed(withContext), removed(ours));
  }
  // Repeated lines admit several minimal diffs: git may place them elsewhere, but changes no more lines
  for (let trial = 0; trial < 12; trial++) {
    const before = Array.from({ length: r.int(0, 12) }, () => r.pick(['}', '', 'x();', 'return;']));
    const after = before.filter(() => !r.bool(0.25)).flatMap((l) => (r.bool(0.2) ? [l, r.pick(['}', 'x();'])] : [l]));
    const git = parseUnifiedDiff(gitDiff(before, after)), ours = diffLines(before, after);
    const count = (hs: Hunk[], k: 'oldLines' | 'newLines') => hs.reduce((n, h) => n + h[k], 0);
    assert.equal(count(git, 'oldLines'), count(ours, 'oldLines'), `repeated trial ${trial}`);
    assert.equal(count(git, 'newLines'), count(ours, 'newLines'), `repeated trial ${trial}`);
  }
});

const BEFORE = ['function get(id) {', '  return db.get(id);', '}'];
const AFTER = ['function get(id) {', '  const hit = cache.get(id);', '  if (hit) return hit;', '  const row = await db.get(id);', '  return row;', '}'];

/** Play one TransformDiff in a bare scene (replace: false, so the source is left showing the result). */
async function played(t: TransformDiff): Promise<Scene> {
  const s = new Scene(new StringSink());
  s.construct = async function (this: Scene) { await this.step('diff'); await this.play(t); };
  await s.run();
  return s;
}

test('TransformDiff: unchanged lines travel whole to where the diff puts them, glyph for glyph', async () => {
  await loadFonts();
  const a = new Code(BEFORE).shift([-1, 1]), b = new Code(AFTER).shift([0.5, -0.4]);
  const t = new TransformDiff(a, b, { replace: false });
  const glyphs = (c: Code) => c.lines.reduce((n, l) => n + l.children.length, 0), na = glyphs(a), nb = glyphs(b);
  await played(t);
  assert.deepEqual(header(t.hunks), ['@@ -2 +2,4 @@']);
  assert.deepEqual(t.plan, { same: [[0, 0], [2, 5]], changed: [[1, 3]], removed: [], added: [1, 2, 4] });
  const partner = new Map(t.pairs);
  for (const [i, j] of t.plan.same) {
    const src = a.lines[i]!.children, dst = b.lines[j]!.children;
    assert.equal(src.length, dst.length);
    src.forEach((g, k) => {
      assert.equal(partner.get(g), dst[k], `line ${i} glyph ${k} pairs with line ${j} glyph ${k}`);
      // Exactly there: the same points as the after block's line
      assert.deepEqual((g as VMobject).subpaths, (dst[k] as VMobject).subpaths);
    });
  }
  // The rewritten line keeps its shared tokens, and only those, paired within the line pair
  const kept = (m: Mobject) => (m.parent as Text);
  for (const [s, d] of t.pairs) {
    const i = a.lines.indexOf(kept(s)), j = b.lines.indexOf(kept(d));
    assert.ok(t.plan.same.some(([x, y]) => x === i && y === j) || t.plan.changed.some(([x, y]) => x === i && y === j), `pair ${i} -> ${j} is in the diff`);
  }
  // `return` is the only thing removed; every glyph of the three added lines is added
  assert.deepEqual(t.removed.map((g) => (g as unknown as { cluster: number }).cluster), [2, 3, 4, 5, 6, 7]);
  for (const j of t.plan.added) for (const g of b.lines[j]!.children) assert.ok(t.added.includes(g));
  const s = t.summary();
  assert.equal(s.matched + s.added, nb);
  assert.equal(s.matched + s.removed, na);
});

test('TransformDiff: given hunks are the truth, and hunks that do not describe the texts throw at begin()', async () => {
  await loadFonts();
  const a = ['x = 1', 'y = 2'], b = ['y = 2', 'x = 1'];
  // diffLines keeps `y = 2`; git (or an author) may keep `x = 1` instead, and the animation follows
  const own = new TransformDiff(new Code(a), new Code(b), { replace: false });
  await played(own);
  assert.deepEqual(own.plan.same, [[1, 0]]);
  const hunks = parseUnifiedDiff('@@ -0,0 +1 @@\n+y = 2\n@@ -2 +2,0 @@\n-y = 2\n');
  const given = new TransformDiff(new Code(a), new Code(b), { hunks, replace: false });
  await played(given);
  assert.deepEqual(given.plan.same, [[0, 1]]);
  assert.deepEqual(given.hunks, hunks);
  // Hunks of another edit: lines must match
  const wrong = new TransformDiff(new Code(BEFORE), new Code(AFTER), { hunks: diffLines(['a', 'b', 'c'], ['a', 'c']) });
  assert.throws(() => beginAnimation(wrong), /new TransformDiff\(\): hunk @@ -2 \+1,0 @@ removes "b", but before line 2 is " {2}return db.get\(id\);"; the hunks do not describe/);
  const short = new TransformDiff(new Code(BEFORE), new Code(AFTER), { hunks: [] });
  assert.throws(() => beginAnimation(short), /after the last hunk the old text has 3 more lines and the new 6/);
  const counts = new TransformDiff(new Code(BEFORE), new Code(AFTER), { hunks: [{ oldStart: 2, oldLines: 1, newStart: 2, newLines: 4, ops: ['-', '+'], lines: ['  return db.get(id);', 'x'] }] });
  assert.throws(() => beginAnimation(counts), /which its header does not count/);
  // Constructing never checks: only begin() reads the texts
  assert.ok(new TransformDiff(new Code(['a']), new Code(['b']), { hunks: [] }));
});

/** A test-local scene: a diff from diffLines, then one from given hunks, then a hold. */
class DiffScene extends Scene {
  override async construct(): Promise<void> {
    await this.step('show');
    const a = new Code(BEFORE).shift([0, 1.5]);
    await this.play(new FadeIn(a));
    await this.step('diff');
    const b = new Code(AFTER, { spans: [{ line: 3, from: 2, to: 7, color: '#f97583' }] }).shift([0.3, 0.8]);
    await this.play(new TransformDiff(a, b), { runTime: 1.2 });
    await this.step('given');
    const c = new Code(['function get(id) {', '  return cached(id);', '}']).shift([0, -1.5]);
    await this.play(new LaggedStart([new TransformDiff(b, c, { hunks: parseUnifiedDiff(gitDiff(AFTER, c.lines.map((l) => l.text), 1)) }), new FadeIn(new Text('done').shift([4, 3]))]));
    await this.wait(0.5);
  }
}

test('seeking into a TransformDiff renders the frame a full run renders', async () => {
  const full = new StringSink();
  await new DiffScene(full).run();
  const ix = await traceScene(DiffScene);
  const d = ix.steps.find((s) => s.step === 'diff')!.frame0, g = ix.steps.find((s) => s.step === 'given')!.frame0;
  const ks = [0, d, d + 1, d + 18, d + 36, g + 7, g + 15, full.frames.length - 1];
  for (const k of ks) {
    const snap = new SnapshotSink();
    await renderFrame(DiffScene, k, snap);
    assert.equal(snap.svg, full.frames[k], `frame ${k}`);
  }
});

// A Worker grows a read-through cache: three hunks (a rewrite, two insertions), so
// unchanged lines between hunks have to travel by different amounts.
const WORKER = [
  'export default {',
  '  async fetch(req, env) {',
  '    const key = new URL(req.url).pathname.slice(1);',
  '    const row = await env.DB.prepare("SELECT v FROM kv WHERE k = ?").bind(key).first();',
  '    if (!row) return new Response("not found", { status: 404 });',
  '    return new Response(row.v);',
  '  },',
  '};',
];
const CACHED = [
  'export default {',
  '  async fetch(req, env, ctx) {',
  '    const key = new URL(req.url).pathname.slice(1);',
  '    const hit = await env.KV.get(key);',
  '    if (hit) return new Response(hit);',
  '    const row = await env.DB.prepare("SELECT v FROM kv WHERE k = ?").bind(key).first();',
  '    if (!row) return new Response("not found", { status: 404 });',
  '    ctx.waitUntil(env.KV.put(key, row.v));',
  '    return new Response(row.v);',
  '  },',
  '};',
];

/** The default TransformDiff (replace: true) of WORKER into CACHED, moved and rescaled. */
class HandoffScene extends Scene {
  override async construct(): Promise<void> {
    const a = new Code(WORKER, { fontSize: 0.22 }).shift([-0.4, 1.2]);
    await this.play(new FadeIn(a));
    await this.step('diff');
    await this.play(new TransformDiff(a, new Code(CACHED, { fontSize: 0.2 }).shift([0.5, -0.6])), { runTime: 1.2 });
    await this.wait(0.2);
  }
}

test('TransformDiff in a scene: the recorded hunks are git\'s, and no unchanged line moves off its line in the after block', async () => {
  const git = parseUnifiedDiff(gitDiff(WORKER, CACHED));
  assert.deepEqual(header(git), ['@@ -2 +2 @@', '@@ -3,0 +4,2 @@', '@@ -5,0 +8 @@']);
  // The hunks the trace recorded are git's: line numbers, counts and text
  const { steps } = await traceScene(HandoffScene);
  const recorded = steps.find((s) => s.step === 'diff')!.evidence!.find((e) => e.kind === 'diff')!;
  assert.deepEqual(recorded.hunks, git);
  // Every line git changes is a line the animation removes, rewrites or adds; no more, no fewer
  const lines = recorded.lines as { unchanged: number; changed: number; removed: number; added: number };
  const count = (op: string) => git.reduce((n, h) => n + h.ops.filter((o) => o === op).length, 0);
  assert.equal(lines.changed + lines.removed, count('-'));
  assert.equal(lines.changed + lines.added, count('+'));
  assert.equal(lines.unchanged, WORKER.length - count('-'));

  // Watch the diff step: the last frame before the after block takes over is the transform's end
  const points = (c: Code) => c.lines.map((l) => l.children.map((g) => (g as VMobject).subpaths.map((p) => p.slice())));
  let prev: { code: Code; lines: Float32Array[][][]; t: number } | null = null;
  let handoff: { from: Float32Array[][][]; to: Code; t: number } | null = null;
  const sink: Sink = { async frame(scene: Scene) {
    if (scene.currentStep?.name !== 'diff' || handoff) return;
    const code = scene.mobjects.find((m): m is Code => m instanceof Code);
    if (!code) return;
    if (prev && code !== prev.code) handoff = { from: prev.lines, to: code, t: scene.time };
    else prev = { code, lines: points(code), t: scene.time };
  } };
  const scene = await new HandoffScene(sink).run();
  assert.ok(handoff, 'the after block took over from the before block');
  const { from, to, t } = handoff as { from: Float32Array[][][]; to: Code; t: number };
  assert.ok(Math.abs(t - ((await traceScene(HandoffScene)).steps.find((s) => s.step === 'diff')!.t0 + 1.2)) <= 1 / scene.fps + 1e-9, `hand-over at the end of the play (${t})`);
  // Every line git leaves alone ends exactly on its line of the after block
  let i = 0, j = 0, checked = 0;
  const same = (n: number) => {
    for (; n > 0; n--, i++, j++, checked++) {
      assert.equal(WORKER[i], CACHED[j]);
      assert.deepEqual(from[i], points(to)[j], `unchanged line ${i + 1} -> ${j + 1} ends where the after block shows it`);
    }
  };
  for (const h of git) {
    same((h.oldLines ? h.oldStart - 1 : h.oldStart) - i);
    i += h.oldLines; j += h.newLines;
  }
  same(WORKER.length - i);
  assert.equal(checked, lines.unchanged);
  assert.ok(checked >= 5);
});

test('TransformDiff is free of motion discontinuities', async () => {
  const sink = new MotionSink();
  await new DiffScene(sink).run();
  assert.deepEqual(analyzeMotion(sink).map((e) => `${e.t}s ${e.kind} [${e.step}] ${e.what} ${e.detail}`), []);
});

test('evidence: the trace and the text frame carry what each transform paired, and hash the same every run', async () => {
  const tr = await traceScene(DiffScene);
  const [show, diff, given] = tr.steps;
  assert.ok(!('evidence' in show!), 'a step that recorded nothing has no evidence key');
  assert.equal(diff!.evidence!.length, 1);
  const e = diff!.evidence![0]!;
  assert.equal(e.kind, 'diff');
  assert.deepEqual(e.hunks, diffLines(BEFORE, AFTER));
  assert.deepEqual(e.lines, { unchanged: 2, changed: 1, removed: 0, added: 3 });
  assert.deepEqual(given!.evidence!.map((x) => x.kind), ['diff'], 'recorded from inside a LaggedStart');
  assert.equal((given!.evidence![0]!.hunks as Hunk[])[0]!.ops.filter((o) => o === '=').length, 2, 'git context lines are kept');
  const hash = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
  assert.equal(hash(await traceScene(DiffScene)), hash(tr));
  // Mid-transform, the text frame says what the step recorded so far
  const scene = await renderFrame(DiffScene, tr.steps.find((s) => s.step === 'diff')!.frame0 + 15, new SnapshotSink());
  assert.match(renderText(scene), /\ndiff @@ -2 \+2,4 @@: 2 unchanged, 1 rewritten, 0 removed, 3 added lines$/);
});

test('every matching transform records its counts when it begins in a scene', async () => {
  await loadFonts();
  const t = new TransformMatchingText(new Text('cache'), new Text('cached'));
  const s = await new (class extends Scene {
    override async construct() { await this.step('a'); await this.play(new LaggedStart([t])); }
  })(new StringSink()).run();
  assert.deepEqual(s.steps[0]!.evidence, [{ kind: 'match', matched: 5, morphed: 0, removed: 0, added: 1 }]);
  assert.deepEqual(s.evidence, s.steps[0]!.evidence);
  // Outside a scene there is nowhere to record: begin() still works, and evidence() reads the counts
  const free = new TransformMatchingText(new Text('ab'), new Text('abc'));
  beginAnimation(free);
  assert.deepEqual(free.evidence(), { kind: 'match', matched: 2, morphed: 0, removed: 0, added: 1 });
  // record() copies as JSON
  const data = { n: 1 };
  s.record('note', data);
  data.n = 2;
  assert.deepEqual(s.evidence.at(-1), { kind: 'note', n: 1 });
});

test('every animation that decides something records it as it begins: nested in groups and successions, in begin order', async () => {
  await loadFonts();
  const { Succession, AnimationGroup, Dot, linear } = await import('../src/index.ts');
  const { view } = await import('../explain/index.ts');
  const { Follow } = await import('../explain/state.ts');
  const s = await new (class extends Scene<{ word: string }> {
    override state = { word: 'cache' };
    override async construct() {
      await this.step('a');
      const readout = view(this, (st) => new Text(st.word));
      keyed(readout, 'readout');
      const plain = view(this, (st) => new Text(st.word));
      const dot = new Dot();
      this.add(readout, plain, dot);
      this.state = { word: 'cached' };
      await this.play(new AnimationGroup([
        new TransformMatchingText(new Text('ab'), new Text('abc')),
        new Succession([
          readout.sync({ match: 'text', runTime: 0.2 }),
          new Follow({ from: 1, to: 2, draw: (x) => new Dot().moveTo([x, 0]) }, { targets: [dot], runTime: 0.2, rateFunc: linear }),
          plain.sync({ runTime: 0.2, match: 'index' }),
        ]),
      ]));
    }
  })(new StringSink()).run();
  assert.deepEqual(s.steps[0]!.evidence, [
    { kind: 'match', matched: 2, morphed: 0, removed: 0, added: 1 },
    // A View's sync records its morph, named by the View's key
    { kind: 'match', matched: 5, morphed: 0, removed: 0, added: 1, view: 'readout' },
    // A Follow records the interval it sampled and what it wrote, by key or class
    { kind: 'follow', from: 1, to: 2, targets: ['Dot'] },
    // A sync by index pairs nothing by key: it records nothing
  ]);
});
