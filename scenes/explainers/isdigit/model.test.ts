import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHARS, LINEUP, intOf, predicates, PREDICATES, COUNTS, fields, flags, numericType, asciiFor, guarded, accepts, UNSHOWN, UNSHOWN_DECIMAL, SPACE, rewrite } from './model.ts';
import { grouped } from '../lib/format.ts';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fc, params } from '../lib/pbt.ts';
import type { Char, CharId } from './model.ts';
import { skipOptionalOracle, skipOracle } from '../lib/oracle.ts';

test('the answer’s claim: of the lineup, isdigit() passes and int() rejects ² alone', () => {
  assert.deepEqual(
    LINEUP.filter((k) => predicates(CHARS[k]).isdigit && !('value' in intOf(CHARS[k]))),
    ['super'],
  );
});

// Copied verbatim from https://www.unicode.org/Public/17.0.0/ucd/UnicodeData.txt, with line numbers,
// fetched 2026-10-25. 三 (U+4E09) has no line of its own: it falls in the range whose first line is 12349
// ("9FFF;<CJK Ideograph, Last>;Lo;0;L;;;;;N;;;;;" is line 12350).
const UNICODE_DATA: Record<CharId, readonly [number, string]> = {
  ascii: [52, '0033;DIGIT THREE;Nd;0;EN;;3;3;3;N;;;;;'],
  super: [179, '00B2;SUPERSCRIPT TWO;No;0;EN;<super> 0032;;2;2;N;SUPERSCRIPT DIGIT TWO;;;;'],
  half: [190, '00BD;VULGAR FRACTION ONE HALF;No;0;ON;<fraction> 0031 2044 0032;;;1/2;N;FRACTION ONE HALF;;;;'],
  arabic: [1598, '0663;ARABIC-INDIC DIGIT THREE;Nd;0;AN;;3;3;3;N;;;;;'],
  devanagari: [2337, '0969;DEVANAGARI DIGIT THREE;Nd;0;L;;3;3;3;N;;;;;'],
  roman: [7719, '216B;ROMAN NUMERAL TWELVE;Nl;0;L;<compat> 0058 0049 0049;;;12;N;;;;217B;'],
  han: [12349, '4E00;<CJK Ideograph, First>;Lo;0;L;;;;;N;;;;;'],
  fullwidth: [16765, 'FF13;FULLWIDTH DIGIT THREE;Nd;0;EN;<wide> 0033;3;3;3;N;;;;;'],
};

// Unihan.zip of the same release, Unihan_NumericValues.txt line 29 (tab-separated).
const UNIHAN_LINE = [29, 'U+4E09\tkPrimaryNumeric\t3'] as const;

// CPython 3.15.1 (unicodedata.unidata_version 17.0.0), Docker image python:3.15-slim, run on 2026-10-25
// with `python -I -` reading SCRIPT below. Each row: isdecimal, isdigit, isnumeric, then int(c): the value
// or the ValueError message. CPython 3.14.9 (Unicode 16.0.0) gives the same eight rows.
const CPYTHON: Record<CharId, readonly [boolean, boolean, boolean, number | string]> = {
  ascii: [true, true, true, 3],
  arabic: [true, true, true, 3],
  devanagari: [true, true, true, 3],
  fullwidth: [true, true, true, 3],
  super: [false, true, true, "invalid literal for int() with base 10: '²'"],
  half: [false, false, true, "invalid literal for int() with base 10: '½'"],
  roman: [false, false, true, "invalid literal for int() with base 10: 'Ⅻ'"],
  han: [false, false, true, "invalid literal for int() with base 10: '三'"],
};

// The same run, over every code point but the surrogates, one character at a time. Every character int()
// accepted was decimal and every decimal was accepted; isdecimal implied isdigit, which implied isnumeric.
// (CPython 3.14.9 with Unicode 16.0.0 counts 760, 888, 2002 and 760.)
const CPYTHON_COUNTS = { isdecimal: 770, isdigit: 898, isnumeric: 2023, int: 770 };

