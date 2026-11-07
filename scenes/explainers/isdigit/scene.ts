import { Scene, Text, Group } from '../../../src/index.ts';
import { stage, settingsOf, Card, CodeBlock, answerOf, view, having } from '../../../explain/index.ts';
import { callout } from '../../../explain/drawing.ts';
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
  valueOf,
} from './model.ts';
import { grouped } from '../lib/format.ts';
import type { Char, CharId, NumericType, Predicate } from './model.ts';
import { SIZE, drawLineup, drawSets } from './picture.ts';

// Sources: CPython at tag v3.15.1 and the Unicode Character Database 17.0.0. Lines are quoted beside
// each claim here and in model.ts; CPython's own answers are frozen in model.test.ts.
const CPY = 'https://github.com/python/cpython/blob/v3.15.1/';
const UCD = 'https://www.unicode.org/Public/17.0.0/ucd/';

const WIDE = 7.8;
const STYLE = 'hand-drawn';
const TOP = 3.05;
const BOTTOM = -4.25;

const q = (c: Char) => `'${c.char}'`;
const TF = (b: boolean) => (b ? 'True' : 'False');


/** The row as three lines: fields 0 to 4, fields 5 to 9 (the numeric ones in the middle), fields 10 to 14. */
const rowLines = (c: Char) => {
  const f = c.ucd.split(';');
  return [f.slice(0, 5).join(';') + ';', f.slice(5, 10).join(';') + ';', f.slice(10).join(';')];
};

/** What the steps record of this scenario's character, each part from the step that records it. */
type DigitState = {
  /** The character the guard checks. */
  char?: string;
  guard?: { predicate: Predicate; passes: boolean };
  int?: ReturnType<typeof intOf>;
  fields?: ReturnType<typeof fields>;
  numericType?: NumericType;
  flags?: ReturnType<typeof flags>;
  predicates?: ReturnType<typeof predicates>;
  /** The database lines the step quotes, the character's row split where its numeric fields are. */
  ucd?: string[];
  accepts?: Record<string, number>;
};

