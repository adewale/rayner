import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fc, params } from '../lib/pbt.ts';
import { skipOracle } from '../lib/oracle.ts';
import { parseUnifiedDiff } from '../../../src/index.ts';
import { AFTER, BEFORE, COPIES, HUNK, LOOKALIKE, NAME, PATCH, WIDE, apply, fits, header, newSide, oldSide, placed, report, search, sectionAt } from './model.ts';
import type { Applied, Hunk } from './model.ts';
import { ABOVE, REFUSED, TOP } from './answers.ts';

// ---- Git, run now ----
const version = spawnSync('git', ['--version'], { encoding: 'utf8' });
const missing = version.status !== 0 && 'no git on PATH';
const env = { ...process.env, LC_ALL: 'C', LANGUAGE: 'C', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' };
let scratch: string | undefined;
/** A fresh folder outside any repository, so `git apply` and `git diff --no-index` see only the files given. */
const folder = (): string => {
  scratch ??= mkdtempSync(join(tmpdir(), 'unified-diff-'));
  const dir = mkdtempSync(join(scratch, 'case-'));
  mkdirSync(join(dir, 'a'));
  mkdirSync(join(dir, 'b'));
  return dir;
};
const text = (lines: readonly string[]) => lines.map((l) => l + '\n').join('');
/** The unified diff Git writes from `before` to `after` with `context` lines of context, from its first `---` line. */
function gitDiff(before: readonly string[], after: readonly string[], context: number): string {
  const dir = folder();
  writeFileSync(join(dir, 'a', NAME), text(before));
  writeFileSync(join(dir, 'b', NAME), text(after));
  const r = spawnSync('git', ['diff', '--no-index', '--no-color', '--no-prefix', `-U${context}`, `a/${NAME}`, `b/${NAME}`], { cwd: dir, encoding: 'utf8', env: { ...env, GIT_CEILING_DIRECTORIES: dir } });
  assert.ok(r.status === 0 || r.status === 1, r.stderr);
  const at = r.stdout.indexOf('--- ');
  return at < 0 ? '' : r.stdout.slice(at);
}
/** What `git apply -v` does with `patch` on a file holding `file`: its exit status, what it says, and the file afterwards. */
function gitApply(file: readonly string[], patch: string, flags: string[] = ['-v']) {
  const dir = folder();
  writeFileSync(join(dir, NAME), text(file));
  writeFileSync(join(dir, 'change.patch'), patch);
  const r = spawnSync('git', ['apply', ...flags, 'change.patch'], { cwd: dir, encoding: 'utf8', env: { ...env, GIT_CEILING_DIRECTORIES: dir } });
  const said = r.stderr.split('\n').filter((l, i, all) => !(i === all.length - 1 && l === '') && !l.startsWith('Checking patch'));
  return { status: r.status, said, file: readFileSync(join(dir, NAME), 'utf8').split('\n').slice(0, -1) };
}
/** Hold the model's result for `file` and `patch` to Git's: applied or refused, what Git says, and every line of the file. */
function same(file: readonly string[], patch: string, label: string): Applied {
  const hunks = parseUnifiedDiff(patch), ours = apply(file, hunks), git = gitApply(file, patch);
  assert.equal(ours.ok, git.status === 0, `${label}: applied`);
  assert.deepEqual(ours.ok ? ours.file : [...file], git.file, `${label}: the file afterwards`);
  const searched = ours.ok ? [] : oldSide(hunks[ours.failed]!);
  // Git builds differ on "line" or "lines" after a negative offset; the place and the offset are what is held.
  const plural = (said: string[]) => said.map((l) => l.replace(/ lines?\)\.$/, ' lines).'));
  assert.deepEqual(plural(report(ours, NAME, searched)), plural(git.said), `${label}: what git apply -v says`);
  return ours;
}
test.after(() => { if (scratch) rmSync(scratch, { recursive: true, force: true }); });

test('the page’s patch is the unified diff Git writes with one line of context, and the wide one with three', (t) => {
  if (skipOracle(t, missing)) return;
  assert.equal(gitDiff(BEFORE, AFTER, 1), PATCH);
  assert.deepEqual(parseUnifiedDiff(PATCH), [HUNK]);
  assert.equal(header(HUNK), '@@ -2,3 +2,4 @@');
  // The same change with the default three lines of context: one hunk from line 1, six lines to seven.
  assert.deepEqual(parseUnifiedDiff(gitDiff(BEFORE, AFTER, 3)), [WIDE]);
});

