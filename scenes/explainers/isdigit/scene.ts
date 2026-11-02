import { Scene, Text, Rectangle, Line } from '../../../src/index.ts';
import type { Mobject, Box } from '../../../src/index.ts';
import { stage, settingsOf } from '../../../explain/index.ts';
import {
  CHARS,
  LINEUP,
  PREDICATES,
  COUNTS,
  fields,
  flags,
  numericType,
  predicates,
  asciiFor,
  intOf,
  guarded,
  accepts,
  grouped,
  valueOf,
  UNSHOWN,
  UNSHOWN_DECIMAL,
} from '../lib/isdigit.ts';
import type { Char, CharId, Predicate } from '../lib/isdigit.ts';

// Sources: CPython at tag v3.15.1 and the Unicode Character Database 17.0.0. Lines are quoted beside
// each claim here and in lib/isdigit.ts; CPython's own answers are frozen in test/explain-isdigit.test.ts.
const CPY = 'https://github.com/python/cpython/blob/v3.15.1/';
const UCD = 'https://www.unicode.org/Public/17.0.0/ucd/';

// Sizes are for a 390 px page, whose stage is 358 px wide: native text at 0.54 units is 12 px there,
// 43 px on a 1280 px stage. A code line takes about 1.5 × SIZE, so a panel of n lines is about 0.81 n + 0.6 tall.
// At SIZE, text reads at 12 px on a phone without a close-up. A code panel shrinks its lines to fit its box, so the two with the longest lines
// (46 and 47 characters, up to 14.9 units wide at SIZE) get the full width the stage allows, WIDE, and keep SIZE.
const SIZE = 0.54;
const WIDE = 7.8;
const STYLE = 'hand-drawn';
const TOP = 3.05;
const BOTTOM = -4.25;

const q = (c: Char) => `'${c.char}'`;
const MASKS = ['DECIMAL_MASK', 'DIGIT_MASK', 'NUMERIC_MASK'] as const;
const list = (xs: readonly string[]) =>
  xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;
const TF = (b: boolean) => (b ? 'True' : 'False');

/** The lineup's characters that isdigit() passes and int() rejects: ² alone. */
const LET_THROUGH = LINEUP.filter((k) => predicates(CHARS[k]).isdigit && !('value' in intOf(CHARS[k])));
if (LET_THROUGH.join() !== 'super') throw new Error(`isdigit() lets through ${LET_THROUGH.join()}, not super`);
/** Check 2's text: ٣, an ASCII 4 and ². Every character has a digit value; int() rewrites it one character at a time. */
const MIXED = [CHARS.arabic, null, CHARS.super] as const;
const mixedText = MIXED.map((c) => (c ? c.char : '4')).join(''),
  mixedAscii = MIXED.map((c) => (c ? asciiFor(c) : '4')).join(''),
  mixedIsdigit = MIXED.every((c) => !c || predicates(c).isdigit);
/** The script's one-sentence answer, stated in the lineup step of every case. */
const ANSWER = `No: isdigit() is True for ${CHARS.super.char}, and int('${CHARS.super.char}') raises ValueError`;

/** The row as three lines: fields 0 to 4, fields 5 to 9 (the numeric ones in the middle), fields 10 to 14. */
const rowLines = (c: Char) => {
  const f = c.ucd.split(';');
  return [f.slice(0, 5).join(';') + ';', f.slice(5, 10).join(';') + ';', f.slice(10).join(';')];
};

