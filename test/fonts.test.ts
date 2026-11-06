// The embedded faces as a fallback chain: a character the run's own face lacks is drawn by the first
// face in the chain that has it (src/fonts.ts), and only characters no face has are reported missing.
import { test } from 'node:test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

test('the vendored glyph bundle matches its recorded upstream bytes', () => {
  const pin = JSON.parse(readFileSync(new URL('../vendor/glyph.pin.json', import.meta.url), 'utf8'));
  const bytes = readFileSync(new URL('../vendor/glyph.js', import.meta.url));
  assert.equal(bytes.length, pin.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), pin.sha256, 'review and record a changed glyph bundle');
});
import { fc, params } from './lib/pbt.ts';
import { shaperFor, Text } from '../src/index.ts';
import { loadFonts, takeMissingGlyphs } from '../explain/testing.ts';
import { FALLBACK } from '../src/font-data.ts';

await loadFonts();
const SIZE = 1;
/** Inter's units per em is 2048; JetBrains Mono's and the Noto faces' are 1000. */
const INTER = SIZE / 2048,
  NOTO = SIZE / 1000;

// One of each kind the fallback faces add, by face: Noto Sans Arabic, Devanagari, SC.
const ARABIC = [...'٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹٫٬'],
  DEVANAGARI = [...'०१२३४५६७८९'],
  HAN = [...'〇一二三四五六七八九十０１２３４５６７８９'];
// Inter's own, newly kept in its subset: super- and subscripts, number forms, circled numbers.
const INTER_ADDED = [...'⁰⁴⁵⁶⁷⁸⁹₀₁₂₃⅓⅕⅞ⅠⅫⅻ①⑨⓪'];

test('the fallback faces are the three Noto subsets, in order', () => {
  assert.deepEqual(
    FALLBACK.map(([name]) => name),
    ['Noto Sans Arabic', 'Noto Sans Devanagari', 'Noto Sans SC'],
  );
});

test('numerals outside Latin draw as outlines from a fallback face, in both families', () => {
  takeMissingGlyphs();
  for (const font of ['sans', 'mono'] as const)
    for (const ch of [...ARABIC, ...DEVANAGARI, ...HAN]) {
      const r = shaperFor(font)(ch, SIZE);
      assert.equal(r.glyphs.length, 1, `${font} ${ch}`);
      const [g] = r.glyphs;
      assert.notEqual(g!.gid, 0, `${font} ${ch}`);
      assert.ok(g!.path.length > 2, `${font} ${ch} has an outline`);
      assert.equal(g!.s, NOTO, `${font} ${ch} is drawn at a Noto face's scale`);
      assert.ok(r.width > 0.2 && r.width <= 1.0001, `${font} ${ch} advance ${r.width}`);
    }
  assert.deepEqual([...takeMissingGlyphs()], []);
});

test('Inter draws the number forms it has; mono falls back to it', () => {
  takeMissingGlyphs();
  for (const ch of INTER_ADDED) {
    const sans = shaperFor('sans')(ch, SIZE);
    assert.notEqual(sans.glyphs[0]!.gid, 0, ch);
    assert.equal(sans.glyphs[0]!.s, undefined, `${ch}: Inter draws it as the run's own face`);
  }
  // JetBrains Mono has no Roman numerals or circled numbers: the chain's next face, Inter, draws them
  for (const ch of [...'Ⅻ①']) assert.equal(shaperFor('mono')(ch, SIZE).glyphs[0]!.s, INTER, ch);
  assert.deepEqual([...takeMissingGlyphs()], []);
});

test('a run supported by its own face has no fallback scale', () => {
  fc.assert(
    fc.property(fc.string({ unit: fc.constantFrom(...'abcdefxyz ABC0123456789.,;:()[]{}<>-=+_/\\\'"½²µé€→'), maxLength: 30 }), (t) => {
      for (const font of ['sans', 'mono'] as const) {
        const r = shaperFor(font)(t, SIZE);
        // Pieces from the chain carry their own scale; a run shaped whole in its face carries none
        assert.ok(
          r.glyphs.every((g) => g.s === undefined),
          `${font} ${JSON.stringify(t)}`,
        );
      }
    }),
    params(300),
  );
});