test('the page’s files: Git applies the patch at its line, two lines down, not at all, and in the wrong section, as the model says', (t) => {
  if (skipOracle(t, missing)) return;
  const [hunk] = parseUnifiedDiff(PATCH) as [Hunk];
  // The author's file: at line 2, no offset, and the result is the author's new file.
  const made = same(BEFORE, PATCH, 'the author’s file');
  assert.deepEqual(made, { ok: true, file: AFTER, placements: [{ at: 2, offset: 0, tried: [2] }] });
  // Two lines added at the top: found at line 4 after trying 2, 3 and 1.
  const moved = same(COPIES.moved, PATCH, 'moved');
  assert.deepEqual(moved.ok && moved.placements, [{ at: 4, offset: 2, tried: [2, 3, 1, 4] }]);
  assert.deepEqual(report(moved, NAME), ['Hunk #1 succeeded at 4 (offset 2 lines).', 'Applied patch app.ini cleanly.']);
  // The port changed: refused, and Git names the hunk's own line.
  const edited = same(COPIES.edited, PATCH, 'edited');
  assert.equal(edited.ok, false);
  assert.deepEqual(report(edited, NAME, oldSide(hunk)).slice(-2), ['error: patch failed: app.ini:2', 'error: app.ini: patch does not apply']);
  // The lookalike: applied without a word, at line 2, which is now the other section.
  const wrong = same(LOOKALIKE, PATCH, 'lookalike');
  assert.deepEqual(wrong.ok && wrong.placements, [{ at: 2, offset: 0, tried: [2] }]);
  assert.deepEqual(wrong.ok && wrong.file.slice(0, 5), ['[admin]', 'port = 8080', 'workers = 4', 'backlog = 64', 'timeout = 30']);
  assert.deepEqual(report(wrong, NAME), ['Applied patch app.ini cleanly.']);
  // The author changed [web]; in the lookalike, line 2 belongs to [admin].
  assert.deepEqual([sectionAt(BEFORE, 2), sectionAt(LOOKALIKE, 2)], ['[web]', '[admin]']);
  // Without -v a patch that applied says nothing, at an offset or not.
  for (const file of [BEFORE, COPIES.moved, LOOKALIKE]) assert.equal(gitApply(file, PATCH, []).said.join(''), '');
  // With three lines of context the same change is refused there, and refused on the moved copy too.
  const wide = gitDiff(BEFORE, AFTER, 3);
  assert.equal(same(LOOKALIKE, wide, 'lookalike, three lines of context').ok, false);
  assert.equal(same(COPIES.moved, wide, 'moved, three lines of context').ok, false);
});

// Short lines from a small alphabet, so that a hunk's lines often occur in more than one place.
const line = fc.constantFrom('a = 1', 'b = 2', 'c = 3', '[s]', '[t]', 'd = 4');
const lines = fc.array(line, { minLength: 3, maxLength: 12 });
/** A file, a changed version of it, and a copy that has drifted: lines added, dropped or rewritten here and there. */
const drift = fc.array(fc.tuple(fc.nat(20), fc.constantFrom('add', 'drop', 'edit'), fc.constantFrom('x = 9', 'a = 1', '[s]')), { maxLength: 4 });
const change = (file: string[], edits: [number, string, string][]) => {
  const out = [...file];
  for (const [at, kind, value] of edits) {
    const i = at % (out.length + 1);
    if (kind === 'add') out.splice(i, 0, value);
    else if (out.length > 2 && i < out.length) kind === 'drop' ? out.splice(i, 1) : out.splice(i, 1, value);
  }
  return out;
};

test('on drifted copies of random files, the model places every hunk where git apply places it, or refuses with it', (t) => {
  if (skipOracle(t, missing)) return;
  let applied = 0, refused = 0, offset = 0;
  fc.assert(fc.property(lines, drift.filter((d) => d.length > 0), drift, fc.integer({ min: 1, max: 3 }), (before, edits, later, context) => {
    const after = change(before, edits), patch = gitDiff(before, after, context);
    fc.pre(patch !== '');
    const result = same(change(before, later), patch, JSON.stringify({ before, after, later, context }));
    if (result.ok) { applied++; if (result.placements.some((p) => p.offset)) offset++; } else refused++;
  }), params(120));
  // The property saw all three outcomes: applied in place, applied at an offset, and refused.
  assert.ok(applied > 10 && refused > 10 && offset > 3, `applied ${applied}, at an offset ${offset}, refused ${refused}`);
});

test('a patch applies to the file it was made from, at its own lines, and gives the changed file', (t) => {
  if (skipOracle(t, missing)) return;
  fc.assert(fc.property(lines, drift.filter((d) => d.length > 0), fc.integer({ min: 1, max: 3 }), (before, edits, context) => {
    const after = change(before, edits), patch = gitDiff(before, after, context);
    fc.pre(patch !== '');
    const result = apply(before, parseUnifiedDiff(patch));
    assert.ok(result.ok);
    assert.deepEqual(result.file, after);
    assert.ok(result.placements.every((p) => p.offset === 0));
  }), params(60));
});

