import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadProject } from '../../../explain/testing.ts';
import BloomFilter from './scene.ts';
import { Text } from '../../../src/index.ts';

test("the Bloom filter's tables key each row by its name or row length, and each keyed cell shows the model's answer", async () => {
  const { bloomStory } = await import('./model.ts');
  const project = await loadProject(BloomFilter, 'scenes/explainers/bloom-filter');
  assert.equal(project.scenarios.length, 2);
  let cells = 0;
  for (const scenario of project.scenarios) {
    const m = bloomStory(Number(scenario.values.bits) as 16 | 32), other = bloomStory(m.size === 16 ? 32 : 16);
    let seen = false;
    await new scenario.Scene(
      {
        async frame() {},
        async stepEnd(scene, step) {
          if (step.name !== 'pipeline') return;
          seen = true;
          const text = (key: string) => {
            const part = scene.familyMembers().find((p) => p.key === key);
            assert.ok(part instanceof Text, `${scenario.values.bits}: no text keyed ${key}`);
            cells++;
            return part.text;
          };
          for (const q of m.queries) {
            assert.equal(text(`bloom-pipeline:${q.word}:Name`), q.word);
            assert.equal(text(`bloom-pipeline:${q.word}:Filter`), q.maybe ? 'maybe' : 'no');
            assert.equal(text(`bloom-pipeline:${q.word}:Database`), q.maybe ? (q.stored ? 'taken' : 'free') : 'skipped');
          }
          for (const row of [m, other]) assert.equal(text(`bloom-sample:bits-${row.size}:Pass`), row.sampleFalsePositives.toLocaleString('en-US'));
        },
      },
      { skipUntil: Infinity },
    ).run();
    assert.ok(seen, 'the pipeline step ran');
  }
  // Three lookups of three cells and two sample counts, in each of two scenarios.
  assert.equal(cells, 22);
});
