// Property tests for explain/panels.ts: CodeBlock (and the line matching its morph uses) and Card.
// Scenes use a NullSink and skip every frame, so a play costs its begin and
// finish only. Counts: test/lib/pbt.ts (FULL=1 is 10x).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Text } from '../src/index.ts';
import { NullSink } from '../src/output.ts';
import { loadFonts } from '../explain/testing.ts';
import type { Box, Vec } from '../src/index.ts';
import { Card, CodeBlock } from '../explain/panels.ts';
import type { CardRow } from '../explain/panels.ts';
import { REGIONS, emphasis, good, bad } from '../explain/look.ts';
import type { Region } from '../explain/look.ts';
import { fc, params } from './lib/pbt.ts';
import { hexColor } from './lib/random-snapshot.ts';

await loadFonts();

// Points are float32: at stage magnitudes (up to 16) one unit in the last place is about 1e-6.
const EPS = 1e-5;
const scene = () => new Scene(new NullSink(), { skipUntil: Infinity });
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

/** An independent LCS length: the classic forward DP. */
function lcs(a: readonly string[], b: readonly string[]): number {
  const t = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      t[i]![j] = a[i - 1] === b[j - 1] ? t[i - 1]![j - 1]! + 1 : Math.max(t[i - 1]![j]!, t[i]![j - 1]!);
  return t[a.length]![b.length]!;
}

// ---- CodeBlock -----------------------------------------------------------------

const placed = fc.oneof(region, box.filter((b) => b[2] - b[0] > 0.7));
/** A code block, unless refused for want of room: then that must be the documented refusal, and true. */
function code(colors: Of<typeof palette>, text: string[], opts: Record<string, unknown>): CodeBlock {
  try {
    return new CodeBlock(scene(), colors, text, opts);
  } catch (error) {
    assert.match((error as Error).message, /no room for code/);
    const at = opts.at as Box;
    assert.ok(at[2] - at[0] - 0.7 < ((opts.fontSize as number) ?? 0.25));
    fc.pre(false);
    throw error;
  }
}
/** CodeBlock's other knobs: font size and an optional title. */
const knobs = fc.record({ fontSize: fc.double({ min: 0.08, max: 0.5, noNaN: true }), title: fc.option(fc.string({ maxLength: 16 }), { nil: undefined }) }, { requiredKeys: [] });

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
      assert.throws(() => new CodeBlock(scene(), colors, code, { at, fontSize }), /no room for code/);
    }),
    params(),
  );
});

test('a code block refuses empty code, and so does morph', async () => {
  await fc.assert(
    fc.asyncProperty(palette, lines(1), fc.option(placed, { nil: undefined }), async (colors, text, at) => {
      assert.throws(() => new CodeBlock(scene(), colors, [], at ? { at } : {}), /at least one line|no room for code/);
      await assert.rejects(code(colors, text, at ? { at } : {}).morph([]), /at least one line/);
    }),
    params(),
  );
});

test('focus puts the bar over exactly the chosen lines, inside the block', async () => {
  await fc.assert(
    fc.asyncProperty(
      palette,
      lines(1).chain((code) =>
        fc.tuple(fc.constant(code), fc.nat({ max: code.length - 1 }), fc.nat({ max: code.length - 1 })),
      ),
      fc.option(placed, { nil: undefined }),
      async (colors, [text, x, y], at) => {
        const block = code(colors, text, at ? { at } : {});
        const [a, b] = [Math.min(x, y), Math.max(x, y)];
        await block.focus(a === b ? a : [a, b]);
        const bar = block.bar.box()!;
        const row = (i: number) => block.code.lines[i]!.anchorPoint()[1];
        for (let i = 0; i < text.length; i++) {
          const on = row(i) > bar[1] && row(i) < bar[3];
          assert.equal(on, i >= a && i <= b, `line ${i} vs bar over ${a}..${b}`);
        }
        assert.equal(block.bar.parent, block);
        assert.equal(block.bar.style.opacity, 1);
      },
    ),
    params(),
  );
});

