// Tabs and astral characters in Code: a span's from/to, a ColorSpan and a
// glyph's cluster all count UTF-16 indices into the line as given, though the
// glyphs are shaped from the tab-expanded string and the shaper counts code points.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Code, Text, TransformDiff, TransformMatchingText } from '../src/index.ts';
import { loadFonts } from '../explain/testing.ts';
import { expandTabs } from '../src/text.ts';
import { fc, params } from './lib/pbt.ts';
import { readFileSync } from 'node:fs';
import type { Box, Mobject } from '../src/index.ts';
import { beginAnimation } from '../src/animation.ts';
// Manim's values, which the package no longer exports.
const RED = '#fc6255';

await loadFonts();

const cluster = (g: Mobject): number => (g as Mobject & { cluster: number }).cluster;
/** The source character a glyph draws. */
const charOf = (g: Mobject): string => String.fromCodePoint((g.parent as Text).text.codePointAt(cluster(g))!);
const union = (bs: Box[]): Box => bs.reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]);

test("token(1, 'return') on a tabbed line selects exactly the glyphs of 'return'", () => {
  const code = new Code(['\tx = 1;', '\treturn x;']);
  const s = code.token(1, 'return');
  assert.deepEqual([s.from, s.to], [1, 7]);
  assert.equal(s.children.map(charOf).join(''), 'return');
  assert.deepEqual(s.children.map(cluster), [1, 2, 3, 4, 5, 6]);
  // Every glyph of the line carries its source index: the tab is index 0, one index wide
  assert.equal(code.lines[1]!.children.map(charOf).join(''), 'returnx;');
});

test('lineSpan() of a tabbed line holds every glyph of the line', () => {
  const code = new Code(['\tx = 1;', '\t\tif (a)\treturn;']);
  for (const i of [0, 1]) assert.deepEqual(code.lineSpan(i).children, code.lines[i]!.children, `line ${i}`);
  assert.equal(code.token(1, 'return').children.map(charOf).join(''), 'return');
});

test('box() of a span on a tabbed line is its cells in the laid-out line: the tab takes its columns', () => {
  const code = new Code(['\treturn x;', 'ab\tc']).scale(1.4).shift([0.3, -0.2]);
  const t = code.lines[0]!, f = t.frameBox, cell = t.advance() / '    return x;'.length;
  const s = code.token(0, 'return'), b = s.box();
  assert.ok(Math.abs(b[0] - (f[0]! + 4 * cell)) < 1e-5 && Math.abs(b[2] - (f[0]! + 10 * cell)) < 1e-5, `x extent ${b}`);
  const ink = union(s.children.map((g) => g.box()!));
  assert.ok(ink[0] >= b[0] - 1e-6 && ink[2] <= b[2] + 1e-6, 'the glyphs are inside the box');
  assert.ok(b[0] - ink[0] < cell && ink[2] - b[2] < cell && ink[0] - b[0] < cell && b[2] - ink[2] < cell, 'and the box hugs them to within a cell');
  // The tab alone: four columns, no glyphs; a tab after 'ab' reaches the next stop, two columns
  const tab = code.span(0, 0, 1);
  assert.equal(tab.children.length, 0);
  assert.ok(Math.abs(tab.width() - 4 * cell) < 1e-5);
  assert.ok(Math.abs(code.span(1, 2, 3).width() - 2 * cell) < 1e-5);
  assert.equal(code.token(1, 'c').children.map(charOf).join(''), 'c');
});

test('ColorSpans on a tabbed line colour the characters they name', () => {
  const code = new Code(['\tlet total = 0;'], { color: '#dddddd', spans: [{ line: 0, from: 1, to: 4, color: RED }] });
  const red = code.lines[0]!.children.filter((g) => g.style.fill === RED);
  assert.equal(red.map(charOf).join(''), 'let');
});

