// A passing story check requires all three matching catalog review shards.
import { readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT } from './lib/explain-project.ts';
import { readStoryPlan, reviewCodeHash, mergeStoryReviews } from './lib/explain-review-plan.ts';
import { EXPLAINERS } from '../scenes/explainers/catalog.ts';
import type { ReviewReceipt } from './lib/explain-review-plan.ts';
const directory = join(ROOT, 'out/validation'),
  output = join(directory, 'browser-review.json');
await mkdir(directory, { recursive: true });
await rm(output, { force: true });
const plan = await readStoryPlan(join(ROOT, 'out/explainers'), EXPLAINERS.map(scene => scene.id));
const parts = await Promise.all(
  [1, 2, 3].map(
    async (n) =>
      JSON.parse(await readFile(join(directory, `browser-review-shard-${n}-of-3.json`), 'utf8')) as ReviewReceipt,
  ),
);
const merged = mergeStoryReviews(parts, plan.cases, plan.catalogHash, await reviewCodeHash(ROOT));
await writeFile(output, JSON.stringify({sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: ROOT, encoding: 'utf8'}).trim(), ...merged}, null, 2) + '\n');
console.log(`${merged.cases} cases and ${merged.stepWidths} step/width states verified across all three shards.`);
