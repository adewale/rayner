// Code spans (views of a line's glyphs, boxed on line metrics) and build-time
// syntax tokens (tools/lib/tokenize.ts, painted by Code's `spans` option).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  Code, Scene, NullSink, StringSink, SnapshotSink, VMobject, Write, Transform, FadeOut, renderAt, renderElements, loadFonts,
} from '../src/index.ts';
import type { ColorSpan, Box, Sink } from '../src/index.ts';
import { tokenize, lex, shikiTokens, hasShiki, langOf, DARK } from '../tools/lib/tokenize.ts';
// Manim's values, which the package no longer exports.
const GOLD = '#f0ac5f';
const RED = '#fc6255';

await loadFonts();

const LINES = ['const hit = await env.KV.get(key);', '  if (hit) return hit;', ''];
const close = (a: number, b: number, eps = 1e-5): boolean => Math.abs(a - b) <= eps;
const inside = (inner: Box, outer: Box): boolean =>
  inner[0] >= outer[0] - 1e-6 && inner[1] >= outer[1] - 1e-6 && inner[2] <= outer[2] + 1e-6 && inner[3] <= outer[3] + 1e-6;
/** Leaf records the DOM renderer would draw for `code` alone. */
const records = (code: Code) => { const s = new Scene(new NullSink()); s.add(code); return renderElements(s, { relative: false }); };

test('span.box() is the advance cells of [from, to) by the line\'s ascent and descent, unioned with the ink', () => {
  const code = new Code(LINES).scale(1.7).shift([1, -0.5]); // a live view: boxes follow the block
  for (const [line, from, to] of [[0, 0, 5], [0, 12, 17], [1, 2, 4], [1, 0, 21], [0, 5, 6]] as const) {
    const t = code.lines[line]!, f = t.frameBox, cell = t.advance() / t.text.length; // mono, ASCII: one cell per index
    const s = code.span(line, from, to), b = s.box();
    assert.ok(close(b[0], f[0]! + from * cell) && close(b[2], f[0]! + to * cell), `x of ${from}..${to}: ${b}`);
    assert.equal(b[1], f[1]); assert.equal(b[3], f[3]);
    for (const g of s.children) assert.ok(inside(g.box()!, b), 'ink stays inside');
  }
  // The space at 5 has no glyph but still a box, one cell wide
  const space = code.span(0, 5, 6);
  assert.equal(space.children.length, 0);
  assert.ok(space.width() > 0);
});

