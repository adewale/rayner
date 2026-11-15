// The method-only isdigit page: the same script intent and model as scenes/explainers/isdigit, with no
// engine. Every picture is a pure function from state to an SVG string; every step is a pure function from
// (character, check) to { title, caption, svg }. main.ts wires them to the shared shell.
import { CHARS, LINEUP, PREDICATES, accepts, asciiFor, fields, guarded, numericType, predicates, valueOf } from '../../../../scenes/explainers/isdigit/model.ts';
import type { Char, CharId, Predicate } from '../../../../scenes/explainers/isdigit/model.ts';
import { answer, questions } from '../../../../scenes/explainers/isdigit/answers.ts';
import { C, W, bars, fmt, line, rect, svg, text } from '../../draw.ts';
import { CPYTHON, CPYTHON_COUNTS } from './oracle.ts';

export interface Step {
  id: string;
  title: string;
  caption: string;
  svg: string;
}
export type Shown = 'arabic' | 'super' | 'half' | 'roman' | 'han';
export const SHOWN: readonly Shown[] = ['arabic', 'super', 'half', 'roman', 'han'];
export const DEFAULT: { char: Shown; guard: Predicate } = { char: 'super', guard: 'isdigit' };
const KIND: Record<CharId, string> = {
  ascii: 'ASCII',
  arabic: 'Arabic-Indic',
  devanagari: 'Devanagari',
  fullwidth: 'fullwidth',
  super: 'superscript',
  half: 'fraction',
  roman: 'Roman numeral',
  han: 'Chinese',
};
const call = (p: Predicate) => `${p}()`;

// ------------------------------------------------------------------ pictures: state in, SVG out
/** The guarded code, with the check's answer on line 2 and what line 3 does. */
export function codeSvg(c: Char, guard: Predicate): string {
  const r = guarded(c, guard);
  const lines = [`s = "${c.char}"`, `if s.${guard}():`, `    n = int(s)`, `else:`, `    n = None  # not a number`];
  let body = rect(8, 8, W - 16, 22 + lines.length * 24, '#fafafa', { stroke: C.line, rx: 6 });
  lines.forEach((l, i) => {
    const y = 32 + i * 24;
    const live = (i === 2 && r.passes) || (i >= 3 && !r.passes) || i < 2;
    body += text(20, y, l, { size: 14, mono: true, fill: live ? C.ink : C.soft });
  });
  const y1 = 32 + 24;
  body += text(W - 20, y1, `→ ${r.passes ? 'True' : 'False'}`, { size: 13.5, mono: true, anchor: 'end', fill: r.passes ? C.good : C.bad, weight: '600' });
  const h = 30 + lines.length * 24;
  body += text(8, h + 22, r.passes ? 'The check passes, so int() runs.' : 'The check fails, so int() never runs.', { size: 12.5, fill: C.soft });
  return svg(h + 32, body, `The guard: s.${guard}() returns ${r.passes ? 'True' : 'False'} for ${c.char}`);
}

/** int()'s rewrite: the character, the ASCII text int() parses, and the outcome. */
export function rewriteSvg(c: Char): string {
  const ascii = asciiFor(c),
    { decimal } = fields(c);
  const ok = /^[0-9]$/.test(ascii);
  let body = '';
  body += rect(20, 20, 90, 70, C.a, { rx: 6 }) + text(65, 66, c.char, { size: 32, anchor: 'middle' });
  body += text(65, 108, c.code, { size: 12, anchor: 'middle', mono: true, fill: C.soft });
  body += line(118, 55, 168, 55, { sw: 1.5 }) + `<path d="M168,50 L176,55 L168,60 z" fill="${C.ink}"/>`;
  body += text(147, 44, 'rewrite', { size: 12, anchor: 'middle', fill: C.soft });
  body += rect(186, 20, 70, 70, ok ? C.goodFill : C.badFill, { rx: 6 }) + text(221, 66, `'${ascii}'`, { size: 26, anchor: 'middle', mono: true });
  body += line(264, 55, 300, 55, { sw: 1.5 }) + `<path d="M300,50 L308,55 L300,60 z" fill="${C.ink}"/>`;
  body += text(354, 52, ok ? `${ascii}` : 'ValueError', { size: ok ? 26 : 13.5, anchor: 'middle', weight: '600', fill: ok ? C.good : C.bad });
  body += text(354, 72, ok ? 'int() returns' : 'int() raises', { size: 12, anchor: 'middle', fill: C.soft });
  const why = decimal ? `Field 6 (decimal digit value) is ${decimal}, so it becomes '${ascii}'.` : `Field 6 (decimal digit value) is empty, so it becomes '?'.`;
  body += text(8, 136, why, { size: 12.5 });
  body += text(8, 156, 'ASCII stays; whitespace becomes a space; anything else becomes ?.', { size: 12, fill: C.soft });
  return svg(166, body, `int() rewrites ${c.char} as '${ascii}' and ${ok ? `returns ${ascii}` : 'raises ValueError'}`);
}

