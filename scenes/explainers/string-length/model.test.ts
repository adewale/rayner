import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fc, params } from '../lib/pbt.ts';
import { skipOracle } from '../lib/oracle.ts';
import { WORDS, apart, byteHex, bytes, clusters, codePoints, cut, cutStory, hex, kindOf, lengths, utf8, word } from './model.ts';
import { FIT, HELLO, SALAM } from './answers.ts';

// ---- Node, asked now ----
const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
/** What this Node says of one text: its grapheme clusters (from ICU), its UTF-8 bytes, its UTF-16 length and its code points. */
const ask = (text: string) => ({
  clusters: [...segmenter.segment(text)].map((s) => s.segment),
  bytes: [...new TextEncoder().encode(text)],
  units: text.length,
  points: [...text].map((c) => c.codePointAt(0)!),
});

interface Recorded { node: string; unicode: string; icu: string; words: Record<string, { text: string; clusters: string[]; bytes: number[]; units: number; points: number[] }> }
const FIXTURE = new URL('./fixtures/segments.json', import.meta.url);
// The fixture is what one Node said of the page's words, with the Unicode version it holds for. To
// record it again after changing the words:
//   RECORD_SEGMENTS=1 node --test scenes/explainers/string-length/model.test.ts
if (process.env.RECORD_SEGMENTS === '1') {
  const { node, unicode, icu } = process.versions;
  writeFileSync(FIXTURE, JSON.stringify({ node, unicode, icu, words: Object.fromEntries(WORDS.map((w) => [w.id, { text: w.text, ...ask(w.text) }])) }, null, 2) + '\n');
}
const recorded = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Recorded;
const text = (cps: readonly number[]) => String.fromCodePoint(...cps);
const read = (t: string) => clusters(t).map(text);

// ---- the alphabets the model covers ----
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const LATIN = range(0x61, 0x7a), HAN = [...'你好中文字'].map((c) => c.codePointAt(0)!);
const HEBREW = [...range(0x05d0, 0x05ea), ...range(0x05b0, 0x05bd), 0x05bf, 0x05c1, 0x05c2, 0x05c4, 0x05c5, 0x05c7];
const ARABIC = [...range(0x0621, 0x064a), ...range(0x064b, 0x0652), 0x0670];
// Devanagari: consonants and independent vowels, the virama and nukta, vowel signs that take no space and ones that do, and the joiner.
const DEVANAGARI = [...range(0x0915, 0x0939), ...range(0x0905, 0x0914), 0x094d, 0x094d, 0x094d, 0x093c, ...range(0x0941, 0x0948), ...range(0x0900, 0x0902), ...range(0x093e, 0x0940), ...range(0x0949, 0x094c), 0x0903, 0x200d];
// A few consonants with many viramas and the marks that may stand between them: mostly conjuncts, whole and broken.
const CONJUNCTS = [0x0915, 0x0937, 0x0938, 0x0924, 0x094d, 0x094d, 0x094d, 0x093c, 0x200d, 0x0941, 0x093e, 0x0902, 0x0903];
const script = (alphabet: number[]) => fc.array(fc.constantFrom(...alphabet), { maxLength: 12 });
const textArb = fc.oneof(script(LATIN), script(HAN), script(HEBREW), script(ARABIC), { arbitrary: script(DEVANAGARI), weight: 3 }, { arbitrary: script(CONJUNCTS), weight: 4 }, script([...LATIN, ...HAN, ...HEBREW, ...ARABIC, ...DEVANAGARI])).map(text);

test('the page’s words: the model’s bytes, code points and characters are those Node recorded', () => {
  assert.equal(recorded.unicode, '17.0');
  assert.deepEqual(Object.keys(recorded.words), WORDS.map((w) => w.id));
  for (const w of WORDS) {
    const want = recorded.words[w.id]!;
    assert.equal(want.text, w.text);
    assert.deepEqual(bytes(w.text), want.bytes, `${w.id}: bytes`);
    assert.deepEqual(codePoints(w.text), want.points, `${w.id}: code points`);
    assert.deepEqual(read(w.text), want.clusters, `${w.id}: characters`);
    // Every character here is in the Basic Multilingual Plane, where a code point is one UTF-16 unit.
    assert.equal(want.units, want.points.length, `${w.id}: UTF-16 units`);
  }
  assert.deepEqual(WORDS.map((w) => lengths(w.text)), [
    { bytes: 5, points: 5, characters: 5 },
    { bytes: 6, points: 2, characters: 2 },
    { bytes: 14, points: 7, characters: 4 },
    { bytes: 12, points: 6, characters: 4 },
    { bytes: 18, points: 6, characters: 3 },
  ]);
});

