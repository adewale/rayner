import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXPLAINERS } from '../scenes/explainers/catalog.ts';
import { parseIntent, intentMeta } from '../explain/intent.ts';
import { compareAnswers } from '../tools/lib/explain-evidence.ts';

// Each explainer's answer and its reader questions' answers were once computed from its model inside the scene's static
// meta; they now live as fixed text in script.md, and the explainer's answers.ts recomputes them from the
// model, with the expressions the scene used before the move (commit 8ed1dbbd). rayner check holds the
// script to answers.ts; this test does the same for the whole collection without running a scene. The
// facts the answers' words take as given are in each folder's model.test.ts. A failure means the model and
// the script disagree: fix whichever is wrong.

const folders = [...EXPLAINERS.map((e) => `scenes/explainers/${e.id}`), 'scenes/tutorial/door', 'scenes/tutorial/hanoi', 'scenes/tutorial/lru-mru'];
/** Each explainer with answers.ts, and how many of its script's parts it computes: the answer counts as one. */
const COMPARED: Record<string, number> = {
  '2password': 2, 'bloom-filter': 2, 'cert-renewal': 2, exgit: 3, 'ext4-space': 4, gtfs: 3, 'ical-recurrence': 2, isdigit: 3, 'just-bash': 3,
  'monty-hall': 2, 'pg-page': 3, 'quotient-familial': 4, 'ring-buffer': 3, 'send-sync': 3, 'state-machine': 1, statecharts: 3,
  'tailwind-gamut': 3, 'traffic-policy': 3, 'trust-proxy': 3,
};

test('the explainers that compute their script’s answers from the model are those with answers.ts', () => {
  const found = folders.filter((dir) => existsSync(join(dir, 'answers.ts'))).map((dir) => dir.split('/').at(-1)!);
  assert.deepEqual(found.sort(), Object.keys(COMPARED).sort());
});

for (const [id, compared] of Object.entries(COMPARED))
  test(`${id}: script.md’s answer and reader questions’ answers are what answers.ts computes from the model`, async () => {
    const dir = `scenes/explainers/${id}`,
      file = join(dir, 'script.md');
    const intent = parseIntent(readFileSync(file, 'utf8'), file);
    assert.ok(intent, `${file} has no intent header`);
    const report = await compareAnswers(join(dir, 'scene.ts'), intentMeta(intent), (answers) => import(join(process.cwd(), answers)));
    assert.deepEqual(report?.problems, []);
    assert.equal(report?.compared, compared);
  });