test('focus rejects any line that is not an index into the code, with the documented error', async () => {
  await fc.assert(
    fc.asyncProperty(
      palette,
      lines(1),
      fc.oneof(
        fc.double().filter((n) => !Number.isInteger(n)),
        fc.integer({ max: -1 }),
        fc.integer({ min: 10, max: 1e6 }),
        fc.tuple(fc.integer({ min: -3, max: 12 }), fc.integer({ min: -3, max: 12 })),
      ),
      async (colors, code, bad) => {
        const [a, b] = typeof bad === 'number' ? [bad, bad] : bad;
        fc.pre(!(Number.isInteger(a) && Number.isInteger(b) && a >= 0 && b < code.length && a <= b));
        const block = new CodeBlock(scene(), colors, code);
        await assert.rejects(block.focus(bad as number), /No code lines/);
      },
    ),
    params(),
  );
});

const morphCase = fc.record({
  colors: palette,
  before: lines(1),
  after: lines(1),
  at: fc.option(placed, { nil: undefined }),
  markAdded: fc.boolean(),
  focus: fc.option(fc.nat(), { nil: undefined }),
  knobs,
});
type Of<A> = A extends fc.Arbitrary<infer T> ? T : never;
async function morphed({ colors, before, after, at, markAdded, focus, knobs: k }: Of<typeof morphCase>) {
  const block = code(colors, before, { ...(at ? { at } : {}), ...k });
  const s = block.scene;
  s.add(block);
  if (focus != null) await block.focus(focus % before.length);
  const old = [...block.code.lines];
  const top = block.panel.box()![3],
    centre = block.panel.center()[0];
  await block.morph(after, { markAdded });
  return { s, block, old, top, centre };
}

test('morph turns the code into the next lines, keeping as many line objects as any pairing of equal lines can', async () => {
  await fc.assert(
    fc.asyncProperty(morphCase, async (c) => {
      const { block, old } = await morphed(c);
      // Text.text keeps the source line (including tabs); only glyph layout expands tab stops.
      const [a, b] = [c.before, c.after];
      assert.deepEqual(block.code.lines.map((l) => l.text), b);
      // A kept line keeps its text and its order among the kept: the pairs form a common subsequence...
      const kept = block.code.lines.map((l, j) => [j, old.indexOf(l)] as const).filter(([, i]) => i >= 0);
      for (const [j, i] of kept) assert.equal(a[i], b[j], `line ${j} kept old line ${i}`);
      for (let k = 1; k < kept.length; k++) assert.ok(kept[k]![1] > kept[k - 1]![1], JSON.stringify(kept));
      // ...and a longest one, so the fewest lines fade.
      assert.equal(kept.length, lcs(a, b));
      assert.equal(block.marks.length, c.markAdded ? b.length - kept.length : 0);
    }),
    params(300),
  );
});

test('scale probe: morphing 600 lines of code pairs its repeated lines quickly', async () => {
  const a = Array.from({ length: 600 }, (_, i) => `line ${i % 37}`),
    b = Array.from({ length: 600 }, (_, i) => `line ${(i * 7) % 37}`);
  const s = scene();
  const block = new CodeBlock(s, { paper: '#000000', ink: '#ffffff', accent: '#ff8800', muted: '#888888' }, a);
  s.add(block);
  const old = new Set(block.code.lines);
  const t = performance.now();
  await block.morph(b);
  assert.equal(block.code.lines.filter((l) => old.has(l)).length, lcs(a, b));
  assert.ok(performance.now() - t < 10_000);
});

test('morph leaves no departed line on stage', async () => {
  await fc.assert(
    fc.asyncProperty(morphCase, async (c) => {
      const { s, block, old } = await morphed(c);
      const present = new Set(s.familyMembers());
      const kept = new Set(block.code.lines);
      assert.deepEqual(old.filter((l) => !kept.has(l) && present.has(l)).map((l) => l.text), []);
      const shown = s.familyMembers().filter((m): m is Text => m instanceof Text && m.parent === block.code);
      // By identity: a deep diff of mobjects runs away on failure.
      assert.ok(shown.length === block.code.lines.length && shown.every((t, i) => t === block.code.lines[i]), 'the block shows exactly its lines');
    }),
    params(300),
  );
});

test('a morphed block stays inside the region it was placed in', async () => {
  await fc.assert(
    fc.asyncProperty(morphCase.filter((c) => c.at != null), async (c) => {
      const r = regionOf(c.at!);
      // A region shorter than the morphed block bounds only its width (see the next property).
      const natural = code(c.colors, c.after, c.knobs).panel.box()!;
      fc.pre(r[3] - r[1] >= natural[3] - natural[1]);
      const { block } = await morphed(c);
      const b = block.panel.box()!;
      assert.ok(inside([b[0], Math.max(b[1], r[1]), b[2], b[3]], r) && b[1] >= r[1] - EPS, `${b} outside ${r}`);
    }),
    params(300),
  );
});