const hunkArb = fc.tuple(fc.array(line, { minLength: 1, maxLength: 3 }), fc.array(line, { minLength: 1, maxLength: 2 }), fc.array(line, { maxLength: 2 }), fc.array(line, { minLength: 1, maxLength: 3 }), fc.integer({ min: 2, max: 9 }))
  .map(([lead, gone, added, trail, start]): Hunk => ({
    oldStart: start, oldLines: lead.length + gone.length + trail.length, newStart: start, newLines: lead.length + added.length + trail.length,
    ops: [...lead.map(() => '=' as const), ...gone.map(() => '-' as const), ...added.map(() => '+' as const), ...trail.map(() => '=' as const)],
    lines: [...lead, ...gone, ...added, ...trail],
  }));

test('a hunk goes where its context and removed lines match the file, and the nearest such place to its line wins', () => {
  fc.assert(fc.property(lines, hunkArb, (file, h) => {
    const found = search(file, h, h.newStart), places = file.map((_, i) => i + 1).filter((at) => fits(file, h, at));
    // Found exactly when the old side occurs somewhere, and then at an occurrence no other is nearer than.
    assert.equal(found.at !== null, places.length > 0);
    if (found.at === null) return;
    assert.ok(fits(file, h, found.at));
    const start = Math.min(h.newStart, file.length + 1), near = Math.min(...places.map((at) => Math.abs(at - start)));
    assert.equal(Math.abs(found.at - start), near);
    // Of two places equally near, the one further down is tried first.
    assert.equal(found.at, places.filter((at) => Math.abs(at - start) === near).at(-1));
    // Each line is tried once, the line named first when the hunk could go there, and only where it fits inside the file.
    assert.equal(new Set(found.tried).size, found.tried.length);
    if (start - 1 + oldSide(h).length <= file.length) assert.equal(found.tried[0], start);
    assert.ok(found.tried.every((at) => at >= 1 && at - 1 + oldSide(h).length <= file.length));
    assert.equal(found.tried.at(-1), found.at);
    // Applying replaces the old side with the new side there and touches nothing else.
    const result = apply(file, [h]);
    assert.ok(result.ok);
    assert.deepEqual(result.file, [...file.slice(0, found.at - 1), ...newSide(h), ...file.slice(found.at - 1 + oldSide(h).length)]);
    // The placed hunk's header names where it went.
    assert.equal(header(placed(h, result.placements[0]!)), header({ ...h, oldStart: found.at, newStart: found.at }));
  }), params(500));
});

test('a refused patch changes nothing: when one hunk fits and a later one does not, Git leaves the file as it was', (t) => {
  if (skipOracle(t, missing)) return;
  // A longer file, changed near its top and near its bottom: two hunks with one line of context.
  const before = ['[web]', 'port = 8080', 'workers = 2', 'timeout = 30', '[admin]', 'port = 9000', 'workers = 1', 'timeout = 60', '[log]', 'level = info'];
  const after = before.map((l) => (l === 'workers = 2' ? 'workers = 4' : l === 'level = info' ? 'level = debug' : l));
  const patch = gitDiff(before, after, 1);
  assert.equal(parseUnifiedDiff(patch).length, 2);
  // In this copy the second hunk's removed line has changed: the first hunk fits, the second does not.
  const copy = before.map((l) => (l === 'level = info' ? 'level = warn' : l));
  const result = same(copy, patch, 'two hunks, the second refused');
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.failed, 1);
  // Git wrote nothing, though the first hunk fits on its own.
  assert.deepEqual(gitApply(copy, patch).file, copy);
  assert.equal(apply(copy, parseUnifiedDiff(patch).slice(0, 1)).ok, true);
});

test('the check answers’ cases: three lines added above, the refusal’s search, and a hunk that starts at line 1', () => {
  assert.deepEqual([ABOVE.at, ABOVE.offset, ABOVE.tried], [5, 3, [2, 3, 1, 4, 5]]);
  // The refused copy still holds the removed line; no three lines in a row match, wherever the hunk could go.
  assert.ok(COPIES.edited.includes('workers = 2'));
  assert.deepEqual(REFUSED.places, [2, 3, 1, 4]);
  assert.equal(REFUSED.line, 2);
  // The wide hunk starts at line 1, so it is tried at the top only.
  assert.equal(header(WIDE), '@@ -1,6 +1,7 @@');
  assert.deepEqual(TOP, { ok: false, failed: 0, line: 1, tried: [1] });
});
