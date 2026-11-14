// The unified-diff explainer's model: where `git apply` puts each hunk of a unified diff, and what
// the file is afterwards. A hunk is placed where its old side, the context lines and the removed
// lines together, matches the file line for line; the search starts at the line its header names
// and moves outward one line at a time, down first, then up.
// It follows Git 2.43's apply.c (find_pos and apply_one_fragment) for a patch to one text file,
// with Git's defaults. Its limits: every old-side line must match exactly (no -C, no fuzz, no
// --ignore-whitespace, no --3way, no --reject, no -R); no "\ No newline at end of file" marker,
// binary patch, rename, mode change or file creation; hunks are taken in order. `git apply` writes
// nothing unless every hunk fits, so a refused patch leaves the file as it was. Other tools place
// hunks differently: patch(1) accepts a hunk with some of its context missing.

/** A hunk of a unified diff, numbered as its header numbers it: what parseUnifiedDiff returns. */
export interface Hunk {
  oldStart: number; oldLines: number; newStart: number; newLines: number;
  /** One per line of the hunk: '=' a context line, '-' a removed line, '+' an added line. */
  ops: ('=' | '-' | '+')[];
  lines: string[];
}

/** The lines a hunk expects to find: its context and removed lines, in order. */
export const oldSide = (h: Hunk): string[] => h.lines.filter((_, i) => h.ops[i] !== '+');
/** The lines a hunk leaves: its context and added lines, in order. */
export const newSide = (h: Hunk): string[] => h.lines.filter((_, i) => h.ops[i] !== '-');
/** A hunk's header as a unified diff writes it. A count of 1 is left out. */
export function header(h: Hunk): string {
  const side = (start: number, n: number) => (n === 1 ? `${start}` : `${start},${n}`);
  return `@@ -${side(h.oldStart, h.oldLines)} +${side(h.newStart, h.newLines)} @@`;
}

/** Whether the hunk's old side is the file's lines from line `at` (1-based) on. */
export function fits(file: readonly string[], h: Hunk, at: number): boolean {
  const old = oldSide(h);
  if (at < 1 || at - 1 + old.length > file.length) return false;
  return old.every((line, i) => file[at - 1 + i] === line);
}

/** The lines a hunk was compared with the file at, in order, and where it was found: 1-based lines, `at` null when nowhere. */
export interface Search { tried: number[]; at: number | null }

/**
 * Look for the hunk in the file, starting at line `start`: there first, then one line further down,
 * one further up, two down, two up, and so on to both ends of the file. A hunk that starts at line 1
 * is tried only at the top, and one with no context after its last change only at the bottom.
 */
export function search(file: readonly string[], h: Hunk, start: number): Search {
  const old = oldSide(h), trailing = h.ops.length - 1 - h.ops.findLastIndex((op) => op !== '=');
  const atTop = h.oldStart <= 1, atBottom = trailing === 0;
  // Git counts lines from 0 and lets a search start anywhere up to the end of the file.
  let line = atTop ? 0 : atBottom ? file.length - old.length : start - 1;
  if (line < 0 || line > file.length) line = file.length;
  // Git visits every line in this order, but compares the hunk with the file only where it could go:
  // inside the file, and at the top or the bottom when the hunk must be there. Those are the lines tried.
  const possible = (at: number) => at + old.length <= file.length && (!atTop || at === 0) && (!atBottom || at + old.length === file.length);
  const tried: number[] = [];
  let current = line, back = line, forth = line;
  for (let i = 0; ; i++) {
    if (possible(current)) {
      tried.push(current + 1);
      if (fits(file, h, current + 1)) return { tried, at: current + 1 };
    }
    for (;;) {
      if (back === 0 && forth === file.length) return { tried, at: null };
      if (i & 1) {
        if (back === 0) { i++; continue; }
        current = --back;
      } else {
        if (forth === file.length) { i++; continue; }
        current = ++forth;
      }
      break;
    }
  }
}

/** Where one hunk went: the line it was found at, and how far that is from the line it was looked for first. */
export interface Placement { at: number; offset: number; tried: number[] }
/** What applying a patch gives: the new file and each hunk's place, or the hunk that fits nowhere. */
export type Applied =
  | { ok: true; file: string[]; placements: Placement[] }
  | { ok: false; failed: number; line: number; tried: number[] };

/**
 * Apply every hunk in order. Each is looked for from its new-side start, since the hunks before it
 * have already changed the file. If one fits nowhere, nothing is applied.
 */
