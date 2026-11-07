// Line and token diffs: the evidence a diff-driven transform animates.
//
// Hunks have unified diff's shape and numbering, so a hunk computed here and
// one parsed from `git diff` compare field by field. Small and deterministic:
// a longest-common-subsequence table after trimming the common head and tail
// (as git's xdiff does), deletions before insertions within a change. On an
// edit with one minimal diff (no repeated lines to choose between) it is the
// diff git prints; where several are minimal, git may place a hunk elsewhere,
// which is why an author can hand TransformDiff git's own hunks instead.

/** A line (or token) in both texts, only in the old one, or only in the new one. */
export type DiffOp = '=' | '-' | '+';

/**
 * One hunk, numbered as unified diff numbers it: 1-based starts, and for a
 * side with no lines, the line before the hunk (0 at the top). `ops` and
 * `lines` run in parallel, one entry per line of the hunk: '=' a context line,
 * '-' a line only in the old text, '+' only in the new, with its text.
 * diffLines() writes no context (like `git diff --unified=0`), each hunk's
 * '-' lines before its '+' lines.
 */
export interface Hunk { oldStart: number; oldLines: number; newStart: number; newLines: number; ops: DiffOp[]; lines: string[] }

/** A hunk's header as unified diff writes it: `@@ -2 +2,5 @@` (a count of 1 is left out). */
export function hunkHeader(h: Pick<Hunk, 'oldStart' | 'oldLines' | 'newStart' | 'newLines'>): string {
  const side = (start: number, n: number) => (n === 1 ? `${start}` : `${start},${n}`);
  return `@@ -${side(h.oldStart, h.oldLines)} +${side(h.newStart, h.newLines)} @@`;
}

/** A token of one line: its text and its range [from, to) in JS string indices. */
export interface Token { text: string; from: number; to: number }

/**
 * One step of a token diff: a token in both lines ('='), only in `a` ('-') or
 * only in `b` ('+'). `a` and `b` are its ranges in each line; the side a token
 * is missing from gets the empty range where it would be.
 */
export interface TokenOp { op: DiffOp; text: string; a: [number, number]; b: [number, number] }

/** The ops turning `a` into `b` through a longest common subsequence; each change run lists its '-' before its '+'. */
function lcsOps<T>(a: readonly T[], b: readonly T[]): DiffOp[] {
  let head = 0, tail = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  const n = a.length - head - tail, m = b.length - head - tail, w = m + 1;
  // L[i * w + j]: length of the LCS of a[head + i..] and b[head + j..] (the trimmed middles)
  const L = new Int32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      L[i * w + j] = a[head + i] === b[head + j] ? L[(i + 1) * w + j + 1]! + 1 : Math.max(L[(i + 1) * w + j]!, L[i * w + j + 1]!);
    }
  }
  const ops: DiffOp[] = new Array<DiffOp>(head).fill('=');
  let del: DiffOp[] = [], ins: DiffOp[] = [];
  const flush = () => { ops.push(...del, ...ins); del = []; ins = []; };
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[head + i] === b[head + j]) { flush(); ops.push('='); i++; j++; }
    else if (j >= m || (i < n && L[(i + 1) * w + j]! >= L[i * w + j + 1]!)) { del.push('-'); i++; }
    else { ins.push('+'); j++; }
  }
  flush();
  for (let k = 0; k < tail; k++) ops.push('=');
  return ops;
}

/** The hunks of a line diff from `before` to `after`, with no context lines. */
export function diffLines(before: readonly string[], after: readonly string[]): Hunk[] {
  const ops = lcsOps(before, after), hunks: Hunk[] = [];
  let i = 0, j = 0, k = 0;
  while (k < ops.length) {
    if (ops[k] === '=') { i++; j++; k++; continue; }
    const h: Hunk = { oldStart: i, oldLines: 0, newStart: j, newLines: 0, ops: [], lines: [] };
    for (; k < ops.length && ops[k] !== '='; k++) {
      h.ops.push(ops[k]!);
      if (ops[k] === '-') { h.lines.push(before[i++]!); h.oldLines++; } else { h.lines.push(after[j++]!); h.newLines++; }
    }
    // 1-based starts; an empty side keeps the line before the hunk
    if (h.oldLines) h.oldStart++;
    if (h.newLines) h.newStart++;
    hunks.push(h);
  }
  return hunks;
}