const SCRIPT = String.raw`
import json, unicodedata
rows = {}
for c in ${JSON.stringify(LINEUP.map((k) => CHARS[k].char))}:
    try: n = int(c)
    except ValueError as e: n = str(e)
    rows[c] = [c.isdecimal(), c.isdigit(), c.isnumeric(), n]
counts = dict(isdecimal=0, isdigit=0, isnumeric=0, int=0)
nested = True
for cp in range(0x110000):
    if 0xD800 <= cp <= 0xDFFF: continue
    c = chr(cp)
    a, b, n = c.isdecimal(), c.isdigit(), c.isnumeric()
    try: int(c); ok = True
    except ValueError: ok = False
    counts['isdecimal'] += a; counts['isdigit'] += b; counts['isnumeric'] += n; counts['int'] += ok
    nested = nested and (not a or b) and (not b or n) and ok == a
print(json.dumps(dict(unidata=unicodedata.unidata_version, rows=rows, counts=counts, nested=nested), ensure_ascii=False))
`;

/** A python3 whose unicodedata is Unicode 17.0.0, from $PYTHON or PATH; null if there is none. */
function python(): string | null {
  for (const exe of [process.env.PYTHON, 'python3'].filter(Boolean) as string[]) {
    const r = spawnSync(exe, ['-I', '-c', 'import unicodedata; print(unicodedata.unidata_version)'], { encoding: 'utf8' });
    if (r.status === 0 && r.stdout.trim() === '17.0.0') return exe;
  }
  return null;
}

const PY = python();

// Two unshown rows, ⑤ and 𝟗, from earlier check questions, and the rewrite of '٣4²': the model still answers for them
// (the model's rewrite of '٣4', an earlier question, is kept). UnicodeData.txt 17.0.0 lines 8433 and 35286, fetched 2026-11-02.
const UNSHOWN_LINE = [8433, '2464;CIRCLED DIGIT FIVE;No;0;ON;<circle> 0035;;5;5;N;;;;;'] as const;

const UNSHOWN_DECIMAL_LINE = [35286, '1D7D7;MATHEMATICAL BOLD DIGIT NINE;Nd;0;EN;<font> 0039;9;9;9;N;;;;;'] as const;

// The check questions' cases, which no step shows: U+3000 then 7, refused by isdigit() and parsed by int(); and
// float(), which runs the same rewrite (floatobject.c:189), on '٣.5' and '2.²'. UnicodeData.txt 17.0.0 line 11279, fetched 2026-11-02.
const SPACE_LINE = [11279, '3000;IDEOGRAPHIC SPACE;Zs;0;WS;<wide> 0020;;;;N;;;;;'] as const;

// ⑤, ², ٣ and U+3000 have had these values since Unicode 1.1 and 𝟗 since 3.1, so any python3 answers as CPython 3.15.1 would.
const ANY_PY = spawnSync(process.env.PYTHON ?? 'python3', ['-I', '-c', 'pass']).status === 0 ? (process.env.PYTHON ?? 'python3') : null;

// ------------------------------------------------------------------ properties over synthetic rows

/** A UnicodeData.txt row as UAX #44 allows: Decimal fills 6, 7 and 8 alike; Digit 7 and 8; Numeric only 8; None none. */
const anyRow = fc
  .record({
    cp: fc.integer({ min: 0x80, max: 0x10ffff }).filter((n) => n < 0xd800 || n > 0xdfff),
    kind: fc.constantFrom('Decimal', 'Digit', 'Numeric', 'None'),
    d: fc.integer({ min: 0, max: 9 }),
    v: fc.constantFrom('1/2', '12', '-1/2', '1000', '7'),
  })
  .map(({ cp, kind, d, v }): Char => {
    const f = Array(15).fill('');
    f[0] = cp.toString(16).toUpperCase().padStart(4, '0');
    f[1] = 'TEST';
    if (kind === 'Decimal') f[6] = f[7] = f[8] = String(d);
    if (kind === 'Digit') f[7] = f[8] = String(d);
    if (kind === 'Numeric') f[8] = v;
    return { id: 'han', char: String.fromCodePoint(cp), code: 'U+' + f[0], name: 'TEST', ucd: f.join(';'), ucdLine: 0 };
  });

// The match step: UAX #44 says no character encoded since Unicode 6.3.0 has a digit value without a
// decimal one. The fixture lists every such character in UnicodeData.txt 17.0.0 with its DerivedAge.txt
// version; together they must be the isdigit() row's characters, all from before 6.3.0.
const DIGIT_AGES = JSON.parse(readFileSync(new URL('./fixtures/isdigit-digit-ages.json', import.meta.url), 'utf8')) as { byAge: Record<string, string[]> };

const version = (v: string) => v.split('.').map(Number).reduce((n, part, i) => n + part / 100 ** i, 0);