test('this Node, asked now, says what was recorded for the page’s words', (t) => {
  if (skipOracle(t, process.versions.unicode !== recorded.unicode && `Node has Unicode ${process.versions.unicode}, not ${recorded.unicode}`)) return;
  for (const w of WORDS) assert.deepEqual({ text: w.text, ...ask(w.text) }, recorded.words[w.id], w.id);
});

test('the model’s characters are Intl.Segmenter’s grapheme clusters, on random text in the scripts it covers', (t) => {
  if (skipOracle(t, process.versions.unicode !== recorded.unicode && `Node has Unicode ${process.versions.unicode}, not ${recorded.unicode}`)) return;
  let joined = 0;
  fc.assert(fc.property(textArb, (s) => {
    assert.deepEqual(read(s), ask(s).clusters, [...s].map((c) => hex(c.codePointAt(0)!)).join(' '));
    if (clusters(s).some((c) => c.filter((cp) => kindOf(cp) === 'letter').length > 1)) joined++;
  }), params(3000));
  // The property met conjuncts: clusters that hold more than one letter.
  assert.ok(joined > 100, `${joined} texts held a conjunct`);
});

test('the model’s bytes are TextEncoder’s, and its code points the string iterator’s, for any text', () => {
  fc.assert(fc.property(fc.string({ unit: 'binary', maxLength: 40 }), (s) => {
    // Lone surrogates have no UTF-8: TextEncoder substitutes U+FFFD, so compare well-formed text only.
    fc.pre(new TextDecoder().decode(new TextEncoder().encode(s)) === s);
    assert.deepEqual(bytes(s), [...new TextEncoder().encode(s)]);
    assert.deepEqual(codePoints(s), [...s].map((c) => c.codePointAt(0)!));
    // Reading the bytes back gives the text.
    assert.equal(new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes(s))), s);
  }), params(2000));
  // The four lengths, at their boundaries.
  assert.deepEqual([0x7f, 0x80, 0x7ff, 0x800, 0xffff, 0x10000, 0x10ffff].map((cp) => utf8(cp).length), [1, 2, 2, 3, 3, 4, 4]);
  assert.throws(() => utf8(0xd800), RangeError);
  // Every code point of the Devanagari block takes three bytes, every Hebrew and Arabic one two, every ASCII one one.
  for (let cp = 0x0900; cp <= 0x097f; cp++) assert.equal(utf8(cp).length, 3);
  for (let cp = 0x0590; cp <= 0x06ff; cp++) assert.equal(utf8(cp).length, 2);
  for (let cp = 0; cp < 0x80; cp++) assert.equal(utf8(cp).length, 1);
});

test('CPython, asked now, gives the same lengths and bytes, and calls the same code points marks', (t) => {
  const python = spawnSync('python3', ['-I', '-c', 'import unicodedata'], { encoding: 'utf8' });
  if (skipOracle(t, python.status !== 0 && 'no python3 on PATH')) return;
  const texts = [...WORDS.map((w) => w.text), ...fc.sample(textArb, params(300))];
  const r = spawnSync('python3', ['-I', fileURLToPath(new URL('./oracle/lengths.py', import.meta.url))], { input: JSON.stringify(texts.map(codePoints)), encoding: 'utf8', maxBuffer: 1 << 26 });
  assert.equal(r.status, 0, r.stderr);
  const oracle = JSON.parse(r.stdout) as { texts: { length: number; bytes: number[]; categories: string[] }[] };
  texts.forEach((s, i) => {
    const want = oracle.texts[i]!;
    assert.equal(codePoints(s).length, want.length, 'len()');
    assert.deepEqual(bytes(s), want.bytes, 'str.encode()');
    // A mark, to the model, is what the Unicode data calls a mark (Mn, Mc, Me), or the joiner U+200D.
    codePoints(s).forEach((cp, k) => assert.equal(kindOf(cp) !== 'letter', want.categories[k]!.startsWith('M') || cp === 0x200d, hex(cp)));
  });
});

