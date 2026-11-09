// Property tests for explain/panels.ts: CodeBlock and Card, drawn from state and synced by a view.
// Scenes use a NullSink and skip every frame, so a play costs its begin and
// finish only. Counts: test/lib/pbt.ts (FULL=1 is 10x).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Text, VMobject } from '../src/index.ts';
import type { Mobject, TransformMatching } from '../src/index.ts';
import { NullSink } from '../src/output.ts';
import { loadFonts } from '../explain/testing.ts';
import type { Box, Vec } from '../src/index.ts';
import { Card, CodeBlock } from '../explain/panels.ts';
import type { CardRow } from '../explain/panels.ts';
import { REGIONS, emphasis, good, bad } from '../explain/look.ts';
import type { Region } from '../explain/look.ts';
import { fc, params } from './lib/pbt.ts';
import { hexColor } from './lib/random-snapshot.ts';
import { view } from '../explain/index.ts';
import type { View } from '../explain/index.ts';

await loadFonts();

// Points are float32: at stage magnitudes (up to 16) one unit in the last place is about 1e-6.
const EPS = 1e-5;
const scene = () => new Scene(new NullSink());
const palette = fc.record({ paper: hexColor, ink: hexColor, accent: hexColor, muted: hexColor });
/** Lines: a tiny alphabet (so many lines repeat), empty lines, near-duplicates and any text. */
const line = fc.oneof(
  fc.constantFrom('a', 'b', 'c', '', 'a ', 'x = 1;', 'é', 'é', '\tb', 'a\tb'),
  fc.string({ unit: 'grapheme', maxLength: 24 }),
  fc.string({ unit: 'binary', maxLength: 8 }),
);
const lines = (min = 0) => fc.array(line, { minLength: min, maxLength: 10 });
const region = fc.constantFrom(...(Object.keys(REGIONS) as Region[]));
const box: fc.Arbitrary<Box> = fc
  .tuple(
    fc.double({ min: -8, max: 7, noNaN: true }),
    fc.double({ min: -4.5, max: 4, noNaN: true }),
    fc.double({ min: 0, max: 16, noNaN: true }),
    fc.double({ min: 0, max: 9, noNaN: true }),
  )
  .map(([x, y, w, h]): Box => [x, y, x + w, y + h]);
const point: fc.Arbitrary<Vec> = fc.tuple(fc.double({ min: -7, max: 7, noNaN: true }), fc.double({ min: -4, max: 4, noNaN: true }));
const regionOf = (at: Box | Region): Box => (typeof at === 'string' ? [...REGIONS[at]] : at);
const inside = (b: Box, r: Box) => b[0] >= r[0] - EPS && b[1] >= r[1] - EPS && b[2] <= r[2] + EPS && b[3] <= r[3] + EPS;

// ---- CodeBlock -----------------------------------------------------------------

const placed = fc.oneof(region, box.filter((b) => b[2] - b[0] > 0.7));
/** A code block, unless refused for want of room: then that must be the documented refusal, and true. */
function code(colors: Of<typeof palette>, text: string[], opts: Record<string, unknown>): CodeBlock {
  try {
    return new CodeBlock(scene(), colors, text, opts);
  } catch (error) {
    assert.match((error as Error).message, /no room for code/);
    const at = opts.at as Box;
    assert.ok(at[2] - at[0] - 0.7 < ((opts.size as number) ?? 0.25));
    fc.pre(false);
    throw error;
  }
}
/** CodeBlock's other knobs: font size and an optional title. */
const knobs = fc.record({ size: fc.double({ min: 0.08, max: 0.5, noNaN: true }), title: fc.option(fc.string({ maxLength: 16 }), { nil: undefined }) }, { requiredKeys: [] });

test('a code block placed in a box fits its width and never rises above its top', () => {
  fc.assert(
    fc.property(palette, lines(1), placed, fc.constantFrom('center' as const, 'top' as const), knobs, (colors, text, at, align, k) => {
      const block = code(colors, text, { at, align, ...k });
      const b = block.panel.box()!,
        r = regionOf(at);
      assert.ok(b[0] >= r[0] - EPS && b[2] <= r[2] + EPS, `${b} wider than ${r}`);
      assert.ok(b[3] <= r[3] + EPS, `${b} above ${r}`);
      if (align === 'top') assert.ok(Math.abs(b[3] - r[3]) < EPS);
    }),
    params(),
  );
});

test('a code block refuses a box too narrow for code', () => {
  fc.assert(
    fc.property(palette, lines(1), box, fc.double({ min: 0.08, max: 0.5, noNaN: true }), (colors, code, at, fontSize) => {
      fc.pre(at[2] - at[0] - 0.7 < fontSize);
      assert.throws(() => new CodeBlock(scene(), colors, code, { at, size: fontSize }), /no room for code/);
    }),
    params(),
  );
});