test('a morphed block stays within its region\'s width with finite bounds, whatever the region', async () => {
  await fc.assert(
    fc.asyncProperty(morphCase, async (c) => {
      const { block } = await morphed(c);
      const b = block.panel.box()!,
        r = regionOf(c.at ?? 'full');
      assert.ok(b[0] >= r[0] - EPS && b[2] <= r[2] + EPS, `${b} outside ${r} horizontally`);
      assert.ok(b.every(Number.isFinite));
    }),
    params(300),
  );
});

test('a titled block keeps its title inside the panel and above the code after morph', async () => {
  await fc.assert(
    fc.asyncProperty(morphCase.filter((c) => !!c.knobs.title?.trim()), async (c) => {
      const { block } = await morphed(c);
      const head = block.children.find((m): m is Text => m instanceof Text && m.text === c.knobs.title)!;
      const h = head.box()!,
        p = block.panel.box()!,
        code = block.code.box();
      assert.ok(h[0] >= p[0] - EPS && h[2] <= p[2] + EPS && h[3] <= p[3] + EPS, `title ${h} outside panel ${p}`);
      if (code) assert.ok(h[1] >= code[3] - 0.05, `title ${h} over code ${code}`);
    }),
    params(300),
  );
});

test('a morphed block keeps its top and centre unless its region made it move', async () => {
  await fc.assert(
    fc.asyncProperty(morphCase, async (c) => {
      const { block, top, centre } = await morphed(c);
      const b = block.panel.box()!,
        placed = regionOf(c.at ?? 'full');
      // Vertically the bound is the region, or the stage for a region shorter than a line.
      const r: Box = placed[3] - placed[1] >= 1 ? placed : [placed[0], REGIONS.full[1], placed[2], REGIONS.full[3]];
      if (b[1] > r[1] + EPS) assert.ok(Math.abs(b[3] - top) < EPS, `top ${top} -> ${b[3]}`);
      if (b[0] > r[0] + EPS && b[2] < r[2] - EPS) assert.ok(Math.abs(block.panel.center()[0] - centre) < EPS, 'centre moved');
    }),
    params(300),
  );
});