// Identifiers, numbers, strings (unterminated to the end of the line), whitespace, any other single character
const TOKEN = /[\p{L}_$][\p{L}\p{N}_$]*|\p{N}[\p{L}\p{N}_.]*|"(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?|`(?:[^`\\]|\\.)*`?|\s+|./gsu;

/** A line as tokens: identifiers and numbers, strings, runs of whitespace, single punctuation characters. */
export function tokenize(line: string): Token[] {
  return Array.from(line.matchAll(TOKEN), (m) => ({ text: m[0], from: m.index, to: m.index + m[0].length }));
}

/** A token-level diff of two lines: the tokens they share, in order, and the ones only one has. */
export function diffTokens(a: string, b: string): TokenOp[] {
  const ta = tokenize(a), tb = tokenize(b), out: TokenOp[] = [];
  let i = 0, j = 0;
  for (const op of lcsOps(ta.map((t) => t.text), tb.map((t) => t.text))) {
    // Where the next token of each line starts: an empty range there for the side that lacks it
    const pa = ta[i]?.from ?? a.length, pb = tb[j]?.from ?? b.length;
    if (op === '=') { const x = ta[i++]!, y = tb[j++]!; out.push({ op, text: x.text, a: [x.from, x.to], b: [y.from, y.to] }); }
    else if (op === '-') { const x = ta[i++]!; out.push({ op, text: x.text, a: [x.from, x.to], b: [pb, pb] }); }
    else { const y = tb[j++]!; out.push({ op, text: y.text, a: [pa, pa], b: [y.from, y.to] }); }
  }
  return out;
}

/**
 * The hunks of a unified diff of one file, as `git diff` prints it (any
 * context size). Headers before the first hunk are skipped; a second file
 * throws. "\ No newline at end of file" markers are ignored.
 */
export function parseUnifiedDiff(text: string): Hunk[] {
  const hunks: Hunk[] = [];
  let h: Hunk | null = null, left = 0, right = 0;
  // A final newline ends the last line; it does not start a blank one
  for (const raw of (text.endsWith('\n') ? text.slice(0, -1) : text).split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    const at = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (at) {
      if (left || right) throw new Error(`parseUnifiedDiff(): a hunk ended early, before ${JSON.stringify(line)}`);
      h = { oldStart: +at[1]!, oldLines: at[2] == null ? 1 : +at[2], newStart: +at[3]!, newLines: at[4] == null ? 1 : +at[4], ops: [], lines: [] };
      hunks.push(h); left = h.oldLines; right = h.newLines;
      continue;
    }
    if (!h || line.startsWith('\\')) continue;
    if (!left && !right) {
      if (/^(diff |--- |\+\+\+ )/.test(line)) throw new Error('parseUnifiedDiff(): the diff has a second file header; give it one file\'s diff');
      continue;
    }
    const mark = line[0] ?? ' ', body = line.slice(1);
    // A blank line inside a hunk is a context line whose trailing space was stripped
    if (mark === ' ' || line === '') { h.ops.push('='); h.lines.push(body); left--; right--; }
    else if (mark === '-') { h.ops.push('-'); h.lines.push(body); left--; }
    else if (mark === '+') { h.ops.push('+'); h.lines.push(body); right--; }
    else throw new Error(`parseUnifiedDiff(): a hunk has a line that is not context, an addition or a removal: ${JSON.stringify(line)}`);
    if (left < 0 || right < 0) throw new Error(`parseUnifiedDiff(): the hunk ${hunkHeader(h)} has more lines than its header says`);
  }
  if (left || right) throw new Error('parseUnifiedDiff(): the last hunk is shorter than its header says');
  return hunks;
}