/** The eight numerals and CPython 3.15.1's recorded answers for each, with this scenario's column marked. */
export function lineupSvg(id: CharId): string {
  const x0 = 96,
    cw = (W - x0 - 4) / LINEUP.length;
  let body = '';
  LINEUP.forEach((k, i) => {
    const x = x0 + i * cw;
    if (k === id) body += rect(x + 1, 4, cw - 2, 196, C.hi, { stroke: C.ink, sw: 1.5, rx: 4 });
    body += text(x + cw / 2, 32, CHARS[k].char, { size: 20, anchor: 'middle' });
    body += text(x + cw / 2, 50, valueOf(CHARS[k]), { size: 11.5, anchor: 'middle', fill: C.soft, mono: true });
  });
  body += text(8, 50, 'value', { size: 12, fill: C.soft });
  const rowsOf: [string, (k: CharId) => boolean][] = [
    ['isdecimal()', (k) => CPYTHON[k][0]],
    ['isdigit()', (k) => CPYTHON[k][1]],
    ['isnumeric()', (k) => CPYTHON[k][2]],
    ['int(c)', (k) => typeof CPYTHON[k][3] === 'number'],
  ];
  rowsOf.forEach(([label, f], r) => {
    const y = 70 + r * 32;
    body += text(8, y + 18, label, { size: 12.5, mono: true });
    LINEUP.forEach((k, i) => {
      const x = x0 + i * cw,
        yes = f(k);
      body += rect(x + 4, y + 2, cw - 8, 24, yes ? C.goodFill : C.badFill, { stroke: C.line, rx: 3 });
      const v = CPYTHON[k][3];
      const word = r === 3 ? (typeof v === 'number' ? String(v) : 'Error') : yes ? 'True' : 'False';
      body += text(x + cw / 2, y + 19, word, { size: r === 3 && !yes ? 10.5 : 11.5, anchor: 'middle', mono: true });
    });
  });
  body += text(8, 222, 'Recorded from CPython 3.15.1 (Unicode 17.0.0). int(c) raises ValueError for the last four.', { size: 11.5, fill: C.soft });
  return svg(230, body, 'Eight numerals and what each check and int() give for them');
}

/** The character's UnicodeData.txt row, split into its 15 fields, with 6, 7 and 8 picked out. */
export function ucdSvg(c: Char): string {
  const f = c.ucd.split(';');
  const { decimal, digit, numeric } = fields(c);
  let body = text(8, 18, `UnicodeData.txt line ${fmt(c.ucdLine)}:`, { size: 12.5, fill: C.soft });
  // Row text, wrapped to two lines when long.
  body += text(8, 40, c.ucd.length > 52 ? c.ucd.slice(0, 52) : c.ucd, { size: 11.5, mono: true });
  if (c.ucd.length > 52) body += text(8, 56, c.ucd.slice(52), { size: 11.5, mono: true });
  const cells: [string, string, string][] = [
    ['6', 'decimal digit value', decimal],
    ['7', 'digit value', digit],
    ['8', 'numeric value', c.unihan ? '' : f[8]!],
  ];
  cells.forEach(([n, name, v], i) => {
    const y = 76 + i * 40;
    body += rect(8, y, 36, 30, C.d, { rx: 4 }) + text(26, y + 20, n, { size: 14, anchor: 'middle', weight: '600' });
    body += text(54, y + 20, `field ${n}, ${name}`, { size: 12.5 });
    body += rect(W - 90, y, 82, 30, v ? C.goodFill : '#fff', { stroke: v ? C.good : C.line, dash: !v, rx: 4 });
    body += text(W - 49, y + 20, v || 'empty', { size: 13, anchor: 'middle', mono: true, fill: v ? C.ink : C.soft });
  });
  let h = 76 + 3 * 40;
  if (c.unihan) {
    body += text(8, h + 16, `Unihan_NumericValues.txt line ${c.unihan.line}: U+4E09 ${c.unihan.tag} ${c.unihan.value}`, { size: 12, mono: true });
    body += text(8, h + 34, `CPython puts the Unihan value in field 8, so isnumeric() sees ${numeric}.`, { size: 12, fill: C.soft });
    h += 40;
  }
  const map = 'isdecimal() and int() read field 6; isdigit() field 7; isnumeric() field 8.';
  body += text(8, h + 18, map, { size: 12, fill: C.soft });
  return svg(h + 28, body, `${c.name}: fields 6, 7 and 8 are ${decimal || 'empty'}, ${digit || 'empty'} and ${numeric || 'empty'}`);
}