/** The three nested sets, outermost first, as boxes on the stage. */
const SETS: readonly { p: Predicate; box: Box; label: string }[] = [
  { p: 'isnumeric', box: [-7.45, -4.15, 7.45, 2.95], label: `isnumeric(): ${grouped(COUNTS.isnumeric)}` },
  { p: 'isdigit', box: [-7.05, -3.75, 2.75, 2.05], label: `isdigit(): ${grouped(COUNTS.isdigit)}` },
  { p: 'isdecimal', box: [-6.65, -3.35, -0.75, 1.15], label: `isdecimal(): ${grouped(COUNTS.isdecimal)}` },
];
/** Where each character sits: decimals two by two in the inner box, ² in the middle one, the rest outside it. */
const SPOT: Record<CharId, [number, number]> = {
  ascii: [-5.2, -0.45],
  arabic: [-2.3, -0.45],
  devanagari: [-5.2, -2.3],
  fullwidth: [-2.3, -2.3],
  super: [0.95, -1.4],
  half: [5.1, 1.1],
  roman: [5.1, -1.0],
  han: [5.1, -3.0],
};

export default class IsDigitExplainer extends Scene {
  static meta = {
    id: 'isdigit',
    title: 'Does isdigit guarantee int can parse it?',
    sources: [
      CPY + 'Doc/builtins/stdtypes.rst#L2432-L2523',
      CPY + 'Doc/builtins/functions.rst#L1050-L1086',
      CPY + 'Tools/unicode/makeunicodedata.py#L595-L603',
      CPY + 'Tools/unicode/makeunicodedata.py#L1205-L1222',
      CPY + 'Objects/unicodectype.c#L105-L144',
      CPY + 'Objects/unicodeobject.c#L12048-L12158',
      CPY + 'Objects/unicodeobject.c#L9515-L9557',
      CPY + 'Objects/longobject.c#L3187-L3212',
      UCD + 'UnicodeData.txt',
      UCD + 'Unihan.zip',
      'https://www.unicode.org/reports/tr44/tr44-38.html#UnicodeData.txt',
    ],
    // The script's answer and check questions (script.md); the lineup step states the answer in every case.
    answer: ANSWER,
    checks: [
      {
        question: `${UNSHOWN_DECIMAL.char}, ${UNSHOWN_DECIMAL.code}, is a bold nine from the mathematical alphabets, with this line in UnicodeData.txt: ${UNSHOWN_DECIMAL.ucd}. What do '${UNSHOWN_DECIMAL.char}'.isdigit() and int('${UNSHOWN_DECIMAL.char}') do?`,
        answer: `isdigit() returns ${TF(predicates(UNSHOWN_DECIMAL).isdigit)}, and int('${UNSHOWN_DECIMAL.char}') returns ${(intOf(UNSHOWN_DECIMAL) as { value: number }).value}. Field 6 holds ${fields(UNSHOWN_DECIMAL).decimal}, so CPython sets DECIMAL_MASK as well as the other two, and int() rewrites ${UNSHOWN_DECIMAL.char} as '${asciiFor(UNSHOWN_DECIMAL)}'. The styling doesn’t matter; field 6 does.`,
      },
      {
        question: `What do '${mixedText}'.isdigit() and int('${mixedText}') do? The text is an Arabic-Indic three, an ASCII 4 and a superscript two.`,
        answer: `isdigit() returns ${TF(mixedIsdigit)}, because every character has a digit value in field 7. int() raises ValueError: it rewrites the text one character at a time as '${mixedAscii}', which it cannot parse.`,
      },
      {
        question: `${UNSHOWN.char}, ${UNSHOWN.code}, has this line in UnicodeData.txt: ${UNSHOWN.ucd}. What do '${UNSHOWN.char}'.isdigit() and int('${UNSHOWN.char}') do?`,
        answer: `isdigit() returns ${TF(predicates(UNSHOWN).isdigit)}, and int('${UNSHOWN.char}') raises ValueError. Field 6 is empty while fields 7 and 8 hold ${fields(UNSHOWN).digit}, so CPython sets DIGIT_MASK and NUMERIC_MASK but not DECIMAL_MASK, and int() rewrites ${UNSHOWN.char} as '${asciiFor(UNSHOWN)}'. It fails the same way ${CHARS.super.char} does.`,
      },
    ],
  };
  static settings = [
    {
      id: 'char',
      label: 'Character',
      default: 'super',
      options: [
        { value: 'arabic', label: '٣ Arabic-Indic' },
        { value: 'super', label: '² superscript' },
        { value: 'half', label: '½ fraction' },
        { value: 'roman', label: 'Ⅻ Roman' },
        { value: 'han', label: '三 Chinese' },
      ],
    },
    {
      id: 'guard',
      label: 'Checked with',
      default: 'isdigit',
      options: PREDICATES.map((p) => ({ value: p, label: `${p}()` })),
    },
  ];