test('the model’s rows are UnicodeData.txt’s and Unihan’s lines, verbatim', () => {
  for (const id of LINEUP) {
    const [line, text] = UNICODE_DATA[id];
    assert.equal(CHARS[id].ucd, text, id);
    assert.equal(CHARS[id].ucdLine, line, id);
    // The line is the character's own, or the range that holds it
    const first = parseInt(text.split(';')[0]!, 16),
      cp = CHARS[id].char.codePointAt(0)!;
    assert.ok(first === cp || (text.includes(', First>') && cp >= first && cp <= 0x9fff), id);
  }
  const [tag, value] = UNIHAN_LINE[1].split('\t').slice(1);
  assert.deepEqual(CHARS.han.unihan, { tag, value, line: UNIHAN_LINE[0] });
  assert.equal(UNIHAN_LINE[1].split('\t')[0], CHARS.han.code);
});

test('the model gives CPython 3.15.1’s answer for every character it shows', () => {
  for (const id of LINEUP) {
    const c = CHARS[id];
    const [isdecimal, isdigit, isnumeric, int] = CPYTHON[id];
    assert.deepEqual(predicates(c), { isdecimal, isdigit, isnumeric }, id);
    assert.deepEqual(intOf(c), typeof int === 'number' ? { value: int } : { error: int }, id);
  }
  assert.deepEqual(COUNTS, CPYTHON_COUNTS);
  assert.equal(accepts('isdecimal'), 0);
  assert.equal(accepts('isdigit'), 128);
  assert.equal(accepts('isnumeric'), 1253);
});

test('Numeric_Type follows UAX #44: which of fields 6, 7 and 8 are filled', () => {
  const want: Record<CharId, string> = {
    ascii: 'Decimal',
    arabic: 'Decimal',
    devanagari: 'Decimal',
    fullwidth: 'Decimal',
    super: 'Digit',
    half: 'Numeric',
    roman: 'Numeric',
    han: 'Numeric',
  };
  for (const id of LINEUP) assert.equal(numericType(CHARS[id]), want[id], id);
  assert.deepEqual(fields(CHARS.half), { decimal: '', digit: '', numeric: '1/2' });
  assert.deepEqual(fields(CHARS.han), { decimal: '', digit: '', numeric: '3' });
  assert.deepEqual(flags(CHARS.super), { DECIMAL_MASK: false, DIGIT_MASK: true, NUMERIC_MASK: true });
  // int() puts an ASCII digit in a decimal's place and '?' in anything else's (unicodeobject.c:9545-9552)
  assert.deepEqual(
    LINEUP.map((k) => asciiFor(CHARS[k])),
    ['3', '3', '3', '3', '?', '?', '?', '?'],
  );
});

test('Node’s Unicode agrees where it can: the decimals are general category Nd', (t) => {
  if (skipOracle(t, process.versions.unicode !== '17.0' && `Node has Unicode ${process.versions.unicode}, not 17.0`)) return;
  // stdtypes.rst:2437: "Formally a decimal character is a character in the Unicode General Category Nd".
  let nd = 0;
  for (let cp = 0; cp < 0x110000; cp++) if ((cp < 0xd800 || cp > 0xdfff) && /\p{Nd}/u.test(String.fromCodePoint(cp))) nd++;
  assert.equal(nd, COUNTS.isdecimal);
  for (const id of LINEUP) assert.equal(/\p{Nd}/u.test(CHARS[id].char), predicates(CHARS[id]).isdecimal, id);
});

test('python3, run now, gives the frozen answers', (t) => {
  // CI's python3 (3.12) has Unicode 15.0, so this rerun is opt-in: the frozen answers are compared above.
  if (skipOptionalOracle(t, !PY && 'no python3 with Unicode 17.0.0 on PATH or in $PYTHON')) return;
  const r = spawnSync(PY!, ['-I', '-c', SCRIPT], { encoding: 'utf8', timeout: 120_000 });
  assert.equal(r.status, 0, r.stderr);
  const got = JSON.parse(r.stdout) as { unidata: string; rows: Record<string, unknown[]>; counts: object; nested: boolean };
  assert.equal(got.unidata, '17.0.0');
  for (const id of LINEUP) assert.deepEqual(got.rows[CHARS[id].char], [...CPYTHON[id]], id);
  assert.deepEqual(got.counts, CPYTHON_COUNTS);
  assert.equal(got.nested, true);
});