test('pieces in different faces join at their advances, with clusters indexing the whole string', () => {
  const latin = fc.string({ unit: fc.constantFrom(...'abcxyz019 .'), minLength: 1, maxLength: 8 });
  fc.assert(
    fc.property(latin, fc.constantFrom(...ARABIC, ...DEVANAGARI, ...HAN), latin, fc.constantFrom('sans' as const, 'mono' as const), (a, f, b, font) => {
      const shape = shaperFor(font);
      const whole = shape(a + f + b, SIZE);
      const sum = shape(a, SIZE).width + shape(f, SIZE).width + shape(b, SIZE).width;
      assert.ok(Math.abs(whole.width - sum) < 1e-9, `${whole.width} vs ${sum}`);
      const at = [...a].length;
      const mine = whole.glyphs.filter((g) => g.cluster === at);
      assert.equal(mine.length, 1);
      assert.equal(mine[0]!.s, NOTO);
      assert.ok(Math.abs(mine[0]!.x - shape(a, SIZE).width) < 1e-9);
      for (let i = 1; i < whole.glyphs.length; i++) assert.ok(whole.glyphs[i]!.x >= whole.glyphs[i - 1]!.x);
      // The run keeps its own face's metrics
      assert.equal(whole.ascent, shape(a, SIZE).ascent);
      assert.equal(whole.descent, shape(a, SIZE).descent);
    }),
    params(300),
  );
});

test('a combining mark stays in the piece of the character before it', () => {
  takeMissingGlyphs();
  // U+0301 is in none of the subsets: shaped with ٣ in Noto Sans Arabic, it is missing there
  const r = shaperFor('sans')('a٣́b', SIZE);
  const arabic = r.glyphs.filter((g) => g.s === NOTO);
  assert.equal(arabic.length, 2, 'the digit and its mark are one piece');
  assert.deepEqual([...takeMissingGlyphs()], [['a٣́b', '٣́']]);
});

test('characters no face has are still reported, by the string that held them', () => {
  takeMissingGlyphs();
  // A Han character that is not a numeral, an Arabic letter (which would need shaping), and a Thai digit
  for (const t of ['中', 'ب', '๓', '٣ب', 'x三y中']) shaperFor('sans')(t, SIZE);
  assert.deepEqual(
    [...takeMissingGlyphs()],
    [
      ['中', '中'],
      ['ب', 'ب'],
      ['๓', '๓'],
      ['٣ب', 'ب'],
      ['x三y中', '中'],
    ],
  );
});

test('Text lays out a mixed run on its advances', () => {
  const t = new Text('x ٣ ३ 三 Ⅻ', { fontSize: 0.5 });
  const r = shaperFor('sans')('x ٣ ३ 三 Ⅻ', 0.5);
  assert.ok(Math.abs(t.advance() - r.width) < 1e-6);
  assert.equal(t.children.length, 5, 'one outline per visible glyph');
  const xs = t.children.map((g) => g.box()![0]);
  assert.deepEqual(
    xs,
    [...xs].sort((p, q) => p - q),
  );
});

test('font admission accepts only the literal sans and mono names without coercion', () => {
  const hostile = { toString() { throw new Error('coercion must not run'); } };
  fc.assert(fc.property(fc.anything(), (name) => {
    if (name === 'sans' || name === 'mono') assert.equal(typeof shaperFor(name), 'function');
    else assert.throws(() => shaperFor(name as import('../src/index.ts').FontName), /Unknown font/);
  }), params<[unknown]>(500, { examples: [['sans'], ['mono'], ['constructor'], ['toString'], ['__proto__'], [new String('sans')], [hostile], [Symbol('sans')], [() => 'sans']] }));
});