test('token() finds the nth occurrence\'s glyphs, by source index', () => {
  const code = new Code(LINES);
  const hit = code.token(1, 'hit', 1);
  assert.equal(hit.source, 'hit');
  assert.deepEqual([hit.from, hit.to], [18, 21]);
  const line = code.lines[1]!;
  assert.deepEqual(hit.children, line.children.filter((g) => {
    const c = (g as VMobject & { cluster: number }).cluster;
    return c >= 18 && c < 21;
  }));
  assert.equal(hit.children.length, 3);
  assert.equal(code.token(0, 'await').source, 'await');
  assert.deepEqual([code.lineSpan(1).from, code.lineSpan(1).to], [0, LINES[1]!.length]);
  assert.equal(code.lineSpan(2).children.length, 0);
  assert.throws(() => code.token(1, 'hit', 2), /No "hit" #2/);
  assert.throws(() => code.span(3, 0, 0), RangeError);
  assert.throws(() => code.span(0, 4, 2), RangeError);
  assert.throws(() => code.span(0, 0, 99), RangeError);
});

test('spans of adjacent ranges tile the line in x, with no gaps', () => {
  const code = new Code(LINES).scale(0.8);
  const cuts = [0, 5, 6, 9, 10, 11, 12, 17, 18, 21, 22, 24, 25, 28, 29, 34, LINES[0]!.length];
  const boxes = cuts.slice(1).map((to, i) => code.span(0, cuts[i]!, to).box());
  for (let i = 1; i < boxes.length; i++) assert.equal(boxes[i]![0], boxes[i - 1]![2], `edge ${cuts[i]}`);
  const whole = code.lineSpan(0).box();
  assert.equal(boxes[0]![0], whole[0]); assert.equal(boxes.at(-1)![2], whole[2]);
});

test('a span is a view: it recolours and moves the real glyphs, and goes stale with its line', () => {
  const code = new Code(LINES);
  const line = code.lines[0]!, kv = code.token(0, 'env.KV');
  assert.ok(kv.children.every((g) => g.parent === line), 'not re-parented');
  kv.setFill(GOLD);
  const gold = line.children.filter((g) => g.style.fill === GOLD).length;
  assert.equal(gold, 6);
  const before = code.box()!;
  kv.shift([0, 1]); // the line's and the block's boxes must see it
  assert.ok(close(code.box()![3], kv.box()[3]) && code.box()![3] > before[3] + 0.5);
  line.setText('const hit = 1;');
  assert.equal(kv.stale, true);
  assert.throws(() => kv.box(), /Stale span/);
  assert.equal(code.token(0, '1').stale, false);
});

test('span.animate plays on its line, so the span never joins the scene', async () => {
  const code = new Code(LINES);
  const scene = new Scene(new NullSink());
  scene.add(code);
  await scene.run();
  const kv = code.token(0, 'KV');
  await scene.play(kv.animate.setFill(RED), { runTime: 0.2 });
  assert.deepEqual(scene.mobjects, [code]);
  assert.ok(kv.children.every((g) => g.style.fill === RED));
  assert.equal(code.lines[0]!.children.filter((g) => g.style.fill === RED).length, 2);
  // Last and alone: the builder is not mistaken for play()'s options, so it runs the default second
  const t0 = scene.time;
  await scene.play(code.token(0, 'await').animate.setFill(GOLD));
  assert.ok(Math.abs(scene.time - t0 - 1) < 1e-9, `ran ${scene.time - t0}s`);
  assert.ok(code.token(0, 'await').children.every((g) => g.style.fill === GOLD));
});

test('a copy of a Code addresses its own lines', () => {
  const code = new Code(LINES), copy = code.copy();
  assert.equal(copy.lines[0], copy.children[0]);
  copy.token(0, 'const').setFill(RED);
  assert.ok(code.lines[0]!.children.every((g) => g.style.fill !== RED), 'the original is untouched');
});

const SPANS: ColorSpan[] = [
  { line: 0, from: 0, to: 5, color: '#f97583' },
  { line: 0, from: 18, to: 20, color: '#79b8ff' },
  { line: 1, from: 2, to: 4, color: '#f97583' },
  { line: 1, from: 11, to: 17, color: '#f97583' },
];

test('Code paints its spans at construction, over the base colour', () => {
  const code = new Code(LINES, { color: '#dddddd', spans: SPANS });
  for (const [i, line] of code.lines.entries()) {
    for (const g of line.children) {
      const c = (g as VMobject & { cluster: number }).cluster;
      const s = SPANS.find((x) => x.line === i && c >= x.from && c < x.to);
      assert.equal(g.style.fill, s ? s.color : '#dddddd', `line ${i} index ${c}`);
    }
  }
  assert.throws(() => new Code(['ab'], { spans: [{ line: 1, from: 0, to: 1, color: RED }] }), RangeError);
  assert.throws(() => new Code(['ab'], { spans: [{ line: 0, from: 0, to: 3, color: RED }] }), RangeError);
});

test('a one-colour line is one <path>; a coloured line is one <path> per colour run, with the same ink', () => {
  const plain = new Code(LINES), colored = new Code(LINES, { spans: SPANS });
  assert.equal(records(plain).length, 2); // the empty line draws nothing
  const recs = records(colored);
  // Line 0: [const] hit = await [env].KV.get(key);  -> 4 runs; line 1: [if] (hit) [return] hit;  -> 4 runs
  assert.equal(recs.length, 8);
  // Runs partition the glyphs: their path data concatenates to the single-colour line's
  const d = (rs: ReturnType<typeof records>) => rs.map((r) => r.attrs.d).join('');
  assert.equal(d(recs), d(records(plain)));
  // Pulling the block apart into one element per glyph is what runs avoid
  assert.ok(recs.length < colored.lines.reduce((n, l) => n + l.children.length, 0) / 4);
});

class ColoredScene extends Scene {
  override async construct() {
    await this.step('write');
    const a = new Code(LINES.slice(0, 2), { spans: SPANS }).shift([0, 1]);
    await this.play(new Write(a), { runTime: 1 });
    await this.step('morph');
    const next = ['const hit = await cache.get(key);', '  if (!hit) return load(key);'];
    const b = new Code(next, { spans: tokenize(next.join('\n'), 'ts', { engine: 'fallback' }) }).shift([0, -1]);
    await this.play(new Transform(a, b, { replace: true }), { runTime: 1 });
    await this.play(b.token(1, 'load').animate.setFill(GOLD), { runTime: 0.4 });
    await this.step('out');
    await this.play(new FadeOut(b), { runTime: 0.5 });
  }
}

test('seeking a coloured Write and Transform renders the frames a full run produces, in both path modes', async () => {
  // Absolute mode merges colour runs (the DOM path); mobject ids differ between runs, so compare attributes
  const svg = new StringSink(), dom: string[] = [];
  const both: Sink = {
    async frame(scene) { await svg.frame(scene); dom.push(JSON.stringify(renderElements(scene, { relative: false }).map((r) => r.attrs))); },
  };
  await new ColoredScene(both).run();
  for (const t of [0.4, 1.0, 1.5, 2.2, 2.5, 3.1]) {
    const snap = new SnapshotSink();
    const scene = await renderAt(ColoredScene, t, snap);
    const frame = scene.frameCount;
    assert.equal(snap.svg, svg.frames[frame], `svg at ${t}`);
    assert.equal(JSON.stringify(renderElements(scene, { relative: false }).map((r) => r.attrs)), dom[frame], `dom records at ${t}`);
  }
});

// ---- tokens ----------------------------------------------------------------

const show = (src: string, lang: string): string[] => {
  const lines = src.split('\n');
  return lex(src, lang).map((t) => `${t.line}:${t.from}-${t.to} ${t.kind} ${lines[t.line]!.slice(t.from, t.to)}`);
};

test('the fallback lexer: ts', () => {
  assert.deepEqual(show('const n: number = 0x1f; // hex\nexport async function f(a) { return `t ${a}` }\n/* two\n   lines */ x.default(SQL, null);', 'ts'), [
    '0:0-5 keyword const', '0:7-8 punctuation :', '0:9-15 number number', '0:16-17 punctuation =', '0:18-22 number 0x1f', '0:22-23 punctuation ;', '0:24-30 comment // hex',
    '1:0-6 keyword export', '1:7-12 keyword async', '1:13-21 keyword function', '1:22-23 function f', '1:23-24 punctuation (', '1:25-26 punctuation )', '1:27-28 punctuation {',
    '1:29-35 keyword return', '1:36-44 string `t ${a}`', '1:45-46 punctuation }',
    '2:0-6 comment /* two', '3:3-11 comment lines */', '3:13-14 punctuation .', '3:14-21 function default', '3:21-22 punctuation (', '3:22-25 number SQL',
    '3:25-26 punctuation ,', '3:27-31 number null', '3:31-33 punctuation );',
  ]);
});

test('the fallback lexer: python', () => {
  assert.deepEqual(show('def area(r):\n    """Doc."""\n    return 3.14 * r ** 2  # pi r²\nprint(f"{area(1)}", None)', 'py'), [
    '0:0-3 keyword def', '0:4-8 function area', '0:8-9 punctuation (', '0:10-12 punctuation ):',
    '1:4-14 string """Doc."""',
    '2:4-10 keyword return', '2:11-15 number 3.14', '2:16-17 punctuation *', '2:20-22 punctuation **', '2:23-24 number 2', '2:26-33 comment # pi r²',
    '3:0-5 function print', '3:5-6 punctuation (', '3:6-18 string f"{area(1)}"', '3:18-19 punctuation ,', '3:20-24 number None', '3:24-25 punctuation )',
  ]);
});

test('the fallback lexer: bash', () => {
  assert.deepEqual(show('for f in *.txt; do\n  echo "$f" # each\ndone\ngrep -c a#b \'raw\\\' "$X"', 'sh'), [
    '0:0-3 keyword for', '0:6-8 keyword in', '0:9-11 punctuation *.', '0:14-15 punctuation ;', '0:16-18 keyword do',
    '1:2-6 number echo', '1:7-11 string "$f"', '1:12-18 comment # each',
    '2:0-4 keyword done',
    // `a#b` is a word, not a comment; single quotes have no escapes
    '3:5-6 punctuation -', '3:9-10 punctuation #', '3:12-18 string \'raw\\\'', '3:19-23 string "$X"',
  ]);
});

test('the fallback lexer: elixir', () => {
  assert.deepEqual(show('defmodule Shop do\n  def total(items), do: Enum.sum(items) # sum\n  defp ok, do: {:ok, nil}\nend', 'exs'), [
    '0:0-9 keyword defmodule', '0:10-14 function Shop', '0:15-17 keyword do',
    '1:2-5 keyword def', '1:6-11 function total', '1:11-12 punctuation (', '1:17-19 punctuation ),', '1:20-23 number do:', '1:28-29 punctuation .',
    '1:29-32 function sum', '1:32-33 punctuation (', '1:38-39 punctuation )', '1:40-45 comment # sum',
    '2:2-6 keyword defp', '2:7-9 function ok', '2:9-10 punctuation ,', '2:11-14 number do:', '2:15-16 punctuation {', '2:16-19 number :ok',
    '2:19-20 punctuation ,', '2:21-24 number nil', '2:24-25 punctuation }',
    '3:0-3 keyword end',
  ]);
});

test('tokenize() maps kinds to the palette, leaves punctuation uncoloured and merges touching runs', () => {
  const src = 'if (a) return "x" + "y"\n# not a ts comment';
  const spans = tokenize(src, 'ts', { engine: 'fallback' });
  assert.deepEqual(spans, [
    { line: 0, from: 0, to: 2, color: DARK.keyword },
    { line: 0, from: 7, to: 13, color: DARK.keyword },
    { line: 0, from: 14, to: 17, color: DARK.string },
    { line: 0, from: 20, to: 23, color: DARK.string },
  ]);
  assert.deepEqual(tokenize(src, 'ts', { engine: 'fallback' }), spans, 'deterministic');
  // Windows line endings index the same lines
  assert.deepEqual(tokenize(src.replace('\n', '\r\n'), 'ts', { engine: 'fallback' }), spans);
  // A palette that colours punctuation gets it, merged with what it touches
  const all = tokenize('f(a);', 'js', { engine: 'fallback', palette: { ...DARK, punctuation: '#888888' } });
  assert.deepEqual(all.map((s) => [s.from, s.to, s.color]), [[0, 1, DARK.function], [1, 2, '#888888'], [3, 5, '#888888']]);
  assert.equal(langOf('.ex'), 'elixir');
  assert.throws(() => langOf('cobol'), /Unknown language/);
});

test('tools/tokens.ts prints the spans JSON for stdin', () => {
  const src = 'def f():\n    return 1  # one\n';
  const r = spawnSync(process.execPath, ['tools/tokens.ts', '-', '--lang', 'python', '--engine', 'fallback'], { input: src, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), tokenize(src, 'python', { engine: 'fallback' }));
  assert.match(r.stderr, /engine fallback/);
});

const shikiSkip = hasShiki() ? false : 'shiki is not installed (a pinned devDependency: run npm install)';

test('shiki and the fallback lexer cover the same ranges on simple code', { skip: shikiSkip }, () => {
  const snippets: Array<[string, string]> = [
    ['ts', 'async function getUser(id, env) {\n  return env.DB.prepare(SQL).bind(id).first(); // hi\n}'],
    ['python', 'def greet(name):\n    return "hi"  # c'],
    ['elixir', 'defmodule A do\n  def f(x), do: x # c\nend'],
    ['bash', 'if true; then\n  echo "hi" # c\nfi'],
  ];
  for (const [lang, src] of snippets) {
    const key = (t: { line: number; from: number; to: number; kind: string }) => `${t.line}:${t.from}-${t.to} ${t.kind}`;
    assert.deepEqual(shikiTokens(src, langOf(lang))!.map(key), lex(src, lang).filter((t) => t.kind !== 'punctuation').map(key), lang);
  }
  // Both engines speak the same data format and palette
  const colors = new Set(Object.values(DARK));
  for (const s of tokenize(snippets[0]![1], 'ts', { engine: 'shiki' })) assert.ok(colors.has(s.color));
});