test('unshown rows follow from the model: ⑤’s and 𝟗’s fields and the rewrite of ٣4²', () => {
  assert.equal(UNSHOWN_DECIMAL.ucd, UNSHOWN_DECIMAL_LINE[1]);
  assert.equal(UNSHOWN_DECIMAL.ucdLine, UNSHOWN_DECIMAL_LINE[0]);
  assert.equal(UNSHOWN_DECIMAL.code, 'U+1D7D7');
  assert.deepEqual(fields(UNSHOWN_DECIMAL), { decimal: '9', digit: '9', numeric: '9' });
  assert.deepEqual(predicates(UNSHOWN_DECIMAL), { isdecimal: true, isdigit: true, isnumeric: true });
  assert.deepEqual(intOf(UNSHOWN_DECIMAL), { value: 9 });
  // ٣4²: every character passes isdigit(), and int() sees '34?'.
  assert.ok(predicates(CHARS.arabic).isdigit && predicates(CHARS.super).isdigit);
  assert.equal(asciiFor(CHARS.arabic) + '4' + asciiFor(CHARS.super), '34?');
  assert.equal(UNSHOWN.ucd, UNSHOWN_LINE[1]);
  assert.equal(UNSHOWN.ucdLine, UNSHOWN_LINE[0]);
  assert.equal(UNSHOWN.code, 'U+2464');
  assert.deepEqual(fields(UNSHOWN), { decimal: '', digit: '5', numeric: '5' });
  assert.deepEqual(predicates(UNSHOWN), { isdecimal: false, isdigit: true, isnumeric: true });
  assert.equal(asciiFor(UNSHOWN), '?');
  assert.deepEqual(intOf(UNSHOWN), { error: "invalid literal for int() with base 10: '⑤'" });
  // int() rewrites character by character: ٣ becomes '3' and the ASCII 4 is kept.
  assert.equal(asciiFor(CHARS.arabic) + '4', '34');
});

test('the check questions’ cases follow from the model: an ideographic space before 7, and float() on ٣.5 and 2.²', () => {
  assert.equal(SPACE.ucd, SPACE_LINE[1]);
  assert.equal(SPACE.ucdLine, SPACE_LINE[0]);
  assert.equal(SPACE.code, 'U+3000');
  assert.deepEqual(fields(SPACE), { decimal: '', digit: '', numeric: '' });
  assert.deepEqual(predicates(SPACE), { isdecimal: false, isdigit: false, isnumeric: false });
  assert.equal(asciiFor(SPACE), ' ');
  assert.equal(rewrite([SPACE, '7']), ' 7');
  assert.equal(rewrite([CHARS.arabic, '.5']), '3.5');
  // The rewrite stops at the first '?', as unicodeobject.c:9548-9549 does.
  assert.equal(rewrite(['2.', CHARS.super]), '2.?');
  assert.equal(rewrite([CHARS.super, '1']), '?');
  assert.throws(() => rewrite(['²']), /as a Char/);
});

test('python3, run now, agrees on the check questions’ cases', (t) => {
  if (skipOracle(t, !ANY_PY && 'no python3 on PATH or in $PYTHON')) return;
  const script = [
    'import json',
    "c = chr(0x2464)",
    "try: n = int(c)\nexcept ValueError as e: n = str(e)",
    "print(json.dumps([c.isdecimal(), c.isdigit(), c.isnumeric(), n, int(chr(0x663) + '4')], ensure_ascii=False))",
    "b = chr(0x1D7D7); m = chr(0x663) + '4' + chr(0xB2)",
    "try: k = int(m)\nexcept ValueError as e: k = str(e)",
    "print(json.dumps([b.isdecimal(), b.isdigit(), b.isnumeric(), int(b), m.isdigit(), k], ensure_ascii=False))",
  ].join('\n');
  const r = spawnSync(ANY_PY!, ['-I', '-c', script], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const p = predicates(UNSHOWN), int = intOf(UNSHOWN);
  const [first, second] = r.stdout.trim().split('\n');
  assert.deepEqual(JSON.parse(first!), [p.isdecimal, p.isdigit, p.isnumeric, 'error' in int ? int.error : int.value, Number(asciiFor(CHARS.arabic) + '4')]);
  const b = predicates(UNSHOWN_DECIMAL), bold = intOf(UNSHOWN_DECIMAL) as { value: number };
  assert.deepEqual(JSON.parse(second!), [b.isdecimal, b.isdigit, b.isnumeric, bold.value, true, "invalid literal for int() with base 10: '٣4²'"]);
});

test('python3, run now, agrees on the check questions’ space and float() cases', (t) => {
  if (skipOracle(t, !ANY_PY && 'no python3 on PATH or in $PYTHON')) return;
  const script = [
    'import json',
    "s = chr(0x3000) + '7'",
    "try: f = float('2.' + chr(0xB2))\nexcept ValueError as e: f = str(e)",
    "print(json.dumps([chr(0x3000).isspace(), s.isdigit(), int(s), float(chr(0x663) + '.5'), f], ensure_ascii=False))",
  ].join('\n');
  const r = spawnSync(ANY_PY!, ['-I', '-c', script], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout.trim()), [
    asciiFor(SPACE) === ' ',
    predicates(SPACE).isdigit,
    Number(rewrite([SPACE, '7']).trim()),
    Number(rewrite([CHARS.arabic, '.5'])),
    "could not convert string to float: '2.²'",
  ]);
});