export default class IsDigitExplainer extends Scene<DigitState, {}> {
  static meta = {
    sources: [
      CPY + 'Doc/builtins/stdtypes.rst#L2432-L2523',
      CPY + 'Doc/builtins/functions.rst#L1050-L1086',
      CPY + 'Tools/unicode/makeunicodedata.py#L595-L603',
      CPY + 'Tools/unicode/makeunicodedata.py#L1205-L1222',
      CPY + 'Objects/unicodectype.c#L105-L144',
      CPY + 'Objects/unicodeobject.c#L12048-L12158',
      CPY + 'Objects/unicodeobject.c#L9515-L9557',
      CPY + 'Objects/longobject.c#L3187-L3212',
    CPY + 'Objects/floatobject.c#L180-L189',
      UCD + 'UnicodeData.txt',
      UCD + 'Unihan.zip',
      'https://www.unicode.org/reports/tr44/tr44-38.html#UnicodeData.txt',
    ],
    // Sentences that reach past the eight characters on screen, and the test that holds each.
    claims: [
      { says: 'call int() only if the check passes', shown: true as const },
      { says: 'Eight numerals; int() accepts only the first four', shown: true as const },
      { says: 'int() and isdecimal() accept only the first four', shown: true as const },
      { says: 'has a value only in field 8', shown: true as const },
      { says: 'fills only', shown: true as const },
      { says: 'is in the innermost box, so every check passes it', test: 'model.test.ts: the model gives CPython 3.15.1' },
      { says: 'A scan of every code point in CPython 3.15.1', test: 'model.test.ts: the model gives CPython 3.15.1' },
      { says: 'Every decimal also has a digit value, and every digit has a numeric value', test: 'model.test.ts: the three predicates nest, whatever the row' },
      { says: 'The innermost box holds the only single characters int() accepts', test: 'model.test.ts: int() accepts a non-ASCII character exactly when isdecimal() does' },
      { says: 'For one character, only isdecimal() matches int()', test: 'model.test.ts: int() accepts a non-ASCII character exactly when isdecimal() does' },
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
    const scriptAnswer = answerOf(this);
    const values = settingsOf(this);
    const id = values.char as CharId,
      guard = values.guard as Predicate;
    const c = CHARS[id];
    const s = stage(this, { style: STYLE, headingSize: 0.6 });
    const type = numericType(c),
      f = fields(c),
      p = predicates(c),
      int = intOf(c),
      run = guarded(c, guard);
    const parsed = 'value' in int;

    // ------------------------------------------------------------------ the guard
    // The code panel is a view of the step's state, with its focus bar and the callout of what the check returns.
    await this.step('guard', {
      title: `A guard: ${guard}() checks ${q(c)} before int()`,
      line: run.passes
        ? `Predict: does int(${q(c)}) return a number, or raise ValueError?`
        : `Predict: had int() run, would int(${q(c)}) return a number, or raise ValueError?`,
      caption: `Python’s int() turns text into a whole number and raises ValueError when it cannot. One way to keep it from raising is a guard: check the text first, and call int() only if the check passes. The check here is the string method ${guard}(). ${q(c)} is a numeral whose Unicode value is ${valueOf(c)}, and ${guard}() returns ${
        run.passes
          ? 'True for it, so the next line calls int()'
          : 'False for it, so the code skips int() and treats the text as not a number'
      }.`,
    });
    await s.clear();
    // `char`: the character the guard checks.
    this.state.char = c.char;
    this.state.guard = { predicate: guard, passes: run.passes };
    // Three lines are the whole picture: set large, with what the check returns beside them,
    // the panel and its callout centred together on the stage.
    const GUARD_SIZE = SIZE * 1.5,
      CALLOUT_GAP = 0.35,
      returnsOf = (st: DigitState) => `returns ${TF(having(st, 'guard').guard.passes)}`;
    const program = view(
      this,
      (st) => {
        const { predicate, passes } = having(st, 'guard').guard;
        // The lines that run when the check passes, or the check alone when it fails.
        const block = new CodeBlock(this, s.palette, [`s = "${st.char}"`, `if s.${predicate}():`, '    n = int(s)'], {
          at: [-7.55, -4.0, 7.55, TOP],
          fontSize: GUARD_SIZE,
          focus: passes ? [1, 2] : 1,
          focusAs: passes ? 'run' : 'the check that fails',
        });
        const [x0, , x1] = block.panel.box()!,
          across = x1 - x0 + CALLOUT_GAP + new Text(returnsOf(st), { fontSize: GUARD_SIZE }).width();
        block.shift([-across / 2 - x0, 0]);
        // What the check returns, said at the end of its line, just outside the panel.
        const check = block.code.lines[1]!.box()!;
        const returns = callout(s, check, returnsOf(st), {
          side: 'right',
          gap: block.panel.box()![2] - check[2] + CALLOUT_GAP,
          color: passes ? s.good : s.bad,
          size: GUARD_SIZE,
        });
        return new Group(block, returns);
      },
      { place: false },
    );
    await s.enter(program, { runTime: 0.4 });

    // ------------------------------------------------------------------ int()
    await this.step('int', {
      title: parsed ? `int(${q(c)}) returns ${int.value}` : `int(${q(c)}) raises ValueError`,
      line: `${q(c)} becomes '${asciiFor(c)}' before parsing${parsed ? '' : `, and no number contains '?'`}.`,
      // longobject.c:3193 calls _PyUnicode_TransformDecimalAndSpaceToASCII before parsing;
      // unicodeobject.c:9538-9552 rewrites each character; longobject.c:3209 is the error message.
      caption: `Before parsing, int() converts non-ASCII decimal digits to ASCII digits and whitespace to spaces; other non-ASCII characters become '?'. ${c.char} ${
        f.decimal ? `has the decimal digit value ${f.decimal}` : 'has no decimal digit value'
      }, so it becomes '${asciiFor(c)}' and int(${q(c)}) ${parsed ? `returns ${int.value}` : 'raises ValueError'}${run.passes ? '' : ', had the check let it through'}.${run.outcome === 'raised' ? ' Passing the check did not guarantee a successful parse.' : ''}`,
    });
    await s.clear();
    this.state.int = int;
    const answer = (st: DigitState) => {
      const result = having(st, 'int').int;
      return { parsed: 'value' in result, said: `int('${st.char}')  ${'value' in result ? `returns ${result.value}` : 'raises ValueError'}` };
    };
    // The source is the same in every scenario; the branch this character takes is its state's.
    const transform = view(
      this,
      (st) =>
        new CodeBlock(
          this,
          s.palette,
          [
            '// unicodeobject.c:9538-9552, abridged',
            'if (ch < 127) out[i] = ch;',
            "else if (Py_UNICODE_ISSPACE(ch)) out[i] = ' ';",
            'else {',
            '    int decimal = Py_UNICODE_TODECIMAL(ch);',
            "    if (decimal < 0) { out[i] = '?'; break; }",
            "    out[i] = '0' + decimal; }",
          ],
          {
            at: [-WIDE, -2.75, WIDE, TOP],
            fontSize: SIZE,
            focus: answer(st).parsed ? 6 : 5,
            focusAs: 'the branch this character takes',
            key: 'transform',
          },
        ),
      { place: false },
    );
    await s.enter(transform, { runTime: 0.4 });
    // What int() does with it: a view of the state's answer, where the stage's note went.
    const said = view(this, (st) => this.text(answer(st).said, { fontSize: SIZE, color: s.soft }).moveTo([0, -3.55]), { place: false });
    await s.enter(said, { runTime: 0.3 });

    // ------------------------------------------------------------------ the lineup
    // One row in lineup order; a bracket spans the characters each call accepts, which the model
    // must give as a run from the left: the decimals, then the one digit, then the other numerics.
    const span = (ok: (k: CharId) => boolean) => {
      const n = LINEUP.filter(ok).length;
      if (!LINEUP.slice(0, n).every(ok)) throw new Error('The lineup must list accepted characters first');
      return n;
    };
    const lineup = {
      // This scenario's character, circled, and its check, whose bracket is heavier.
      char: c.char,
      guard,
      lineup: LINEUP.map((k) => ({ char: CHARS[k].char, type: numericType(CHARS[k]), int: intOf(CHARS[k]) })),
      // How many of the lineup, from the left, each check returns True for.
      accepted: Object.fromEntries(PREDICATES.map((k) => [k, span((x) => predicates(CHARS[x])[k])])) as Record<Predicate, number>,
    };
    const sup = CHARS.super.char;
    // ------------------------------------------------------------------ the nested sets, and where the check leaves this character
    // One step: the counts, the nesting, and the check's own box drawn heavy with this scenario's character marked.
    const where =
      type === 'Decimal' ? 'in the innermost box' : type === 'Digit' ? 'in the middle box but outside the innermost' : 'in the outer box only';
    const outcome = {
      char: c.char,
      guard,
      counts: COUNTS,
      outcome: run.outcome,
      // Where each of the lineup sits among the sets, by its numeric type.
      lineup: lineup.lineup.map(({ char, type }) => ({ char, type })),
    };
    await s.steps([
      {
        id: 'lineup',
        title: 'Eight numerals; int() accepts only the first four',
        line: `isdigit() is True for the first four and for ${CHARS.super.char} too.`,
        // UnicodeData.txt lines 52, 1598, 2337, 16765, 179, 190, 7719; Unihan_NumericValues.txt line 29.
        caption: `Unicode gives each of these a numeric value: four ways to write 3, then superscript two, one half, Roman twelve and the Chinese numeral three. The brackets above show which characters each string check returns True for; the brackets below show what int() does. int() and isdecimal() accept only the first four, isdigit() takes ${CHARS.super.char} as well, and isnumeric() takes all eight. So the answer is ${scriptAnswer[0]!.toLowerCase()}${scriptAnswer.slice(1)}. ${c.char}, circled, is this scenario’s character. If all eight have a numeric value, what does each check look up?`,
        state: lineup,
        describe: (st) => {
          const parses = st.lineup.filter((x) => 'value' in x.int).length,
            returned = [...new Set(st.lineup.slice(0, parses).map((x) => (x.int as { value: number }).value))];
          return `Eight characters in a row: ${st.lineup.map((x) => x.char).join(' ')}. Brackets above span what each check accepts: isdecimal() the first ${st.accepted.isdecimal}, isdigit() the first ${st.accepted.isdigit}, isnumeric() all ${st.accepted.isnumeric}; the ${st.guard}() bracket is heavier. Brackets below: int() returns ${returned.join(' or ')} for the first ${parses} and raises ValueError for the rest. ${st.char} is circled. Under them: ${sup} passes isdigit() and int('${sup}') raises ValueError.`;
        },
        draw: drawLineup,
      },
    ]);

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
          ? 'Fields 6, 7 and 8 are empty; Unihan’s kPrimaryNumeric, its main numeric value, gives 3.'
          : `isdigit() follows field 7 and int() follows field 6: ${c.char} fills ${
              type === 'Decimal' ? 'both' : type === 'Digit' ? 'field 7 but not field 6' : 'neither'
            }.`,
      // UAX #44 rev. 38, the UnicodeData.txt field table: field 6 is filled only for Numeric_Type=Decimal,
      // field 7 for Decimal and Digit, field 8 for every numeric character; #Numeric_Type derives the type
      // from which fields are filled, and gives Numeric_Type=Numeric to Unihan's numeric ideographs.
      caption:
        id === 'han'
          ? '三 is covered by UnicodeData.txt’s ideograph range 4E00 to 9FFF, with fields 6, 7 and 8 empty. Unihan supplies kPrimaryNumeric 3, which CPython uses for isnumeric(). There is no decimal or digit value, so int() rejects 三 and isdigit() is False.'
          : `UnicodeData.txt separates decimal digit value (field 6), digit value (7) and numeric value (8). CPython builds the tables used by int()/isdecimal(), isdigit() and isnumeric() from those fields. ${c.char} fills ${
              type === 'Decimal' ? 'all three' : type === 'Digit' ? 'only 7 and 8' : 'only 8'
            }, so its numeric type in Unicode is ${type}${type === 'Digit' ? ', and isdigit() and int() disagree on it' : ''}.`,
    });
    await s.clear();
    this.state.fields = f;
    this.state.numericType = type;
    // The flags step is gone: what each check returns follows from the fields it reads, said in this step.
    this.state.flags = flags(c);
    this.state.predicates = p;
    // `ucd`: the database lines the step quotes, the character's row split where its numeric fields are.
    this.state.ucd =
      id === 'han'
        ? [
            `# UnicodeData.txt:${c.ucdLine}, 4E00 to 9FFF`,
            c.ucd,
            `# Unihan_NumericValues.txt:${c.unihan!.line}`,
            `U+4E09  ${c.unihan!.tag}  ${c.unihan!.value}`,
          ]
        : [`# UnicodeData.txt:${c.ucdLine}`, ...rowLines(c)];
    // The quoted lines, the line with the numeric value or fields in focus.
    const quoted = view(
      this,
      (st) =>
        new CodeBlock(this, s.palette, having(st, 'ucd').ucd, {
          at: [-WIDE, -0.05, WIDE, TOP],
          fontSize: SIZE,
          focus: id === 'han' ? 3 : 2,
          focusAs: id === 'han' ? 'the numeric value' : 'the numeric fields',
        }),
      { place: false },
    );
    await s.enter(quoted, { runTime: 0.4 });
    const row = quoted.current;
    // The three fields, a view of the state's: each check's field and what the row puts in it.
    const blank = (v: string) => v || 'empty';
    const fieldRows = (st: DigitState) => {
      const got = having(st, 'fields').fields;
      return [
        ['Field 6: int(), isdecimal()', blank(got.decimal)],
        ['Field 7: isdigit()', blank(got.digit)],
        [id === 'han' ? 'Field 8 (Unihan): isnumeric()' : 'Field 8: isnumeric()', blank(got.numeric)],
      ] as const;
    };
    const fieldCard = view(
      this,
      (st) => new Card(this, s.palette, fieldRows(st), { at: [-7.55, BOTTOM, 7.55, row.panel.box()![1] - 0.3], align: 'top', fontSize: SIZE, width: 10, direction: 'ltr' }),
      { place: false },
    );
    await s.enter(fieldCard, { runTime: 0.35, shift: [0, -0.08] });