test('a span after an astral character selects the right glyphs', () => {
  const t = new Text('𝑥+ab', { font: 'mono' });
  // Clusters count UTF-16 units: the astral character takes two
  assert.deepEqual(t.children.slice(-3).map(cluster), [2, 3, 4]);
  const code = new Code(['𝑥+ab', 's = "😀"; ab'], { spans: [{ line: 0, from: 3, to: 5, color: RED }] });
  const ab = code.token(0, 'ab');
  assert.deepEqual([ab.from, ab.to], [3, 5]);
  assert.equal(ab.children.map(charOf).join(''), 'ab');
  assert.deepEqual(code.lines[0]!.children.filter((g) => g.style.fill === RED), ab.children);
  assert.equal(code.token(1, 'ab').children.map(charOf).join(''), 'ab');
  assert.equal(code.token(1, ';').children.map(charOf).join(''), ';');
});

test('TransformDiff: an unchanged tabbed line pairs every glyph', () => {
  const same = new TransformDiff(new Code(['\tlet total = 0;']), new Code(['\tlet total = 0;']));
  beginAnimation(same);
  const n = same.before.lines[0]!.children.length;
  assert.deepEqual(same.summary(), { matched: n, morphed: 0, removed: 0, added: 0 });
  for (const [s, t] of same.pairs) assert.equal(cluster(s), cluster(t));
  // Next to an edit: the tabbed line still travels whole; only x -> y changes
  const edit = new TransformDiff(new Code(['\tlet total = 0;', 'x']), new Code(['\tlet total = 0;', 'y']));
  beginAnimation(edit);
  assert.deepEqual(edit.summary(), { matched: n, morphed: 0, removed: 1, added: 1 });
  // A changed line with tabs pairs its shared tokens character for character
  const changed = new TransformDiff(new Code(['\treturn x;']), new Code(['\treturn y;']));
  beginAnimation(changed);
  assert.deepEqual(changed.summary(), { matched: 7, morphed: 0, removed: 1, added: 1 });
  for (const [s, t] of changed.pairs) assert.equal(charOf(s), charOf(t));
});

test('TransformMatchingText keys tabbed and astral glyphs by their own character', () => {
  for (const [a, b, n] of [['\tcache', '\tcached', 5], ['\tcache = 1', 'cache\t= 1', 7], ['😀cache', 'cached😀', 5], ['\t𝑥 = ab', 'ab = 𝑥', 3]] as const) {
    const m = new TransformMatchingText(new Code([a]), new Code([b]));
    beginAnimation(m);
    assert.equal(m.summary().matched, n, `${JSON.stringify(a)} -> ${JSON.stringify(b)}`);
    for (const [s, t] of m.pairs) assert.equal(charOf(s), charOf(t));
  }
});

test('one tab expansion: tabs reach the next stop by grapheme, every code point maps back, and lettering runs shape the same form', () => {
  const unit = fc.constantFrom('\t', 'a', 'é', 'e\u0301', '😀', ' ', '中');
  fc.assert(fc.property(fc.array(unit, { maxLength: 12 }), fc.integer({ min: 1, max: 8 }), (units, width) => {
    const line = units.join('');
    const { text, source } = expandTabs(line, width);
    assert.ok(!text.includes('\t'));
    assert.equal(source.length, [...text].length, 'one source index per code point');
    // A tab ends on a multiple of the width, counting graphemes before it.
    let column = 0, out = 0;
    for (const u of units) {
      out += u === '\t' ? width - (column % width) : [...u].length;
      column += u === '\t' ? width - (column % width) : 1;
    }
    assert.equal([...text].length, out);
    // Each non-tab code point comes from the same character in the line.
    [...text].forEach((cp, i) => { if (cp !== ' ' || line[source[i]!] !== '\t') assert.equal(String.fromCodePoint(line.codePointAt(source[i]!)!), cp); });
    // Without a width, tabs stay and only the map is made.
    const kept = expandTabs(line);
    assert.equal(kept.text, line);
    assert.equal(kept.source.length, [...line].length);
  }), params());
  assert.deepEqual(expandTabs('e\u0301\tx', 4), { text: 'e\u0301   x', source: [0, 1, 2, 2, 2, 3] });
  // Lettering runs map their clusters through this function, not a copy of it.
  const outlines = readFileSync(new URL('../src/lettering-outlines.ts', import.meta.url), 'utf8');
  assert.match(outlines, /import \{[^}]*\bexpandTabs\b[^}]*\} from '\.\/text\.ts'/);
  assert.doesNotMatch(outlines, /'\\t'|Intl\.Segmenter/, 'no tab stop or grapheme split of its own');
});