  override async construct() {
    const values = settingsOf(this);
    const id = values.char as CharId,
      guard = values.guard as Predicate;
    const c = CHARS[id];
    const s = stage(this, { style: STYLE, headingSize: 0.6 });
    const ink = s.palette.ink;
    const type = numericType(c),
      f = fields(c),
      fl = flags(c),
      p = predicates(c),
      int = intOf(c),
      run = guarded(c, guard);
    const parsed = 'value' in int;

    /** The nested sets with every character in place; `lit` draws one set heavier, `mark` colours this case's character. */
    const sets = async (lit: Predicate | null, mark: string, as: string) => {
      const mobs: Mobject[] = [];
      for (const set of SETS) {
        const [x0, y0, x1, y1] = set.box;
        const on = set.p === lit;
        mobs.push(
          new Rectangle({
            width: x1 - x0,
            height: y1 - y0,
            cornerRadius: 0.2,
            fill: 'none',
            stroke: ink,
            strokeWidth: on ? 0.09 : 0.03,
          }).moveTo([(x0 + x1) / 2, (y0 + y1) / 2]),
          new Text(set.label, {
            fontSize: SIZE,
            font: 'mono',
            color: ink,
            weight: on ? 'bold' : 'normal',
            anchor: 'start',
          }).moveTo([x0 + 0.25, y1 - 0.4], [-1, 0]),
        );
      }
      for (const k of LINEUP) {
        const mine = k === id;
        mobs.push(new Text(CHARS[k].char, { fontSize: 1.1, color: mine ? mark : ink }).moveTo(SPOT[k]));
        if (mine)
          mobs.push(
            new Rectangle({
              width: 1.6,
              height: 1.5,
              cornerRadius: 0.15,
              fill: 'none',
              stroke: mark,
              strokeWidth: 0.06,
            }).moveTo(SPOT[k]),
          );
      }
      const inside = (t: string) =>
        LINEUP.filter((k) => numericType(CHARS[k]) === t)
          .map((k) => CHARS[k].char)
          .join(' ');
      await s.enter(...mobs, {
        describe: `Three nested boxes. ${SETS[0]!.label} holds ${SETS[1]!.label}, which holds ${SETS[2]!.label}. Inside the innermost: ${inside('Decimal')}. In isdigit() but not isdecimal(): ${inside('Digit')}. Only in isnumeric(): ${inside('Numeric')}.${
          lit ? ` The ${lit}() box, the check's, is drawn heavier.` : ''
        } ${c.char} is circled, ${as}.`,
      });
    };

    // ------------------------------------------------------------------ the guard
    await this.step('guard', {
      title: `A guard: ${guard}() checks ${q(c)} before int()`,
      line: run.passes
        ? `Predict: does int(${q(c)}) return a number, or raise ValueError?`
        : `Predict: had int() run, would int(${q(c)}) return a number, or raise ValueError?`,
      caption: `One way to keep int() from raising is a guard: check the text first, and call int() only if the check passes. The check here is ${guard}(). ${q(c)} is a numeral whose Unicode value is ${valueOf(c)}, and ${guard}() returns ${
        run.passes
          ? 'True for it, so the next line calls int()'
          : 'False for it, so the code skips int() and treats the text as not a number'
      }.`,
    });
    await s.clear();
    const prog = await s.code([`s = "${c.char}"`, `if s.${guard}():`, '    n = int(s)'], {
      at: [-7.55, 0.2, 7.55, TOP],
      fontSize: SIZE * 1.2,
    });
    await prog.focus(run.passes ? [1, 2] : 1, { as: run.passes ? 'run' : 'the check that fails' });
    // What the check returns, said at the end of its line, just outside the panel.
    const check = prog.code.lines[1]!.box()!;
    await s.callout(check, `returns ${TF(run.passes)}`, {
      side: 'right',
      gap: prog.panel.box()![2] - check[2] + 0.35,
      color: run.passes ? s.good : s.bad,
      size: SIZE * 1.2,
    });
    this.state.guard = { predicate: guard, passes: run.passes };

    // ------------------------------------------------------------------ int()
    await this.step('int', {
      title: parsed ? `int(${q(c)}) returns ${int.value}` : `int(${q(c)}) raises ValueError`,
      line: `${q(c)} becomes '${asciiFor(c)}' before parsing${parsed ? '' : `, and no number contains '?'`}.`,
      // longobject.c:3193 calls _PyUnicode_TransformDecimalAndSpaceToASCII before parsing;
      // unicodeobject.c:9538-9552 rewrites each character; longobject.c:3209 is the error message.
      caption: `Before parsing, int() rewrites each non-ASCII character: any character Python counts as whitespace becomes ' ', a character with a decimal digit value becomes that ASCII digit, and anything else becomes '?', so the parse fails. ${c.char} ${
        f.decimal ? `has the decimal digit value ${f.decimal}` : 'has no decimal digit value'
      }, so it becomes '${asciiFor(c)}' and int(${q(c)}) ${parsed ? `returns ${int.value}` : 'raises ValueError'}${run.passes ? '' : ', had the check let it through'}. ${
        run.outcome === 'raised'
          ? 'The check let through text int() cannot parse.'
          : run.outcome === 'parsed'
            ? 'Here the check and int() agree.'
            : 'Here the check turned away text int() could not parse anyway.'
      }`,
    });
    await s.clear();
    const transform = await s.code(
      [
        '// unicodeobject.c:9538-9552, abridged',
        'if (ch < 127) out[i] = ch;',
        "else if (Py_UNICODE_ISSPACE(ch)) out[i] = ' ';",
        'else {',
        '    int decimal = Py_UNICODE_TODECIMAL(ch);',
        "    if (decimal < 0) { out[i] = '?'; break; }",
        "    out[i] = '0' + decimal; }",
      ],
      { at: [-WIDE, -2.75, WIDE, TOP], fontSize: SIZE },
    );
    await transform.focus(parsed ? 6 : 5, { as: 'the branch this character takes' });
    await s.note(`int(${q(c)})  ${parsed ? `returns ${int.value}` : 'raises ValueError'}`, {
      at: [0, -3.55],
      size: SIZE,
    });
    this.state.int = int;

    // ------------------------------------------------------------------ the lineup
    await this.step('lineup', {
      title: 'Eight numerals; int() accepts only the first four',
      line: `isdigit() is True for the first four and for ${CHARS.super.char} too.`,
      // UnicodeData.txt lines 52, 1598, 2337, 16765, 179, 190, 7719; Unihan_NumericValues.txt line 29.
      caption: `The Unicode Character Database gives each of these a numeric value: four ways to write 3, then superscript two, one half, Roman twelve and the Chinese numeral three. The brackets mark what each call returns: int() accepts only the first four, isdigit() reaches ${CHARS.super.char} as well, and isnumeric() all eight. So the answer is ${ANSWER[0]!.toLowerCase()}${ANSWER.slice(1)}. ${c.char}, circled, is this case’s character. Which part of its database entry does each check read?`,
    });
    await s.clear();
    // One row in lineup order; a bracket spans the characters each call accepts, which the model
    // must give as a run from the left: the decimals, then the one digit, then the other numerics.
    const slot = (i: number) => -6.3 + i * 1.8,
      ROW = -0.4;
    const span = (ok: (k: CharId) => boolean) => {
      const n = LINEUP.filter(ok).length;
      if (!LINEUP.slice(0, n).every(ok)) throw new Error('The lineup must list accepted characters first');
      return n;
    };
    /** A bracket over (up) or under (down) characters a to b, with its words at its left end. */
    const bracket = (a: number, b: number, y: number, up: boolean, words: string, color: string, heavy = false) => {
      const x0 = slot(a) - 0.78,
        x1 = slot(b) + 0.78,
        tick = up ? -0.15 : 0.15,
        stroke = { stroke: color, strokeWidth: heavy ? 0.075 : 0.03 };
      return [
        new Line([x0, y], [x1, y], stroke),
        new Line([x0, y], [x0, y + tick], stroke),
        new Line([x1, y], [x1, y + tick], stroke),
        new Text(words, { fontSize: SIZE, font: 'mono', color, weight: heavy ? 'bold' : 'normal' }).moveTo([x0 + 0.12, y + (up ? 0.37 : -0.37)], [-1, 0]),
      ];
    };
    const marks: Mobject[] = [];
    PREDICATES.forEach((p, level) => {
      const n = span((k) => predicates(CHARS[k])[p]);
      marks.push(...bracket(0, n - 1, 0.72 + level * 0.82, true, `${p}() → True`, p === guard ? s.emphasis : ink, p === guard));
    });
    const parses = span((k) => 'value' in intOf(CHARS[k]));
    const returned = [...new Set(LINEUP.slice(0, parses).map((k) => (intOf(CHARS[k]) as { value: number }).value))];
    marks.push(
      ...bracket(0, parses - 1, -1.35, false, `int() → ${returned.join(' or ')}`, s.good),
      ...bracket(parses, LINEUP.length - 1, -1.35, false, 'int() → ValueError', s.bad),
    );
    const glyphs = LINEUP.map((k, i) => new Text(CHARS[k].char, { fontSize: 1.15, color: ink }).moveTo([slot(i), ROW]));
    const ring = new Rectangle({ width: 1.5, height: 1.5, cornerRadius: 0.15, stroke: s.emphasis, strokeWidth: 0.05, fill: 'none' }).moveTo([
      slot(LINEUP.indexOf(id)),
      ROW,
    ]);
    const sup = CHARS.super.char;
    await s.enter(...glyphs, ring, ...marks, new Text(`${sup}: isdigit() → True, int('${sup}') → ValueError`, { fontSize: SIZE * 1.1, font: 'mono', color: s.bad }).moveTo([0, -2.85]), {
      describe: `Eight characters in a row: ${LINEUP.map((k) => CHARS[k].char).join(' ')}. Brackets above span what each check accepts: isdecimal() the first ${span((k) => predicates(CHARS[k]).isdecimal)}, isdigit() the first ${span((k) => predicates(CHARS[k]).isdigit)}, isnumeric() all ${span((k) => predicates(CHARS[k]).isnumeric)}; the ${guard}() bracket is heavier. Brackets below: int() returns ${returned.join(' or ')} for the first ${parses} and raises ValueError for the rest. ${c.char} is circled. Under them: ${sup} passes isdigit() and int('${sup}') raises ValueError.`,
    });
    this.state.lineup = LINEUP.map((k) => ({ char: CHARS[k].char, type: numericType(CHARS[k]), int: intOf(CHARS[k]) }));

    // ------------------------------------------------------------------ its row in the database
    await this.step('ucd', {
      title:
        id === 'han'
          ? '三 gets its value, 3, from Unihan'
          : type === 'Decimal'
            ? `${c.char} has a value in fields 6, 7 and 8`
            : type === 'Digit'
              ? `${c.char} has a value in fields 7 and 8; field 6 is empty`
              : `${c.char} has a value only in field 8: ${valueOf(c)}`,
      line:
        id === 'han'
          ? 'Fields 6, 7 and 8 are empty; Unihan’s kPrimaryNumeric gives 3.'
          : `Fields 6, 7, 8 hold decimal, digit, numeric values: ${c.char} is ${type}.`,
      // UAX #44 rev. 38, the UnicodeData.txt field table: field 6 is filled only for Numeric_Type=Decimal,
      // field 7 for Decimal and Digit, field 8 for every numeric character; #Numeric_Type derives the type
      // from which fields are filled, and gives Numeric_Type=Numeric to Unihan's numeric ideographs.
      caption:
        id === 'han'
          ? 'UnicodeData.txt covers 三 only with a range line for the ideographs 4E00 to 9FFF, whose fields 6, 7 and 8 are empty, so int() finds no decimal digit value. Its value comes from the Unihan database: kPrimaryNumeric 3. Unicode gives every ideograph with such a value Numeric_Type=Numeric.'
          : `A UnicodeData.txt line has 15 fields split by semicolons; the middle line here holds fields 5 to 9. Field 6 is the decimal digit value, the one int() reads; 7 is the digit value, 8 the numeric value. ${c.char} fills ${
              type === 'Decimal' ? 'all three' : type === 'Digit' ? 'only 7 and 8' : 'only 8'
            }, so its Numeric_Type is ${type}.`,
    });
    await s.clear();
    const row = await s.code(
      id === 'han'
        ? [
            `# UnicodeData.txt:${c.ucdLine}, 4E00 to 9FFF`,
            c.ucd,
            `# Unihan_NumericValues.txt:${c.unihan!.line}`,
            `U+4E09  ${c.unihan!.tag}  ${c.unihan!.value}`,
          ]
        : [`# UnicodeData.txt:${c.ucdLine}`, ...rowLines(c)],
      { at: [-WIDE, -0.05, WIDE, TOP], fontSize: SIZE },
    );
    await row.focus(id === 'han' ? 3 : 2, { as: id === 'han' ? 'the numeric value' : 'the numeric fields' });
    const blank = (v: string) => v || 'empty';
    await s.card(
      [
        ['Field 6, decimal', blank(f.decimal)],
        ['Field 7, digit', blank(f.digit)],
        [id === 'han' ? 'Field 8, from Unihan' : 'Field 8, numeric', blank(f.numeric)],
      ],
      { at: [-7.55, BOTTOM, 7.55, -0.35], fontSize: SIZE, width: 10 },
    );
    this.state.fields = f;
    this.state.numericType = type;

    // ------------------------------------------------------------------ flags
    const set = MASKS.filter((m) => fl[m]);
    await this.step('flags', {
      title: set.length === 3 ? `CPython gives ${c.char} all three flags` : `CPython gives ${c.char} ${list(set)}`,
      line: 'Each filled field sets one flag; each predicate tests one flag.',
      // makeunicodedata.py:595-603; lines 998-1000 name fields 6, 7 and 8; lines 1210-1222 copy Unihan's
      // value into field 8. unicodectype.c:105-144: each predicate tests one flag.
      caption: `When CPython builds its character tables, makeunicodedata.py sets one flag for each filled field${
        id === 'han' ? ', after copying Unihan’s value into field 8' : ''
      }. It calls fields 6, 7 and 8 decomposition_mapping, numeric_type and numeric_value. isdecimal(), isdigit() and isnumeric() each test one flag, so isdigit() asks about field 7 while int() reads field 6.`,
    });
    await s.clear();
    const make = await s.code(
      [
        '# makeunicodedata.py:595-603, abridged',
        'if record.decomposition_mapping:  # field 6',
        '    flags |= DECIMAL_MASK',
        'if record.numeric_type:           # field 7',
        '    flags |= DIGIT_MASK',
        'if record.numeric_value:          # field 8',
        '    flags |= NUMERIC_MASK',
      ],
      { at: [-7.55, -2.75, 7.55, TOP], fontSize: SIZE },
    );
    const first = MASKS.findIndex((m) => fl[m]);
    await make.focus([1 + 2 * first, 6], {
      as: set.length === 1 ? 'the flag this character gets' : 'the flags this character gets',
    });
    await s.note(`${q(c)}: ${PREDICATES.map((k) => `${k}() ${TF(p[k])}`).join(', ')}`, { at: [0, -3.55], size: SIZE });
    this.state.flags = fl;
    this.state.predicates = p;

    // ------------------------------------------------------------------ the nested sets, and where the check leaves this character
    // One step: the counts, the nesting, and the check's own box drawn heavy with this case's character marked.
    const where =
      type === 'Decimal' ? 'in the innermost box' : type === 'Digit' ? 'in the middle box but outside the innermost' : 'in the outer box only';
    await this.step('outcome', {
      title:
        run.outcome === 'parsed'
          ? `${guard}() and int() agree on ${c.char}`
          : run.outcome === 'raised'
            ? `${guard}() let ${c.char} through to a ValueError`
            : `${guard}() turned ${c.char} away, as int() would`,
      line:
        run.outcome === 'parsed'
          ? `${c.char} is in the innermost box, so every check passes it.`
          : run.outcome === 'raised'
            ? `${c.char} is inside the ${guard}() box but outside the innermost.`
            : `${c.char} is outside the ${guard}() box and has no decimal value.`,
      caption: `A scan of every code point in CPython 3.15.1 (Unicode 17.0.0) finds ${grouped(COUNTS.isdecimal)} characters accepted by isdecimal(), ${grouped(COUNTS.isdigit)} by isdigit() and ${grouped(
        COUNTS.isnumeric,
      )} by isnumeric(). Every decimal also has a digit value, and every digit has a numeric value, so the sets nest, and the innermost holds the only single characters int() accepts. ${c.char} is ${where}. ${
        run.outcome === 'parsed'
          ? `The ${guard}() box is drawn heavy: the check passes ${c.char}, and int() returns ${parsed ? int.value : ''}.`
          : run.outcome === 'raised'
            ? `The ${guard}() box is drawn heavy: the check passes ${c.char}, and int() raises ValueError: invalid literal for int() with base 10.`
            : `The check fails on ${c.char}, so the code never calls int(); had it run, int() would have raised ValueError too.`
      }`,
    });
    await s.clear();
    await sets(
      guard,
      run.outcome === 'raised' ? s.bad : s.good,
      run.outcome === 'raised'
        ? 'marked as passing the check and failing int()'
        : run.outcome === 'parsed'
          ? 'marked as parsed'
          : 'marked as turned away',
    );
    this.state.counts = COUNTS;
    this.state.outcome = run.outcome;

    // ------------------------------------------------------------------ the check that matches int()
    await this.step('match', {
      title: 'For one character, only isdecimal() matches int()',
      line: 'To test a whole string, call int() and catch ValueError.',
      // UAX #44 rev. 38, field 7: no character encoded since Unicode 6.3.0 gets Numeric_Type=Digit.
      // functions.rst:1078-1082: int() takes a sign, surrounding whitespace and single underscores.
      caption: `Each row counts the single characters a check accepts and int() rejects; isdecimal() accepts exactly the ${grouped(
        COUNTS.int,
      )} int() takes. No character encoded since Unicode 6.3.0 gets Numeric_Type=Digit, so every character in the isdigit() row is older than that. Because int() also takes signs, surrounding spaces and underscores, no character check can match it on a whole string, so the code below calls int() and catches ValueError.`,
    });
    await s.clear();
    const counts = await s.card(
      PREDICATES.map((k) => [`${k}() but not int()`, grouped(accepts(k))] as const),
      { at: [-7.55, -0.75, 7.55, TOP], fontSize: SIZE, width: 11 },
    );
    await counts.mark(`${guard}() but not int()`, { as: 'this case’s check' });
    await s.code(['try: n = int(s)', 'except ValueError: n = None'], {
      at: [-7.55, BOTTOM, 7.55, -1.25],
      fontSize: SIZE,
    });
    this.state.accepts = Object.fromEntries(PREDICATES.map((k) => [k, accepts(k)]));
  }
}