    // ------------------------------------------------------------------ the nested sets
    await s.steps([
      {
        id: 'outcome',
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
        )} by isnumeric(). Every decimal also has a digit value, and every digit has a numeric value, so the sets nest. The innermost box holds the only single characters int() accepts. ${c.char} is ${where}. ${
          run.outcome === 'parsed'
            ? `The ${guard}() box is drawn heavy: the check passes ${c.char}, and int() returns ${parsed ? int.value : ''}.`
            : run.outcome === 'raised'
              ? `The ${guard}() box is drawn heavy: the check passes ${c.char}, and int() raises ValueError: invalid literal for int() with base 10.`
              : `The check fails on ${c.char}, so the code does not call int(); had it run, int() would have raised ValueError too.`
        }`,
        state: outcome,
        describe: (st) => {
          const inside = (t: string) => st.lineup.filter((x) => x.type === t).map((x) => x.char).join(' ');
          const label = (p: Predicate) => `${p}(): ${grouped(st.counts[p])}`;
          const as = st.outcome === 'raised' ? 'marked as passing the check and failing int()' : st.outcome === 'parsed' ? 'marked as parsed' : 'marked as turned away';
          return `Three nested boxes. ${label('isnumeric')} holds ${label('isdigit')}, which holds ${label('isdecimal')}. Inside the innermost: ${inside('Decimal')}. In isdigit() but not isdecimal(): ${inside('Digit')}. Only in isnumeric(): ${inside('Numeric')}. The ${st.guard}() box, the check's, is drawn heavier. ${st.char} is circled, ${as}.`;
        },
        draw: drawSets,
      },
    ]);

    // ------------------------------------------------------------------ the check that matches int()
    await this.step('match', {
      title: 'For one character, only isdecimal() matches int()',
      line: 'To test a whole string, call int() and catch ValueError.',
      // functions.rst:1078-1082: int() takes a sign, surrounding whitespace and single underscores.
      caption: `These rows count characters a check accepts but int() rejects. For single characters, isdecimal() agrees with int(): both accept decimal digits. Whole strings also need syntax rules: int() accepts signs, surrounding spaces and underscores in valid positions. Calling int() and catching ValueError asks the parser itself whether the string is valid.`,
    });
    await s.clear();
    this.state.accepts = Object.fromEntries(PREDICATES.map((k) => [k, accepts(k)]));
    // The counts, a view of the state's, with this scenario's check marked.
    const countRows = (st: DigitState) =>
      PREDICATES.map((k) => [`${k}() but not int()`, grouped(having(st, 'accepts').accepts[k]!)] as const);
    const MARKED = `${guard}() but not int()`;
    const counts = view(
      this,
      (st) =>
        new Card(this, s.palette, countRows(st), {
          at: [-7.55, -0.75, 7.55, 2.4], align: 'top', fontSize: SIZE, width: 11, direction: 'ltr', lit: MARKED, litAs: 'this scenario’s check',
        }),
      { place: false },
    );
    await s.enter(counts, { runTime: 0.35, shift: [0, -0.08] });
    // The answer's code right under the counts, the pair centred down the stage.
    await s.code(['try: n = int(s)', 'except ValueError: n = None'], {
      at: [-7.55, BOTTOM, 7.55, counts.box()![1] - 0.5],
      align: 'top',
      fontSize: SIZE,
    });
  }
}
