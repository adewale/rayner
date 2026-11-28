// A passing story check requires every matching catalog review shard.
import { readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT } from '../lib/explain-project.ts';
import { readStoryPlan, reviewCodeHash, mergeStoryReviews } from '../lib/explain-review-plan.ts';
import { EXPLAINERS } from '../../scenes/explainers/catalog.ts';
import {parseArgs} from 'node:util';
import type { ReviewReceipt } from '../lib/explain-review-plan.ts';
const directory = join(ROOT, 'out/validation'),
  output = join(directory, 'browser-review.json');
const {values} = parseArgs({options: {shards: {type: 'string', default: '3'}}});
const shardCount = values.shards ?? '3';
assertShardCount(shardCount);
function assertShardCount(value: string): void {
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error('--shards must be a positive safe integer');
}
const total = Number(shardCount);
await mkdir(directory, { recursive: true });
await rm(output, { force: true });
const plan = await readStoryPlan(join(ROOT, 'out/explainers'), EXPLAINERS.map(scene => scene.id));
const parts = await Promise.all(
  Array.from({length: total}, (_, i) => i + 1).map(
    async (n) =>
      JSON.parse(await readFile(join(directory, `browser-review-shard-${n}-of-${total}.json`), 'utf8')) as ReviewReceipt,
  ),
);
const merged = mergeStoryReviews(parts, plan.scenarios, plan.catalogHash, await reviewCodeHash(ROOT));
await writeFile(output, JSON.stringify({sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: ROOT, encoding: 'utf8'}).trim(), ...merged}, null, 2) + '\n');
console.log(`${merged.scenarios} scenarios, ${merged.stepWidths} step/width states and ${merged.liveStateWidths} live-state/width states verified across all ${total} shards.`);