/** The three nested sets, drawn as boxes with the recorded counts, the guard's box heavy and the character placed. */
export function nestSvg(c: Char, guard: Predicate): string {
  const p = predicates(c);
  const boxes: [Predicate, number, string][] = [
    ['isnumeric', CPYTHON_COUNTS.isnumeric, C.e],
    ['isdigit', CPYTHON_COUNTS.isdigit, C.a],
    ['isdecimal', CPYTHON_COUNTS.isdecimal, C.c],
  ];
  let body = '';
  boxes.forEach(([k, n, fill], i) => {
    const x = 8 + i * 34,
      y = 8 + i * 40,
      w = W - 16 - i * 68,
      h = 230 - i * 64;
    body += rect(x, y, w, h, fill, { stroke: C.ink, sw: k === guard ? 3 : 1, rx: 8 });
    body += text(x + 10, y + 22, `${call(k)}: ${fmt(n)}`, { size: 13, weight: k === guard ? '700' : '400' });
  });
  body += text(W / 2, 8 + 2 * 40 + 46, `int() accepts these ${fmt(CPYTHON_COUNTS.int)} and no others`, { size: 12, anchor: 'middle', fill: C.soft });
  // Where the character sits: the innermost box it belongs to.
  const depth = p.isdecimal ? 2 : p.isdigit ? 1 : p.isnumeric ? 0 : -1;
  const cy = [210, 160, 112][depth] ?? 250;
  const cx = depth === 2 ? W / 2 : W - 60 - depth * 34;
  body += `<circle cx="${cx}" cy="${cy}" r="18" fill="#fff" stroke="${C.ink}" stroke-width="2"/>` + text(cx, cy + 7, c.char, { size: 18, anchor: 'middle' });
  return svg(250, body, `Nested sets: isnumeric ${CPYTHON_COUNTS.isnumeric}, isdigit ${CPYTHON_COUNTS.isdigit}, isdecimal ${CPYTHON_COUNTS.isdecimal}; ${c.char} in the ${['isnumeric', 'isdigit', 'isdecimal'][depth]} box`);
}

/** How many single characters each check passes that int() rejects. */
export function matchSvg(guard: Predicate): string {
  const max = accepts('isnumeric');
  const b = bars(
    30,
    PREDICATES.map((p) => ({ label: call(p), value: Math.max(accepts(p), max * 0.004), text: fmt(accepts(p)), fill: accepts(p) ? C.badFill : C.goodFill, heavy: p === guard })),
    max,
    { labelW: 104 },
  );
  const body = text(8, 18, 'Single characters a check passes but int() rejects', { size: 12.5, weight: '600' }) + b.body;
  return svg(30 + b.h + 4, body, `Characters each check passes that int() rejects: ${PREDICATES.map((p) => `${p} ${accepts(p)}`).join(', ')}`);
}