test('the three predicates nest, whatever the row', () => {
  fc.assert(
    fc.property(anyRow, (c) => {
      const p = predicates(c);
      assert.ok(!p.isdecimal || p.isdigit);
      assert.ok(!p.isdigit || p.isnumeric);
      assert.equal(p.isnumeric, numericType(c) !== 'None');
    }),
    params(),
  );
});

test('int() accepts a non-ASCII character exactly when isdecimal() does, with its field 6 value', () => {
  fc.assert(
    fc.property(anyRow, (c) => {
      const int = intOf(c);
      assert.equal('value' in int, predicates(c).isdecimal);
      if ('value' in int) assert.equal(String(int.value), fields(c).decimal);
    }),
    params(),
  );
});

test('a check lets a character through to a ValueError exactly when it passes and the character is not decimal', () => {
  fc.assert(
    fc.property(anyRow, fc.constantFrom(...PREDICATES), (c, guard) => {
      const r = guarded(c, guard);
      assert.equal(r.outcome === 'raised', predicates(c)[guard] && !predicates(c).isdecimal);
      // isdecimal() never lets one through
      if (guard === 'isdecimal') assert.notEqual(r.outcome, 'raised');
    }),
    params(),
  );
});

test('every character in the isdigit() row was encoded before Unicode 6.3.0', () => {
  const listed = Object.values(DIGIT_AGES.byAge).flat();
  assert.equal(listed.length, accepts('isdigit'), 'the fixture lists the isdigit() row, character for character');
  assert.equal(new Set(listed).size, listed.length);
  for (const age of Object.keys(DIGIT_AGES.byAge)) assert.ok(version(age) < version('6.3'), `${DIGIT_AGES.byAge[age]!.length} encoded in ${age}`);
  // The shown and unshown digits are in it; the shown decimals are not.
  const hex = (c: Char) => c.char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0');
  for (const c of [CHARS.super, UNSHOWN]) assert.ok(listed.includes(hex(c)), c.name);
  for (const id of LINEUP) assert.equal(listed.includes(hex(CHARS[id])), numericType(CHARS[id]) === 'Digit', id);
});

test('python3, run now, finds the isdigit() row the fixture lists, up to its own Unicode version', (t) => {
  if (skipOracle(t, !ANY_PY && 'no python3 on PATH or in $PYTHON')) return;
  const script = [
    'import json, unicodedata',
    'cps = ["%04X" % cp for cp in range(0x110000) if not 0xD800 <= cp <= 0xDFFF and chr(cp).isdigit() and not chr(cp).isdecimal()]',
    'print(json.dumps(dict(unidata=unicodedata.unidata_version, cps=cps)))',
  ].join('\n');
  const r = spawnSync(ANY_PY!, ['-I', '-c', script], { encoding: 'utf8', timeout: 120_000 });
  assert.equal(r.status, 0, r.stderr);
  const got = JSON.parse(r.stdout) as { unidata: string; cps: string[] };
  const known = Object.entries(DIGIT_AGES.byAge).flatMap(([age, cps]) => (version(age) <= version(got.unidata) ? cps : []));
  assert.deepEqual([...got.cps].sort(), [...known].sort(), `python3 with Unicode ${got.unidata}`);
});

test('counts print with thousands separators', () => {
  assert.equal(grouped(2023), '2,023');
  assert.equal(grouped(770), '770');
  assert.equal(grouped(1253), '1,253');
  assert.equal(grouped(1234567), '1,234,567');
});