test('a code block refuses empty code', () => {
  fc.assert(
    fc.property(palette, fc.option(placed, { nil: undefined }), (colors, at) => {
      assert.throws(() => new CodeBlock(scene(), colors, [], at ? { at } : {}), /at least one line|no room for code/);
    }),
    params(),
  );
});

test('a block drawn lit has the bar over exactly the chosen lines, inside the block', () => {
  fc.assert(
    fc.property(
      palette,
      lines(1).chain((code) =>
        fc.tuple(fc.constant(code), fc.nat({ max: code.length - 1 }), fc.nat({ max: code.length - 1 })),
      ),
      fc.option(placed, { nil: undefined }),
      (colors, [text, x, y], at) => {
        const [a, b] = [Math.min(x, y), Math.max(x, y)];
        const block = code(colors, text, { ...(at ? { at } : {}), lit: { lines: a === b ? a : [a, b] } });
        const bar = block.bar.box()!;
        const row = (i: number) => block.code.lines[i]!.anchorPoint()[1];
        for (let i = 0; i < text.length; i++) {
          const on = row(i) > bar[1] && row(i) < bar[3];
          assert.equal(on, i >= a && i <= b, `line ${i} vs bar over ${a}..${b}`);
        }
        assert.equal(block.bar.parent, block);
        assert.equal(block.bar.style.opacity, 1);
        assert.ok(block.children.indexOf(block.bar) < block.children.indexOf(block.code), 'the bar draws behind the code');
      },
    ),
    params(),
  );
});

test('lit refuses any line that is not an index into the code, with the documented error', () => {
  fc.assert(
    fc.property(
      palette,
      lines(1),
      fc.oneof(
        fc.double().filter((n) => !Number.isInteger(n)),
        fc.integer({ max: -1 }),
        fc.integer({ min: 10, max: 1e6 }),
        fc.tuple(fc.integer({ min: -3, max: 12 }), fc.integer({ min: -3, max: 12 })),
      ),
      (colors, code, bad) => {
        const [a, b] = typeof bad === 'number' ? [bad, bad] : bad;
        fc.pre(!(Number.isInteger(a) && Number.isInteger(b) && a >= 0 && b < code.length && a <= b));
        assert.throws(() => new CodeBlock(scene(), colors, code, { lit: { lines: bad as number } }), /^RangeError: code\(\): lit names lines .* which are not lines of this panel/);
      },
    ),
    params(),
  );
});

/** Play a keyed, staged sync of `v`, as a view of state is synced; the matching it played, or null when the picture did not change. */
async function keyedSync(sc: Scene, v: View): Promise<TransformMatching | null> {
  const sync = v.sync();
  await sc.play(sync);
  return sync.inner as TransformMatching | null;
}
/** The member of `among` that `part` is, or is inside. */
const within = (part: Mobject, among: ReadonlySet<Mobject>): Mobject | null => {
  for (let m: Mobject | null = part; m; m = m.parent) if (among.has(m)) return m;
  return null;
};
/** Whether a Text draws anything a matching can pair (an empty or blank line draws nothing); ask before a sync fades it. */
const draws = (t: Text) => t.family().some((m) => m instanceof VMobject && (m.style.opacity ?? 1) > 0 && m.hasPoints());
/**
 * Which of `old`'s texts the matching kept (their glyphs paired, each with a glyph of a new text that
 * `partner` accepts) and which it faded (their glyphs removed). A picture that did not change kept all.
 */
function keptAndFaded(matching: TransformMatching | null, old: readonly Text[], now: readonly Text[], partner: (was: Text, is: Text) => boolean) {
  const olds = new Set<Mobject>(old), news = new Set<Mobject>(now);
  if (!matching) return { kept: new Set(old), faded: new Set<Text>() };
  const kept = new Set<Text>(), faded = new Set<Text>();
  for (const [a, b] of matching.pairs) {
    const was = within(a, olds) as Text | null;
    if (!was) continue;
    const is = within(b, news) as Text | null;
    assert.ok(is && partner(was, is), `"${was.text}" paired with ${is ? `"${is.text}"` : 'nothing it can be'}`);
    kept.add(was);
  }
  for (const a of matching.removed) {
    const was = within(a, olds) as Text | null;
    if (was) faded.add(was);
  }
  for (const t of kept) assert.ok(!faded.has(t), `"${t.text}" both kept and faded`);
  return { kept, faded };
}

