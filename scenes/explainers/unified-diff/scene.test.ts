import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadProject } from '../../../explain/testing.ts';
import { Code } from '../../../src/index.ts';
import type { Mobject, Scene } from '../../../src/index.ts';
import UnifiedDiff from './scene.ts';
import { AFTER, BEFORE, COPIES, HUNK, LOOKALIKE, PATCH, apply, newSide, oldSide } from './model.ts';
import type { CopyId } from './model.ts';
import { PITCH } from './picture.ts';

const close = (a: number, b: number) => Math.abs(a - b) < 0.02;

test('unified-diff: the file on stage is the model’s at every step, and the frame and the brace sit on the lines the model names', async () => {
  const project = await loadProject(UnifiedDiff, 'scenes/explainers/unified-diff');
  assert.equal(project.scenarios.length, 2);
  for (const scenario of project.scenarios) {
    const copy = [...COPIES[scenario.values.copy as CopyId]], yours = apply(copy, [HUNK]), wrong = apply(LOOKALIKE, [HUNK]), seen: string[] = [];
    assert.ok(wrong.ok);
    await new scenario.Scene({
      skipUntil: Infinity,
      async frame() {},
      async stepEnd(scene: Scene, step: { name: string }) {
        const part = (key: string): Mobject => {
          const found = scene.familyMembers().find((p) => p.key === key);
          assert.ok(found, `${scenario.values.copy} ${step.name}: no part keyed ${key}`);
          return found;
        };
        const lines = (key: string) => { const c = part(key); assert.ok(c instanceof Code); return c.lines.map((l) => l.text); };
        /** The y of line `n` of a block, read from the block itself. */
        const rowOf = (key: string, n: number) => (part(key) as Code).lines[n - 1]!.anchorPoint()[1];
        /** Whether the part's box runs from just above line `from` of the block to just below line `to`, and no further. */
        const spans = (key: string, block: string, from: number, to: number) => {
          const [, y0, , y1] = part(key).box()!, top = rowOf(block, from), bottom = rowOf(block, to);
          assert.ok(y1 > top + 0.15 && y1 < top + PITCH * 0.8, `${key} starts at line ${from}: its top is ${(y1 - top).toFixed(2)} above that line`);
          assert.ok(y0 < bottom - 0.15 && y0 > bottom - PITCH * 0.8, `${key} ends at line ${to}: its bottom is ${(bottom - y0).toFixed(2)} below that line`);
        };
        seen.push(step.name);
        if (['patch', 'header', 'apply'].includes(step.name)) assert.deepEqual(lines('patch'), PATCH.trimEnd().split('\n'));
        if (step.name === 'patch' || step.name === 'header') assert.deepEqual(lines('file'), BEFORE);
        if (step.name === 'header') spans('brace', 'file', HUNK.oldStart, HUNK.oldStart + HUNK.oldLines - 1);
        if (step.name === 'apply') {
          assert.deepEqual(lines('file'), AFTER);
          spans('brace', 'file', HUNK.newStart, HUNK.newStart + HUNK.newLines - 1);
        }
        if (step.name === 'yours' || step.name === 'search') {
          assert.deepEqual(lines('copy'), copy);
          assert.deepEqual(lines('card'), oldSide(HUNK));
        }
        if (step.name === 'yours') assert.ok(close(rowOf('card', 1), rowOf('copy', HUNK.oldStart)), 'the hunk’s lines are level with the line its header names');
        if (step.name === 'search') {
          // Found: the frame and the hunk rest on the lines where it fits. Refused: back on the line it started from.
          const at = yours.ok ? yours.placements[0]!.at : HUNK.oldStart;
          assert.ok(close(rowOf('card', 1), rowOf('copy', at)), `the hunk’s lines are level with line ${at}`);
          spans('frame', 'copy', at, at + oldSide(HUNK).length - 1);
        }
        if (step.name === 'result') assert.deepEqual(lines('copy'), yours.ok ? yours.file : copy);
        if (step.name === 'wrong') {
          assert.deepEqual(lines('copy'), wrong.file);
          spans('landed', 'copy', wrong.placements[0]!.at, wrong.placements[0]!.at + newSide(HUNK).length - 1);
        }
      },
    }).run();
    assert.deepEqual(seen, ['patch', 'header', 'apply', 'yours', 'search', 'result', 'wrong']);
  }
});