export function apply(file: readonly string[], hunks: readonly Hunk[]): Applied {
  let now = [...file];
  const placements: Placement[] = [];
  for (const [i, h] of hunks.entries()) {
    const start = h.newStart || 1, found = search(now, h, start);
    // Git names the hunk's old-side line when it gives up.
    if (found.at === null) return { ok: false, failed: i, line: h.oldStart, tried: found.tried };
    now = [...now.slice(0, found.at - 1), ...newSide(h), ...now.slice(found.at - 1 + oldSide(h).length)];
    placements.push({ at: found.at, offset: found.at - start, tried: found.tried });
  }
  return { ok: true, file: now, placements };
}

/** What `git apply -v` says on standard error, after its "Checking patch" line. */
export function report(result: Applied, name: string, searched: readonly string[] = []): string[] {
  if (!result.ok) return ['error: while searching for:', ...searched, '', `error: patch failed: ${name}:${result.line}`, `error: ${name}: patch does not apply`];
  const moved = result.placements.flatMap((p, i) => (p.offset ? [`Hunk #${i + 1} succeeded at ${p.at} (offset ${p.offset} line${Math.abs(p.offset) === 1 ? '' : 's'}).`] : []));
  return [...moved, `Applied patch ${name} cleanly.`];
}

/** The section a line (from 1) of an ini file belongs to: the nearest line at or above it that opens one, such as "[web]". */
export const sectionAt = (file: readonly string[], line: number): string => file.slice(0, line).findLast((l) => l.startsWith('[')) ?? '';

/** A hunk with its header moved to where it was applied, so its numbers describe that file. */
export const placed = (h: Hunk, p: Placement): Hunk => ({ ...h, oldStart: p.at, newStart: p.at });

// ---- the page's files ----

/** The file as the patch's author had it, and after the author's change. */
export const BEFORE = ['[web]', 'port = 8080', 'workers = 2', 'timeout = 30', '[admin]', 'port = 9000'];
export const AFTER = ['[web]', 'port = 8080', 'workers = 4', 'backlog = 64', 'timeout = 30', '[admin]', 'port = 9000'];
export const NAME = 'app.ini';
/** The author's change as a unified diff with one line of context: what `git diff -U1` writes (model.test.ts runs it). */
export const PATCH = ['--- a/app.ini', '+++ b/app.ini', '@@ -2,3 +2,4 @@', ' port = 8080', '-workers = 2', '+workers = 4', '+backlog = 64', ' timeout = 30', ''].join('\n');
/** That patch's one hunk, as parseUnifiedDiff reads it: one line of context each side of the change. */
export const HUNK: Hunk = { oldStart: 2, oldLines: 3, newStart: 2, newLines: 4, ops: ['=', '-', '+', '+', '='], lines: ['port = 8080', 'workers = 2', 'workers = 4', 'backlog = 64', 'timeout = 30'] };
/** The same change with the default three lines of context: one hunk that starts at line 1. */
export const WIDE: Hunk = {
  oldStart: 1, oldLines: 6, newStart: 1, newLines: 7,
  ops: ['=', '=', '-', '+', '+', '=', '=', '='],
  lines: ['[web]', 'port = 8080', 'workers = 2', 'workers = 4', 'backlog = 64', 'timeout = 30', '[admin]', 'port = 9000'],
};
/** The reader's copy, by scenario: two lines added at the top, or the port changed. */
export const COPIES = {
  moved: ['; settings', 'name = demo', ...BEFORE],
  edited: ['[web]', 'port = 8081', ...BEFORE.slice(2)],
} as const satisfies Record<string, readonly string[]>;
export type CopyId = keyof typeof COPIES;
/** A copy where another section comes first and holds the same three lines. */
export const LOOKALIKE = ['[admin]', 'port = 8080', 'workers = 2', 'timeout = 30', '[web]', 'port = 8080', 'workers = 2', 'timeout = 30'];

/** A step's model: the file shown, the hunk's header, and how far applying the patch to that file has got. */
export interface PatchState {
  file: string[];
  header: string;
  /** The lines tried so far, in order, and where the hunk was found (null: nowhere, absent: not looked for yet). */
  tried?: number[];
  at?: number | null;
  offset?: number;
  /** Whether the patch was applied, what Git reports, and the file afterwards. */
  applied?: boolean;
  report?: string[];
  result?: string[];
  /** The section the hunk landed in and the one its author changed, when the step compares them. */
  landed?: string;
  meant?: string;
}