const syncCase = fc.record({
  colors: palette,
  before: lines(1),
  after: lines(1),
  at: fc.option(placed, { nil: undefined }),
  focus: fc.option(fc.nat(), { nil: undefined }),
  knobs,
});
type Of<A> = A extends fc.Arbitrary<infer T> ? T : never;
/** A keyed code block drawn by a view from `before`, then synced to `after` (lit on a line, if `focus`). */
async function synced({ colors, before, after, at, focus, knobs: k }: Of<typeof syncCase>) {
  const opts = { ...(at ? { at } : {}), ...k };
  // Refused for want of room: the documented refusal, and no case.
  code(colors, before, opts);
  code(colors, after, opts);
  const sc = scene();
  let state: { lines: string[]; focus: number | null } = { lines: before, focus: null };
  const v = view(sc, () => new CodeBlock(sc, colors, state.lines, { ...opts, lit: state.focus == null ? null : { lines: state.focus }, key: 'code' }), { place: false });
  sc.add(v);
  const old = v.current, drawn = new Set(old.code.lines.filter(draws));
  state = { lines: after, focus: focus == null ? null : focus % after.length };
  const matching = await keyedSync(sc, v);
  return { sc, v, old, drawn, block: v.current, matching };
}
const counts = (xs: readonly string[]) => xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>());

test('a keyed sync turns the code into the next lines, pairing each line with one of the same text and fading only the lines left over', async () => {
  await fc.assert(
    fc.asyncProperty(syncCase, async (c) => {
      const { block, old, drawn: drawable, matching } = await synced(c);
      // Text.text keeps the source line (including tabs); only glyph layout expands tab stops.
      assert.deepEqual(block.code.lines.map((l) => l.text), c.after);
      const { kept, faded } = keptAndFaded(matching, old.code.lines, block.code.lines, (was, is) => was.text === is.text);
      // Of each text, as many lines stay as both sides have; the rest of the old ones fade.
      const [a, b] = [counts(c.before), counts(c.after)];
      for (const [text, n] of a) {
        const drawn = old.code.lines.filter((l) => l.text === text && drawable.has(l));
        if (!drawn.length) continue;
        const stay = Math.min(n, b.get(text) ?? 0);
        assert.equal(drawn.filter((l) => kept.has(l)).length, stay, `lines "${text}" kept`);
        assert.equal(drawn.filter((l) => faded.has(l)).length, n - stay, `lines "${text}" faded`);
      }
    }),
    params(300),
  );
});

test('after a keyed sync no departed line is on stage, and the block shows exactly its lines', async () => {
  await fc.assert(
    fc.asyncProperty(syncCase, async (c) => {
      const { sc, block, old } = await synced(c);
      const present = new Set(sc.familyMembers());
      assert.deepEqual(old.code.lines.filter((l) => present.has(l)).map((l) => l.text), []);
      const shown = sc.familyMembers().filter((m): m is Text => m instanceof Text && m.parent === block.code);
      // By identity: a deep diff of mobjects runs away on failure.
      assert.ok(shown.length === block.code.lines.length && shown.every((t, i) => t === block.code.lines[i]), 'the block shows exactly its lines');
    }),
    params(300),
  );
});

test('after a keyed sync, the lit line is as on a fresh block: the bar is the block’s, over the line, behind the code', async () => {
  await fc.assert(
    fc.asyncProperty(syncCase, async (c) => {
      const { block } = await synced(c);
      assert.equal(block.bar.parent, block, 'the lit bar belongs to the block');
      assert.ok(block.children.indexOf(block.bar) < block.children.indexOf(block.code), 'the bar draws behind the code');
      if (c.focus == null) return assert.equal(block.bar.style.opacity, 0);
      const i = c.focus % c.after.length;
      const bar = block.bar.box()!,
        y = block.code.lines[i]!.anchorPoint()[1];
      assert.equal(block.bar.style.opacity, 1);
      assert.ok(y > bar[1] && y < bar[3]);
    }),
    params(300),
  );
});

test('scale probe: a keyed sync of 600 lines of code pairs its repeated lines quickly', async () => {
  const a = Array.from({ length: 600 }, (_, i) => `line ${i % 37}`),
    b = Array.from({ length: 600 }, (_, i) => `line ${(i * 7) % 37}`);
  const colors = { paper: '#000000', ink: '#ffffff', accent: '#ff8800', muted: '#888888' };
  const sc = scene();
  let now = a;
  const v = view(sc, () => new CodeBlock(sc, colors, now, { key: 'code' }), { place: false });
  sc.add(v);
  const old = v.current;
  const t = performance.now();
  now = b;
  const { kept } = keptAndFaded(await keyedSync(sc, v), old.code.lines, v.current.code.lines, (was, is) => was.text === is.text);
  const [ca, cb] = [counts(a), counts(b)];
  assert.equal(kept.size, [...ca].reduce((n, [text, k]) => n + Math.min(k, cb.get(text) ?? 0), 0));
  assert.ok(performance.now() - t < 10_000);
});