test('bytes, code points and the characters a reader sees are three different counts of the same text', () => {
  fc.assert(fc.property(textArb, (s) => {
    const n = lengths(s);
    // Never more characters than code points, nor more code points than bytes; and each can be strictly fewer.
    assert.ok(n.characters <= n.points && n.points <= n.bytes);
    // The characters, laid end to end, are the text: nothing is lost or reordered.
    assert.equal(read(s).join(''), s);
    assert.deepEqual(clusters(s).flat(), codePoints(s));
    // A character starts with whatever comes first; every later code point in it is a mark or a joined consonant.
    for (const c of clusters(s)) for (const cp of c.slice(1)) assert.ok(kindOf(cp) !== 'letter' || c.includes(0x094d));
  }), params(1000));
  const strict = WORDS.map((w) => lengths(w.text)).filter((n) => n.characters < n.points && n.points < n.bytes);
  assert.equal(strict.length, 3, 'three of the page’s words have three different lengths');
});

test('cutting a text: whole characters survive a cut by characters, and a cut by code points can leave a joiner dangling', () => {
  const namaste = word('namaste').text;
  assert.equal(cut(namaste, 4, 'points'), 'नमस्');
  // The joiner is the last code point of the cut text: the conjunct it began is gone.
  assert.equal(kindOf(codePoints(cut(namaste, 4, 'points')).at(-1)!), 'joiner');
  assert.equal(cut(namaste, 2, 'characters'), 'नम');
  assert.equal(cut(namaste, 3, 'characters'), namaste);
  // Ten bytes hold three whole code points and a third of the fourth, which is dropped.
  assert.equal(cut(namaste, 10, 'bytes'), 'नमस');
  assert.equal(cut(namaste, 9, 'bytes'), 'नमस');
  // How each cut ends: bytes cut the last character short, code points leave the joiner dangling, characters stay whole.
  assert.deepEqual([cutStory(namaste, 10, 'bytes'), cutStory(namaste, 4, 'points'), cutStory(namaste, 2, 'characters')].map((c) => [c.text, c.ends]), [['नमस', 'short'], ['नमस्', 'joiner'], ['नम', 'whole']]);
  // JavaScript's own slice agrees with the model's cut by code points here.
  assert.equal(namaste.slice(0, 4), cut(namaste, 4, 'points'));
  fc.assert(fc.property(textArb, fc.nat(14), (s, n) => {
    const kept = cut(s, n, 'characters');
    assert.deepEqual(read(kept), read(s).slice(0, n));
    assert.ok(s.startsWith(cut(s, n, 'points')) && s.startsWith(cut(s, n, 'bytes')));
    assert.ok(bytes(cut(s, n, 'bytes')).length <= n);
  }), params(500));
});

test('the page’s words taken apart: each code point’s bytes and kind, and the check answers’ cases', () => {
  const n = apart(word('namaste').text);
  assert.deepEqual(n.parts.map((p) => p.hex), ['U+0928', 'U+092E', 'U+0938', 'U+094D', 'U+0924', 'U+0947']);
  assert.deepEqual(n.parts.map((p) => p.kind), ['letter', 'letter', 'letter', 'joiner', 'letter', 'mark']);
  assert.deepEqual(n.parts.map((p) => p.cluster), [0, 1, 2, 2, 2, 2]);
  assert.deepEqual(n.parts[0]!.bytes.map(byteHex), ['E0', 'A4', 'A8']);
  assert.ok(n.parts.every((p) => p.bytes.length === 3));
  assert.deepEqual(n.read, ['न', 'म', 'स्ते']);
  const h = apart(word('shalom').text);
  assert.deepEqual(h.parts.map((p) => p.kind), ['letter', 'mark', 'mark', 'letter', 'letter', 'mark', 'letter']);
  assert.deepEqual([h.bytes, h.points, h.characters], [14, 7, 4]);
  // The same word without its vowel points: shorter to a program, the same four characters to a reader.
  assert.deepEqual(lengths(h.parts.filter((p) => p.kind === 'letter').map((p) => p.char).join('')), { bytes: 8, points: 4, characters: 4 });
  // The check answers.
  assert.deepEqual([SALAM.bytes, SALAM.points, SALAM.characters], [12, 6, 4]);
  assert.equal(SALAM.parts.filter((p) => p.kind === 'mark').length, 2);
  assert.deepEqual(FIT, { limit: 10, fit: 2, used: 6, read: ['न', 'म'], next: 'स्ते', nextPoints: 4, nextBytes: 12 });
  assert.deepEqual(HELLO, { bytes: 5, points: 5, characters: 5 });
});
