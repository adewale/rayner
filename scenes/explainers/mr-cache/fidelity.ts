import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Trace } from '../../../explain/testing.ts';
import { Scene, Code, parseUnifiedDiff } from '../../../src/index.ts';
import type { VMobject, Sink } from '../../../src/index.ts';
import { assertStepState } from '../../../test/lib/explainer-state.ts';
import type { FidelityRun } from '../../../test/lib/fidelity.ts';
import * as mrCache from './code.ts';

/** Each authored scenario's steps against the program the explainer explains. */
export async function check(trace: Trace, values: Record<string, string>, { scenario, walks }: FidelityRun): Promise<void> {
  assertStepState(trace, 'request', {
    request: values.request,
    reads: values.request === 'hit' ? 0 : 1,
  });
  assert.equal(walks.filter((w) => w.step === 'request').length, values.request === 'hit' ? 3 : 4);
  await mrCacheDiff(trace, scenario.Scene);
}

/**
 * mr-cache's diff step: its TransformDiff animates the hunks the real git CLI prints for the
 * two code texts, its line counts are git's, and every line git leaves alone ends exactly
 * on its line of the after block.
 */
async function mrCacheDiff(trace: { steps: { step: string; meta: Record<string,unknown>; evidence?: { kind: string }[] }[] }, Bound: new (sink: Sink) => Scene) {
  const { BEFORE_CODE, AFTER_CODE, BEFORE_SPANS, AFTER_SPANS } = mrCache;
  // The syntax colours lie inside their lines.
  for (const [code, spans] of [
    [BEFORE_CODE, BEFORE_SPANS],
    [AFTER_CODE, AFTER_SPANS],
  ] as const)
    for (const sp of spans) assert.ok(sp.from >= 0 && sp.from < sp.to && sp.to <= code[sp.line]!.length, JSON.stringify(sp));
  const git = gitHunks(BEFORE_CODE, AFTER_CODE);
  const recorded = trace.steps
    .find((s) => s.step === 'diff')!
    .evidence!.find((e) => e.kind === 'diff')! as unknown as {
    hunks: unknown;
    lines: { unchanged: number; changed: number; removed: number; added: number };
  };
  assert.deepEqual(recorded.hunks, git);
  const count = (op: string) => git.reduce((n, h) => n + h.ops.filter((o) => o === op).length, 0);
  assert.equal(recorded.lines.changed + recorded.lines.removed, count('-'));
  assert.equal(recorded.lines.changed + recorded.lines.added, count('+'));
  assert.equal(recorded.lines.unchanged, BEFORE_CODE.length - count('-'));
  // The diff step’s title counts the lines as its callouts do; the page title asks the reader’s question.
  const word = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
  const counted = `${word[recorded.lines.added]} added lines and ${word[recorded.lines.changed]} rewritten`;
  const title = String(trace.steps.find(s=>s.step==='diff')!.meta.title);
  assert.ok(title.toLowerCase().startsWith(counted), `${title} / ${counted}`);
  // Together they are git's insertions.
  assert.equal(recorded.lines.added + recorded.lines.changed, count('+'));

  // Watch the diff step: the last frame before the after block takes over is the transform's end.
  const points = (c: Code) => c.lines.map((l) => l.children.map((g) => (g as VMobject).subpaths.map((a) => a.slice())));
  let prev: { code: Code; lines: Float32Array[][][] } | null = null,
    handoff: { from: Float32Array[][][]; to: Code } | null = null;
  const sink: Sink = {
    async frame(scene: Scene) {
      if (scene.currentStep?.name !== 'diff' || handoff) return;
      const code = scene.mobjects.find((m): m is Code => m instanceof Code);
      if (!code) return;
      if (prev && code !== prev.code) handoff = { from: prev.lines, to: code };
      else prev = { code, lines: points(code) };
    },
  };
  await new Bound(sink).run();
  assert.ok(handoff, 'the after block took over from the before block');
  const { from, to } = handoff as { from: Float32Array[][][]; to: Code };
  let i = 0,
    j = 0,
    checked = 0;
  const same = (n: number) => {
    for (; n > 0; n--, i++, j++, checked++) {
      assert.equal(BEFORE_CODE[i], AFTER_CODE[j]);
      assert.deepEqual(from[i], points(to)[j], `unchanged line ${i + 1} -> ${j + 1} ends where the after block shows it`);
    }
  };
  for (const h of git) {
    same((h.oldLines ? h.oldStart - 1 : h.oldStart) - i);
    i += h.oldLines;
    j += h.newLines;
  }
  same(BEFORE_CODE.length - i);
  assert.equal(checked, recorded.lines.unchanged);
}

/** `git diff --no-index --unified=0 --diff-algorithm=myers` of two texts, parsed into hunks. */
function gitHunks(before: readonly string[], after: readonly string[]) {
  const dir = mkdtempSync(join(tmpdir(), 'mr-cache-explainer-oracle-'));
  let out: string;
  try {
    writeFileSync(join(dir, 'before.js'), before.join('\n') + '\n');
    writeFileSync(join(dir, 'after.js'), after.join('\n') + '\n');
    const args = ['diff', '--no-index', '--no-color', '--no-ext-diff', '--diff-algorithm=myers', '--unified=0'];
    try {
      out = execFileSync('git', [...args, 'before.js', 'after.js'], { cwd: dir, encoding: 'utf8' });
    } catch (e) {
      // Exit status 1 is "the files differ"; the diff is on stdout either way
      const r = e as { status?: number; stdout?: string };
      if (r.status !== 1 || r.stdout == null) throw e;
      out = r.stdout;
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const hunks = parseUnifiedDiff(out);
  assert.ok(hunks.length > 0);
  return hunks;
}