test('a titled block keeps its title inside the panel and above the code', () => {
  fc.assert(
    fc.property(palette, lines(1), fc.option(placed, { nil: undefined }), knobs.filter((k) => !!k.title?.trim()), (colors, text, at, k) => {
      const block = code(colors, text, { ...(at ? { at } : {}), ...k });
      const head = block.children.find((m): m is Text => m instanceof Text && m.text === k.title)!;
      const h = head.box()!,
        p = block.panel.box()!,
        lines = block.code.box();
      assert.ok(h[0] >= p[0] - EPS && h[2] <= p[2] + EPS && h[3] <= p[3] + EPS, `title ${h} outside panel ${p}`);
      if (lines) assert.ok(h[1] >= lines[3] - 0.05, `title ${h} over code ${lines}`);
    }),
    params(300),
  );
});

test('diff marks one bar per +/- line, green for added and red for removed', () => {
  fc.assert(
    fc.property(palette, fc.array(fc.oneof(line, line.map((l) => '+ ' + l), line.map((l) => '- ' + l)), { minLength: 1, maxLength: 10 }), (colors, code) => {
      const block = new CodeBlock(scene(), colors, code, { diff: true });
      const marked = code.filter((l) => /^[+-] /.test(l));
      assert.deepEqual(block.marks.map((m) => m.kind), marked.map((l) => (l[0] === '+' ? 'added' : 'removed')));
      // A solid gutter edge marks the line by shape, not only by its tint.
      for (const m of block.marks) {
        const color = m.kind === 'added' ? good(colors) : bad(colors);
        const filled = m.mob.family().filter((part) => part.style.fill === color && part.box());
        assert.equal(filled.length, 2, 'both tint and solid gutter use the outcome color');
        assert.ok(filled.some((part) => (part.style.fillOpacity ?? 1) === 1 && part.width() > 0 && part.height() > 0),
          'a visible solid gutter identifies the diff line by shape');
      }
    }),
    params(),
  );
});

test('a block drawn with added lines bars exactly those, in the added colour, and a keyed sync to a state without them takes the bars off the stage', async () => {
  await fc.assert(
    fc.asyncProperty(palette, lines(1).chain((code) => fc.tuple(fc.constant(code), fc.subarray(code.map((_, i) => i), { minLength: 1 }))), async (colors, [code, added]) => {
      const sc = scene();
      let state: number[] = added;
      const v = view(sc, () => new CodeBlock(sc, colors, code, { added: state, key: 'code' }), { place: false });
      sc.add(v);
      const block = v.current;
      assert.deepEqual(block.marks.map((m) => [m.line, m.kind]).sort(), added.map((i) => [i, 'added']).sort());
      for (const m of block.marks) {
        const y = block.code.lines[m.line]!.anchorPoint()[1], b = m.mob.box()!;
        assert.ok(y > b[1] && y < b[3], `the bar for line ${m.line} is on it`);
        assert.ok(m.mob.family().some((part) => part.style.fill === good(colors) && (part.style.fillOpacity ?? 1) === 1), 'a solid gutter edge');
      }
      state = [];
      await keyedSync(sc, v);
      assert.equal(v.current.marks.length, 0);
      const present = new Set(sc.familyMembers());
      assert.ok(block.marks.every((m) => !present.has(m.mob)), 'no bar is left on stage');
    }),
    params(),
  );
});

// ---- Card ----------------------------------------------------------------------