test('after morph, focus works as on a fresh block: the bar is the block’s, over the line', async () => {
  await fc.assert(
    fc.asyncProperty(morphCase, fc.nat(), async (c, k) => {
      const { block } = await morphed(c);
      const i = k % c.after.length;
      await block.focus(i);
      assert.equal(block.bar.parent, block, 'the focus bar still belongs to the block');
      const bar = block.bar.box()!,
        y = block.code.lines[i]!.anchorPoint()[1];
      assert.ok(y > bar[1] && y < bar[3]);
      assert.ok(block.children.indexOf(block.bar) < block.children.indexOf(block.code), 'the bar draws behind the code');
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

test('clearMarks removes every mark from the block', async () => {
  await fc.assert(
    fc.asyncProperty(palette, fc.array(line.map((l) => '+ ' + l), { minLength: 1, maxLength: 6 }), async (colors, code) => {
      const s = scene();
      const block = new CodeBlock(s, colors, code, { diff: true });
      s.add(block);
      const marks = [...block.marks];
      await block.clearMarks();
      assert.equal(block.marks.length, 0);
      assert.ok(marks.every((m) => !block.children.includes(m.mob)));
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
  const k = new Card(s, c.colors, c.rows, { ...(c.at ? { at: c.at } : {}), ...(c.width != null ? { width: c.width } : {}), ...(c.title ? { title: c.title } : {}), ...(c.fontSize != null ? { fontSize: c.fontSize } : {}), ...(c.direction ? { direction: c.direction } : {}), align: c.align });
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

test('a repeated row label draws every row, but set and mark refuse it as ambiguous', async () => {
  await fc.assert(
    fc.asyncProperty(palette, rows, fc.nat(), value, fc.boolean(), async (colors, r, k, v, viaMark) => {
      const label = r[k % r.length]![0];
      const dup = [...r, [label, v] as const];
      const s = scene();
      const card = new Card(s, colors, dup, { width: 12 });
      assert.equal(card.family().filter((m) => m instanceof Text && m.parent === card).length, 2 * dup.length);
      await assert.rejects(viaMark ? card.mark(label) : card.set(Object.fromEntries([[label, 'x']])), /not unique/);
    }),
    params(),
  );
});

const changesFor = (r: readonly (readonly [string, unknown])[]) =>
  fc.subarray(r.map(([l]) => l)).chain((ls) => fc.tuple(...ls.map(() => value)).map((vs) => Object.fromEntries(ls.map((l, i) => [l, vs[i]]))));

test('set shows each new value and leaves unchanged rows alone', async () => {
  await fc.assert(
    fc.asyncProperty(fittingCardCase.chain((c) => fc.tuple(fc.constant(c), changesFor(c.rows))), async ([c, changes]) => {
      const made = card(c);
      const { s, k } = made;
      const before = new Map([...k.values].map(([l, t]) => [l, t]));
      await k.set(changes);
      for (const [l] of c.rows) {
        const expected = Object.hasOwn(changes, l) ? String(changes[l]) : before.get(l)!.text;
        assert.equal(k.values.get(l)!.text, expected);
        if (before.get(l)!.text === expected) assert.equal(k.values.get(l), before.get(l), `${l} did not move`);
      }
      void s;
    }),
    params(300),
  );
});

test('after set, each row shows exactly one value, inside the card', async () => {
  await fc.assert(
    fc.asyncProperty(fittingCardCase.chain((c) => fc.tuple(fc.constant(c), changesFor(c.rows))), async ([c, changes]) => {
      const made = card(c);
      const { s, k } = made;
      const before = [...k.values.values()];
      await k.set(changes);
      const now = [...k.values.values()];
      const present = new Set(s.familyMembers());
      assert.equal(now.filter((t) => present.has(t)).length, c.rows.length);
      assert.deepEqual(before.filter((t) => !now.includes(t) && present.has(t)), [], 'replaced values leave the stage');
      rowsInside(k);
    }),
    params(300),
  );
});

test('set with an unknown row changes nothing and plays nothing', async () => {
  await fc.assert(
    fc.asyncProperty(fittingCardCase.chain((c) => fc.tuple(fc.constant(c), changesFor(c.rows))), label, value, async ([c, changes], extra, v) => {
      fc.pre(!c.rows.some(([l]) => l === extra));
      const made = card(c);
      const { s, k } = made;
      const children = [...k.children],
        values = [...k.values],
        looks = JSON.stringify(k.family().map((m) => m.style)),
        clock = [s.time, s.frameCount];
      await assert.rejects(k.set({ ...changes, ...Object.fromEntries([[extra, v]]) }), /No card row/);
      // Compared by identity: a deep diff of mobjects (parent links and all) runs away on failure.
      const same = <T>(a: readonly T[], b: readonly T[]) => a.length === b.length && a.every((x, i) => x === b[i]);
      assert.ok(same(k.children, children), 'no row was added or removed');
      assert.ok(same([...k.values].flat(), values.flat()), 'every row keeps its value object');
      assert.equal(JSON.stringify(k.family().map((m) => m.style)), looks);
      assert.deepEqual([s.time, s.frameCount], clock, 'no time passed: nothing played');
    }),
    params(300),
  );
});

test('a faded card stays faded when a value changes', async () => {
  await fc.assert(
    fc.asyncProperty(fittingCardCase.chain((c) => fc.tuple(fc.constant(c), changesFor(c.rows))), fc.double({ min: 0, max: 1, noNaN: true }), async ([c, changes], o) => {
      const made = card(c);
      for (const m of made.k.family()) m.style.opacity = o;
      await made.k.set(changes);
      for (const v of made.k.values.values()) assert.equal(v.style.opacity, o);
    }),
    params(300),
  );
});

test('mark lights the row and stays; mark(null) hides the bar', async () => {
  await fc.assert(
    fc.asyncProperty(fittingCardCase.chain((c) => fc.tuple(fc.constant(c), fc.array(fc.option(fc.constantFrom(...c.rows.map(([l]) => l))), { minLength: 1, maxLength: 5 }))), async ([c, marks]) => {
      const made = card(c);
      const { k } = made;
      for (const l of marks) {
        await k.mark(l);
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
        const k = new Card(scene(), colors, [['Requests', 'A B C']], { columns, direction, fontSize });
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

test('a columned card is described by row and column, and set takes one value per column', async () => {
  await fc.assert(
    fc.asyncProperty(columnCase.filter((c) => c.columns.length > 1 && c.rows.some((r) => r.length > 2)), value, async (c, v) => {
      const k = columned(c), n = c.columns.length;
      const row = c.rows.find((r) => r.length > 2)!, l = row[0];
      const names = k.describe().parts.map((p) => p.name);
      c.columns.forEach((col, j) => assert.ok(names.includes(`${l} (${col}): ${String(row[j + 1])}`)));
      const before = [...k.cells.get(l)!];
      const next = c.columns.map((_, j) => (j === 0 ? v : row[j + 1]));
      await k.set({ [l]: next });
      k.cells.get(l)!.forEach((cell, j) => {
        assert.equal(cell.text, String(next[j]));
        if (String(next[j]) === before[j]!.text) assert.equal(cell, before[j], `column ${j} did not move`);
      });
      assert.equal(k.values.get(l), k.cells.get(l)!.at(-1));
      await assert.rejects(k.set({ [l]: v }), /set it to an array of/);
      await assert.rejects(k.set({ [l]: Array(n + 1).fill(v) }), /set it to an array of/);
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

test('a card or code panel a view draws refuses to change in place, and says to draw it from state', async () => {
  const { view, Group } = await import('../src/index.ts');
  const colors = { paper: '#ffffff', ink: '#111111', accent: '#0055cc', muted: '#666666' };
  const sc = scene();
  sc.state = { row: 'Hits' };
  const cards = view(sc, (st) => new Card(sc, colors, [['Hits', 1], ['Misses', 2]], { lit: (st as { row: string }).row }));
  const code = view(sc, () => new CodeBlock(sc, colors, ['a = 1', 'b = 2']));
  const inside = view(sc, () => new Group(new CodeBlock(sc, colors, ['c = 3'])));
  sc.add(cards, code, inside);
  const card = cards.current as Card, panel = code.current as CodeBlock, nested = inside.current.children[0] as CodeBlock;
  await assert.rejects(card.mark('Misses'), /card\.mark\(\) changes a Card that a view draws.*\{ lit, litAs \}/);
  await assert.rejects(card.set({ Hits: 3 }), /card\.set\(\) changes a Card that a view draws.*view\.sync\(\)/);
  await assert.rejects(panel.focus(1), /code\.focus\(\) changes a CodeBlock that a view draws.*\{ focus, focusAs \}/);
  await assert.rejects(panel.morph(['a = 2']), /code\.morph\(\) changes a CodeBlock that a view draws/);
  await assert.rejects(panel.clearMarks(), /code\.clearMarks\(\) changes a CodeBlock that a view draws/);
  await assert.rejects(nested.focus(0), /code\.focus\(\) changes a CodeBlock that a view draws/, 'inside a view’s picture too');
  // Not drawn by a view: the imperative route works as before.
  const loose = new Card(sc, colors, [['Hits', 1]]);
  sc.add(loose);
  await loose.mark('Hits');
  await loose.set({ Hits: 2 });
  assert.equal(loose.values.get('Hits')!.text, '2');
});

test('the stage’s card and code panel are new Card and new CodeBlock, entered: the same picture and words', async () => {
  const { stage } = await import('../explain/index.ts');
  const { pictureFingerprint } = await import('../explain/stage.ts');
  const sc = scene();
  const s = stage(sc, { style: 'nord' });
  const rows: CardRow[] = [['Requests', 'A B C'], ['Hits', 0, 3]];
  const options = { columns: ['LRU', 'MRU'], width: 6, title: 'Cache', lit: 'Hits' };
  const entered = await s.card(rows, { ...options, at: 'right' });
  const built = new Card(sc, s.palette, rows, { ...options, at: 'right' });
  assert.equal(pictureFingerprint(entered), pictureFingerprint(built));
  assert.deepEqual(entered.describe(), built.describe());
  const lines = ['const a = 1;', 'return a;'];
  const code = await s.code(lines, { at: 'left', title: 'f', focus: 1 });
  const made = new CodeBlock(sc, s.palette, lines, { at: 'left', title: 'f', focus: 1 });
  assert.equal(pictureFingerprint(code), pictureFingerprint(made));
  assert.deepEqual(code.describe(), made.describe());
  assert.ok(sc.familyMembers().includes(entered) && sc.familyMembers().includes(code), 'and entered: on the stage');
});