// ------------------------------------------------------------------ the steps
export function steps(id: Shown, guard: Predicate): Step[] {
  const c = CHARS[id];
  const r = guarded(c, guard);
  const ascii = asciiFor(c);
  const value = valueOf(c);
  const type = numericType(c);
  const p = predicates(c);
  const out: Step[] = [];
  const intWords = 'value' in r.int ? `returns ${r.int.value}` : 'raises ValueError';

  out.push({
    id: 'guard',
    title: `${call(guard)} checks '${c.char}' before int()`,
    caption: `int() turns text into a whole number, and raises ValueError when it cannot. A common guard checks the text first and calls int() only when the check passes. Here the check is ${call(guard)}, and '${c.char}' (${c.name}) is ${/^[AEIOU]/i.test(KIND[id]) ? 'an' : 'a'} ${KIND[id]} numeral with the value ${value}. ${call(guard)} returns ${r.passes ? 'True, so int() runs' : 'False, so int() is skipped'}. Predict: ${r.passes ? `does int('${c.char}') return a number or raise ValueError?` : `had it run, would int('${c.char}') return a number or raise ValueError?`}`,
    svg: codeSvg(c, guard),
  });

  out.push({
    id: 'int',
    title: `int('${c.char}') ${intWords}`,
    caption: `Before it parses, int() rewrites each non-ASCII character: a character with a decimal digit value becomes that ASCII digit, whitespace becomes a space, and anything else becomes '?', which no number contains. '${c.char}' ${fields(c).decimal ? `has decimal digit value ${fields(c).decimal}, so it becomes '${ascii}' and int() returns ${ascii}` : `has no decimal digit value, so it becomes '?' and int() raises ValueError`}.${r.outcome === 'raised' ? ' The check passed, and the parse still failed.' : r.outcome === 'refused' ? ' The check kept int() from running; it would have failed anyway.' : ''}`,
    svg: rewriteSvg(c),
  });

  const accepted = (k: 0 | 1 | 2) => LINEUP.filter((x) => CPYTHON[x][k]).length;
  out.push({
    id: 'lineup',
    title: `Of eight numerals, int() accepts ${LINEUP.filter((x) => typeof CPYTHON[x][3] === 'number').length}; isdigit() passes ${accepted(1)}`,
    caption: `Four ways to write 3, then superscript two, one half, Roman twelve and Chinese three, each with a Unicode numeric value. Recorded on CPython 3.15.1: isdecimal() passes ${accepted(0)}, the same ${accepted(0)} int() accepts; isdigit() passes ${accepted(1)}, adding ²; isnumeric() passes all ${accepted(2)}. So the answer is ${answer().replace(/^No:/, 'no:')}.`,
    svg: lineupSvg(id),
  });

  const filled = [fields(c).decimal && '6', fields(c).digit && '7', fields(c).numeric && '8'].filter(Boolean);
  out.push({
    id: 'ucd',
    title: c.unihan ? `'${c.char}' gets its value, ${value}, from Unihan, not fields 6 or 7` : `'${c.char}' fills field${filled.length > 1 ? 's' : ''} ${filled.join(', ').replace(/, (\d)$/, ' and $1')}${fields(c).decimal ? '' : '; field 6 is empty'}`,
    caption: `UnicodeData.txt keeps three numeric fields: decimal digit value (6), digit value (7) and numeric value (8). CPython builds its tables from them: int() and isdecimal() use field 6, isdigit() field 7, isnumeric() field 8. ${c.unihan ? `'${c.char}' falls in the ideograph range 4E00 to 9FFF, whose row leaves all three empty; Unihan gives it kPrimaryNumeric ${c.unihan.value}, which CPython copies into field 8.` : `'${c.char}' fills field${filled.length > 1 ? 's' : ''} ${filled.join(', ').replace(/, (\d)$/, ' and $1')}.`} Its Unicode numeric type is ${type}${p.isdigit !== /^[0-9]$/.test(ascii) ? ', so isdigit() and int() disagree on it' : ''}.`,
    svg: ucdSvg(c),
  });

  const where = p.isdecimal ? 'in the innermost box' : p.isdigit ? 'in the isdigit() box but outside the innermost' : 'in the outer box only';
  out.push({
    id: 'outcome',
    title: r.outcome === 'parsed' ? `${call(guard)} and int() agree on '${c.char}'` : r.outcome === 'raised' ? `${call(guard)} let '${c.char}' through to a ValueError` : `${call(guard)} turned '${c.char}' away, as int() would`,
    caption: `Scanning every code point on CPython 3.15.1 finds ${fmt(CPYTHON_COUNTS.isdecimal)} characters that pass isdecimal(), ${fmt(CPYTHON_COUNTS.isdigit)} that pass isdigit() and ${fmt(CPYTHON_COUNTS.isnumeric)} that pass isnumeric(). Each decimal also has a digit value and each digit a numeric value, so the sets nest, and the innermost holds every single character int() accepts. '${c.char}' is ${where}. ${r.outcome === 'parsed' ? `The check passes and int() returns ${ascii}.` : r.outcome === 'raised' ? `The check passes and int() raises ValueError.` : `The check fails, so int() never runs.`}`,
    svg: nestSvg(c, guard),
  });

  out.push({
    id: 'match',
    title: 'For one character, only isdecimal() matches int()',
    caption: `isdecimal() passes ${accepts('isdecimal')} characters that int() rejects, isdigit() ${fmt(accepts('isdigit'))} and isnumeric() ${fmt(accepts('isnumeric'))}. For a whole string, int() also accepts surrounding spaces, a sign and underscores between digits, so no character check matches it; to know whether int() can parse a string, call int() and catch ValueError.`,
    svg: matchSvg(guard),
  });
  return out;
}

export const CHECKS = [questions[1](), questions[2]()].map((q) => ({ q: q.question, a: q.answer }));