const label = fc.oneof(fc.string({ unit: 'grapheme', minLength: 1, maxLength: 40 }), fc.constantFrom('__proto__', 'constructor', 'toString', 'A long label here'));
const value = fc.oneof(fc.string({ unit: 'grapheme', maxLength: 40 }), fc.integer(), fc.double(), fc.constantFrom(null, undefined, -0, NaN, ''));
const rows = fc.uniqueArray(fc.tuple(label, value), { minLength: 1, maxLength: 6, selector: ([l]) => l });
const cardAt = fc.oneof(region, box, point);
const cardCase = fc.record({
  colors: palette,
  rows,
  at: fc.option(cardAt, { nil: undefined }),
  width: fc.option(fc.double({ min: 1.2, max: 12, noNaN: true }), { nil: undefined }),
  title: fc.option(fc.string({ maxLength: 20 }), { nil: undefined }),
  align: fc.constantFrom('center' as const, 'top' as const),
  direction: fc.constantFrom(undefined, 'ltr' as const, 'rtl' as const),
  fontSize: fc.option(fc.double({ min: 0.08, max: 0.5, noNaN: true }), { nil: undefined }),
});
const card = (c: Of<typeof cardCase>) => {
  const s = scene();
  const k = new Card(s, c.colors, c.rows, { ...(c.at ? { at: c.at } : {}), ...(c.width != null ? { width: c.width } : {}), ...(c.title ? { title: c.title } : {}), ...(c.fontSize != null ? { size: c.fontSize } : {}), ...(c.direction ? { direction: c.direction } : {}), align: c.align });
  s.add(k);
  return { s, k };
};
/** The card, or null when it is refused as too narrow (the documented refusal; anything else throws). */
function tryCard(c: Of<typeof cardCase>) {
  try {
    return card(c);
  } catch (error) {
    assert.match((error as Error).message, /no room for its rows/);
    return null;
  }
}
// Positive layouts need padding plus 2.5 font-size units for a row. Derive the
// minimum from each sample's size, preserving narrow valid cards at small sizes.
const fittingCardCase = cardCase.map((c) => {
  const minimum = 0.56 + 2.5 * (c.fontSize ?? 0.24) + EPS;
  // Keep undefined/default placement, named regions and points as authored.
  // Only explicit boxes can be too narrow; copy one before widening it.
  const at = typeof c.at !== 'string' && c.at?.length === 4 ? [...c.at] as Box : c.at;
  if (typeof at !== 'string' && at?.length === 4 && at[2] - at[0] < minimum) at[2] = at[0] + minimum;
  return { ...c, at, width: c.width === undefined ? undefined : Math.max(minimum, c.width) };
});

test('arbitrary card layouts are accepted or refused only for insufficient row width', () => {
  fc.assert(fc.property(cardCase, (c) => {
    const at = typeof c.at === 'string' ? regionOf(c.at) : c.at;
    const cap = at?.length === 4 ? at[2]! - at[0]! : Infinity;
    const available = Math.min(c.width ?? Infinity, cap);
    const required = 0.56 + 2.5 * (c.fontSize ?? 0.24);
    const made = tryCard(c);
    if (available >= required) assert.ok(made, 'a layout with enough row width must be accepted');
    if (made) rowsInside(made.k);
  }), params());
});

/** Every label and value lies inside the panel, and values retain their anchored padding. */
function rowsInside(k: Card) {
  const p = k.panel.box()!;
  for (const t of [...k.labels.values(), ...k.values.values()]) {
    const b = t.box();
    if (!b) continue;
    assert.ok(b[0] >= p[0] - EPS && b[2] <= p[2] + EPS, `"${t.text}" ${b} outside panel ${p}`);
  }
  for (const v of k.values.values()) {
    const b = v.box();
    if (b) assert.ok(k.direction === 'ltr' ? b[2] <= p[2] - 0.28 + EPS : b[0] >= p[0] + 0.28 - EPS, `value "${v.text}" past its anchored edge`);
  }
}

test('a card in a box is no wider than the box and never rises above its top', () => {
  fc.assert(
    fc.property(fittingCardCase.filter((c) => !!c.at && (c.at as unknown[]).length !== 2), (c) => {
      const made = card(c);
      const b = made.k.panel.box()!,
        r = regionOf(c.at as Box | Region);
      assert.ok(b[2] - b[0] <= r[2] - r[0] + EPS);
      assert.ok(b[3] <= r[3] + EPS);
      if (c.align === 'top') assert.ok(Math.abs(b[3] - r[3]) < EPS);
    }),
    params(),
  );
});

test('a card at a point is centred on it', () => {
  fc.assert(
    fc.property(fittingCardCase, point, (c, at) => {
      const made = card({ ...c, at });
      const { k } = made;
      const [x, y] = k.panel.center();
      assert.ok(Math.abs(x - at[0]) < EPS && Math.abs(y - at[1]) < EPS);
    }),
    params(),
  );
});

test('every label and value fits inside its card, never mirrored', () => {
  fc.assert(
    fc.property(fittingCardCase, (c) => {
      const made = card(c);
      rowsInside(made.k);
    }),
    params(),
  );
});

test('a card too narrow for any row is refused', () => {
  // Too narrow: less than the padding, the label gap and one glyph's width (2 x 0.28 + 2.5 x size).
  // The boundary is the card's contract with authors, so it is pinned exactly.
  fc.assert(
    fc.property(fittingCardCase, fc.double({ min: 0, max: 1, noNaN: true }), (c, f) => {
      const size = c.fontSize ?? 0.24;
      const width = f * (0.56 + 2.5 * size) * (1 - 1e-9);
      assert.throws(() => card({ ...c, width, at: undefined }), /no room for its rows/);
    }),
    params(),
  );
});

