// docs/WRITING.md prints the counts `rayner review` gives for its finished explainer. This runs the
// guide's own review command on the explainer, built as the guide builds it, and compares.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { CLI, buildStage, guideText, printedBlock, reviewCounts } from '../lib/writing-guide.ts';

const enabled = !!process.env.EXPLAIN_BROWSER,
  options = { skip: enabled ? false : 'set EXPLAIN_BROWSER=1 to run rayner review in Chromium', timeout: 300_000 };

test('rayner review of the guide\'s finished explainer prints the counts the guide prints', options, async () => {
  const doc = guideText();
  const command = /^npx rayner review (.+)$/m.exec(doc)?.[1]?.split(' ');
  assert.ok(command, 'the guide prints its review command');
  const folder = await mkdtemp(join(tmpdir(), 'rayner-writing-review-'));
  try {
    await buildStage(doc, 'done', folder);
    const run = spawnSync(process.execPath, [CLI, 'review', ...command], { cwd: folder, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(reviewCounts(run.stdout), printedBlock(doc, 'review'));
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