test('a repeated row label draws every row, but lit refuses it as ambiguous', () => {
  fc.assert(
    fc.property(palette, rows, fc.nat(), value, (colors, r, k, v) => {
      const label = r[k % r.length]![0];
      const dup = [...r, [label, v] as const];
      const s = scene();
      const card = new Card(s, colors, dup, { width: 12 });
      assert.equal(card.family().filter((m) => m instanceof Text && m.parent === card).length, 2 * dup.length);
      assert.throws(() => new Card(s, colors, dup, { width: 12, lit: { row: label } }), /not unique/);
      // Keyed, every row's label takes its own row's key: none is left unkeyed and none keyed twice.
      const keyed = new Card(s, colors, dup, { width: 12, key: 'c' });
      const labelKeys = keyed.family().filter((m) => m.key?.match(/^c:row:\d+$/)).map((m) => m.key);
      assert.deepEqual(labelKeys, dup.map((_, i) => `c:row:${i}`));
    }),
    params(),
  );
});

const changesFor = (r: readonly (readonly [string, unknown])[]) =>
  fc.subarray(r.map(([l]) => l)).chain((ls) => fc.tuple(...ls.map(() => value)).map((vs) => Object.fromEntries(ls.map((l, i) => [l, vs[i]]))));
/** A keyed card drawn by a view from the case's rows, then synced to the rows with `changes` applied. */
async function syncedCard(c: Of<typeof cardCase>, changes: Record<string, unknown>) {
  const made = card(c);
  const opts = { ...(c.at ? { at: c.at } : {}), ...(c.width != null ? { width: c.width } : {}), ...(c.title ? { title: c.title } : {}), ...(c.fontSize != null ? { size: c.fontSize } : {}), ...(c.direction ? { direction: c.direction } : {}), align: c.align, key: 'card' };
  const sc = made.s;
  sc.remove(made.k);
  let now: readonly CardRow[] = c.rows;
  const v = view(sc, () => new Card(sc, c.colors, now, opts), { place: false });
  sc.add(v);
  const old = v.current, drawn = new Set([...old.values.values()].filter(draws));
  now = c.rows.map(([l, v]) => [l, Object.hasOwn(changes, l) ? changes[l] : v] as const);
  const matching = await keyedSync(sc, v);
  return { s: sc, old, drawn, k: v.current, matching };
}

test('a keyed sync shows each new value, keeps every unchanged value and fades only the changed ones', async () => {
  await fc.assert(
    fc.asyncProperty(fittingCardCase.chain((c) => fc.tuple(fc.constant(c), changesFor(c.rows))), async ([c, changes]) => {
      const { old, drawn, k, matching } = await syncedCard(c, changes);
      const row = (card: Card, t: Mobject) => [...card.values].find(([, v]) => v === t)![0];
      const { kept, faded } = keptAndFaded(matching, [...old.values.values()], [...k.values.values()], (was, is) => row(old, was) === row(k, is) && was.text === is.text);
      for (const [l] of c.rows) {
        const before = old.values.get(l)!;
        const expected = Object.hasOwn(changes, l) ? String(changes[l]) : before.text;
        assert.equal(k.values.get(l)!.text, expected);
        if (!drawn.has(before)) continue;
        if (before.text === expected) assert.ok(kept.has(before), `${l} stays`);
        else assert.ok(faded.has(before), `${l} fades out as its new value comes in`);
      }
    }),
    params(300),
  );
});

test('after a keyed sync, each row shows exactly one value, inside the card', async () => {
  await fc.assert(
    fc.asyncProperty(fittingCardCase.chain((c) => fc.tuple(fc.constant(c), changesFor(c.rows))), async ([c, changes]) => {
      const { s, old, k } = await syncedCard(c, changes);
      const now = [...k.values.values()];
      const present = new Set(s.familyMembers());
      assert.equal(now.filter((t) => present.has(t)).length, c.rows.length);
      // A picture that did not change stays (the view keeps it); a changed one leaves the stage.
      if (old !== k) assert.deepEqual([...old.values.values()].filter((t) => present.has(t)), [], 'the old picture’s values leave the stage');
      rowsInside(k);
    }),
    params(300),
  );
});

test('a card drawn lit, synced from row to row, lights each row; drawn unlit, it hides the bar', async () => {
  await fc.assert(
    fc.asyncProperty(fittingCardCase.chain((c) => fc.tuple(fc.constant(c), fc.array(fc.option(fc.constantFrom(...c.rows.map(([l]) => l))), { minLength: 1, maxLength: 5 }))), async ([c, lit]) => {
      const made = card(c);
      const opts = { ...(c.at ? { at: c.at } : {}), ...(c.width != null ? { width: c.width } : {}), ...(c.title ? { title: c.title } : {}), ...(c.fontSize != null ? { size: c.fontSize } : {}), ...(c.direction ? { direction: c.direction } : {}), align: c.align, key: 'card' };
      const sc = made.s;
      sc.remove(made.k);
      let row: string | null = null;
      const v = view(sc, () => new Card(sc, c.colors, c.rows, { ...opts, lit: row == null ? null : { row } }), { place: false });
      sc.add(v);
      for (const l of lit) {
        row = l;
        await keyedSync(sc, v);
        const k = v.current;
        if (l == null) assert.equal(k.bar.style.opacity, 0);
        else {
          assert.equal(k.bar.style.opacity, 1);
          assert.ok(Math.abs(k.bar.center()[1] - k.values.get(l)!.anchorPoint()[1]) < EPS);
          assert.equal(k.bar.style.fill, emphasis(c.colors));
        }
      }
    }),
    params(300),
  );
});


// Columns: a row gives one value per column, or one value that spans them.
const columnCase = fc
  .record({
    colors: palette,
    columns: fc.uniqueArray(fc.string({ unit: 'grapheme', minLength: 1, maxLength: 8 }), { minLength: 1, maxLength: 3 }),
    labels: fc.uniqueArray(label, { minLength: 1, maxLength: 5 }),
    direction: fc.constantFrom('ltr' as const, 'rtl' as const),
    width: fc.option(fc.double({ min: 6, max: 14, noNaN: true }), { nil: undefined }),
  })
  .chain((c) =>
    fc.tuple(...c.labels.map(() => fc.oneof(fc.array(value, { minLength: c.columns.length, maxLength: c.columns.length }), fc.tuple(value)))).map((vs) => ({
      ...c,
      // Each row has at least one value: one per column, or one that spans them.
      rows: c.labels.map((l, i) => [l, ...vs[i]!] as unknown as CardRow),
    })),
  );
const columned = (c: Of<typeof columnCase>) =>
  new Card(scene(), c.colors, c.rows, { columns: c.columns, direction: c.direction, ...(c.width != null ? { width: c.width } : {}) });

test('uncapped columned cards keep headings at their authored size with single-value rows', () => {
  fc.assert(
    fc.property(
      palette,
      fc.uniqueArray(fc.string({ unit: 'grapheme', minLength: 1, maxLength: 24 }), { minLength: 1, maxLength: 6 }),
      fc.constantFrom('ltr' as const, 'rtl' as const),
      fc.double({ min: 0.08, max: 0.5, noNaN: true }),
      (colors, columns, direction, fontSize) => {
        // One column also has one value per row; neither shape may discard its heading's width.
        const k = new Card(scene(), colors, [['Requests', 'A B C']], { columns, direction, size: fontSize });
        const data = new Set([...k.labels.values(), ...[...k.cells.values()].flat()]);
        const headings = k.children.filter((m): m is Text => m instanceof Text && !data.has(m));
        assert.deepEqual(headings.map((h) => h.text), columns);
        const panel = k.panel.box()!;
        for (const h of headings) {
          assert.ok(Math.abs(h.textSize() - fontSize) < EPS, `heading ${h.text} shrank despite having no width cap`);
          const b = h.box();
          if (b) assert.ok(inside(b, panel), `heading ${h.text} is outside its card`);
        }
      },
    ),
    params(),
  );
});

test('a columned card keeps every heading, label and value inside it, each column on its own edge', () => {
  fc.assert(
    fc.property(columnCase, (c) => {
      const k = columned(c), p = k.panel.box()!, n = c.columns.length;
      const texts = k.family().filter((m): m is Text => m instanceof Text);
      for (const t of texts) {
        const b = t.box();
        if (b) assert.ok(b[0] >= p[0] - EPS && b[2] <= p[2] + EPS, `"${t.text}" ${b} outside panel ${p}`);
      }
      const ltr = c.direction === 'ltr';
      // Values in a column share its anchored edge, and columns keep their order across the row.
      const edges = Array.from({ length: n }, () => new Set<string>());
      for (const [l] of c.rows) {
        const cells = k.cells.get(l)!;
        if (cells.length !== n || n === 1) continue;
        // A value is placed by its ink box, so that box's anchored edge is the column's.
        cells.forEach((cell, j) => {
          const b = cell.box();
          if (b) edges[j]!.add((ltr ? b[2] : b[0]).toFixed(3));
        });
        for (let j = 1; j < n; j++) {
          const a = cells[j - 1]!.box(), b = cells[j]!.box();
          if (a && b) assert.ok(ltr ? a[2] <= b[0] + EPS : a[0] >= b[2] - EPS, `${l}: column ${j - 1} runs into column ${j}`);
        }
        const lb = k.labels.get(l)!.box(), first = cells[0]!.box();
        if (lb && first) assert.ok(ltr ? lb[2] <= first[0] + EPS : lb[0] >= first[2] - EPS, `${l}: label runs into its first value`);
      }
      for (const e of edges) assert.ok(e.size <= 1, 'a column has one edge');
    }),
    params(),
  );
});

test('a columned card is described by row and column, and a keyed sync changes one column and keeps the others', async () => {
  await fc.assert(
    fc.asyncProperty(columnCase.filter((c) => c.columns.length > 1 && c.rows.some((r) => r.length > 2)), value, async (c, v) => {
      const k = columned(c);
      const row = c.rows.find((r) => r.length > 2)!, l = row[0];
      const names = k.describe().parts.map((p) => p.name);
      c.columns.forEach((col, j) => assert.ok(names.includes(`${l} (${col}): ${String(row[j + 1])}`)));
      // The same card drawn by a view, its first column of that row changed by the state.
      const sc = scene();
      const options = { columns: c.columns, direction: c.direction, ...(c.width != null ? { width: c.width } : {}), key: 'card' };
      let now = c.rows;
      const view_ = view(sc, () => new Card(sc, c.colors, now, options), { place: false });
      sc.add(view_);
      const old = view_.current, drawn = new Set(old.cells.get(l)!.filter(draws));
      const next = c.columns.map((_, j) => (j === 0 ? v : row[j + 1]));
      now = c.rows.map((r) => (r === row ? ([l, ...next] as unknown as CardRow) : r));
      const matching = await keyedSync(sc, view_);
      const synced = view_.current;
      const before = old.cells.get(l)!, after = synced.cells.get(l)!;
      const column = (card: Card, t: Text) => card.cells.get(l)!.indexOf(t);
      const { kept, faded } = keptAndFaded(matching, before, after, (was, is) => column(old, was) === column(synced, is) && was.text === is.text);
      after.forEach((cell, j) => {
        assert.equal(cell.text, String(next[j]));
        if (!drawn.has(before[j]!)) return;
        if (String(next[j]) === before[j]!.text) assert.ok(kept.has(before[j]!), `column ${j} stays`);
        else assert.ok(faded.has(before[j]!), `column ${j} fades out as its new value comes in`);
      });
      assert.equal(synced.values.get(l), after.at(-1));
    }),
    params(),
  );
});

test('a row whose value count matches neither one nor the columns is refused', () => {
  assert.throws(() => new Card(scene(), { paper: '#fff', ink: '#000', accent: '#00f', muted: '#888' }, [['Hits', 1, 2]]), /pass columns/);
  assert.throws(() => new Card(scene(), { paper: '#fff', ink: '#000', accent: '#00f', muted: '#888' }, [['Hits', 1, 2]], { columns: ['A', 'B', 'C'] }), /2 values for 3 columns/);
  const spanning = new Card(scene(), { paper: '#fff', ink: '#000', accent: '#00f', muted: '#888' }, [['Requests', 'A B C'], ['Hits', 0, 3]], { columns: ['LRU', 'MRU'] });
  assert.deepEqual(spanning.describe().parts.map((p) => p.name), ['Requests: A B C', 'Hits (LRU): 0', 'Hits (MRU): 3']);
});

test('the stage’s card and code panel are the kit’s card and code, entered: the same picture and words', async () => {
  const { stage } = await import('../explain/index.ts');
  const kit = await import('../explain/drawing.ts');
  const { pictureFingerprint } = await import('../explain/stage.ts');
  const sc = scene();
  const s = stage(sc, { style: 'nord' });
  const rows: CardRow[] = [['Requests', 'A B C'], ['Hits', 0, 3]];
  const options = { columns: ['LRU', 'MRU'], width: 6, title: 'Cache', lit: { row: 'Hits' } };
  const entered = await s.card(rows, { ...options, at: 'right' });
  const built = kit.card(s, rows, { ...options, at: 'right' });
  assert.equal(pictureFingerprint(entered), pictureFingerprint(built));
  assert.deepEqual(entered.describe(), built.describe());
  const lines = ['const a = 1;', 'return a;'];
  const code = await s.code(lines, { at: 'left', title: 'f', lit: { lines: 1 } });
  const made = kit.code(s, lines, { at: 'left', title: 'f', lit: { lines: 1 } });
  assert.equal(pictureFingerprint(code), pictureFingerprint(made));
  assert.deepEqual(code.describe(), made.describe());
  assert.ok(sc.familyMembers().includes(entered) && sc.familyMembers().includes(code), 'and entered: on the stage');
});
