import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectProject } from '../tools/lib/explain-project.ts';
import { Text, Rectangle } from '../src/index.ts';

test('both piano rolls put every played pitch, onset and duration at its stated score coordinates', async () => {
  const p = await collectProject('scenes/explainers/melody-rhythm', { write: false });
  // Two versions of B; the tempo setting, which changed no picture's notes, is gone.
  assert.equal(p.scenarios.length, 2);
  let pictures = 0,
    notes = 0;
  for (const scenario of p.scenarios)
    await new scenario.Scene(
      {
        async frame() {},
        async stepEnd(scene, step) {
          const flat = step.name === 'rhythm';
          for (const [lane, id] of ['a', 'b'].entries()) {
            const shifted = id === 'b' && scenario.values.timing === 'syncopated';
            const starts = shifted ? [0, 1, 2, 3.5, 4.5, 5, 6, 7] : [0, 1, 2, 3, 4, 5, 6, 7];
            const duration = shifted ? [1, 1, 1.5, 1, 0.5, 1, 1, 1] : Array(8).fill(1);
            const names = flat ? Array(8).fill('C') : ['C', 'D', 'E', 'G', 'E', 'D', 'C', 'C'];
            const heights = flat ? Array(8).fill(0) : [0, 0.5, 1, 1.5, 1, 0.5, 0, 0];
            for (let i = 0; i < 8; i++) {
              const group = scene.familyMembers().find((m) => m.key === `note-${id}-${i}`);
              assert.ok(group, `${step.name}: missing note ${id}/${i}`);
              const rect = group.children[0],
                text = group.children[1];
              assert.ok(rect instanceof Rectangle && text instanceof Text);
              const [x, y] = rect.center();
              assert.ok(Math.abs(x - (-6 + (starts[i]! + duration[i]! / 2) * 1.65)) < 1e-5);
              assert.ok(Math.abs(y - ((lane === 0 ? 0.25 : -2.5) + heights[i]!)) < 1e-5);
              assert.ok(Math.abs(rect.width() - (duration[i]! * 1.65 - 0.08)) < 1e-5);
              assert.equal(text.text, names[i]);
              notes++;
            }
          }
          pictures++;
        },
      },
      { skipUntil: Infinity },
    ).run();
  // Four steps in each of two scenarios, sixteen notes a picture (timing merged into bar, phrase cut).
  assert.equal(pictures, 8);
  assert.equal(notes, 128);
});

test('Monty Hall paints every round at its chance and the host-conditioned percentages beside the correct strategies in every scenario', async () => {
  const project = await collectProject('scenes/explainers/monty-hall', { write: false });
  // Two host rules; the first pick is A (the strategy setting went with the step that played one round out, and the
  // first-pick setting, which only relabelled the doors, is gone).
  assert.equal(project.scenarios.length, 2);
  let pictures = 0,
    readouts = 0,
    comparisons = 0,
    cells = 0;
  for (const scenario of project.scenarios) {
    const visited: string[] = [];
    assert.equal(scenario.values.choice, undefined);
    await new scenario.Scene(
      {
        async frame() {},
        async stepEnd(scene, step) {
          if (!['rounds', 'odds', 'worlds'].includes(step.name)) return;
          const members = (key: string) => scene.familyMembers().filter((m) => m.key === key);
          const words = (key: string) => {
            const groups = members(key);
            assert.equal(groups.length, 1, `${step.name}: exactly one ${key} must be drawn`);
            return groups[0]!
              .family()
              .filter((m): m is Text => m instanceof Text)
              .map((m) => m.text);
          };
          // Each strip draws one cell per round, as wide as the round's chance: an informed host's
          // goat openings at A's third are two sixths, his forced openings two sixths each; a random host's six are one each.
          const hosts = step.name === 'worlds' ? ['informed', 'random'] : [scenario.values.host!];
          for (const host of hosts) {
            const strip = members(`strip:${host}`);
            assert.equal(strip.length, 1, `${step.name}: one ${host} strip`);
            const sixths = strip[0]!.children.map((cell) => {
              const box = cell.children.find((m): m is Rectangle => m instanceof Rectangle)!;
              return Math.round((box.width() / (13 / 6)) * 100) / 100;
            });
            assert.deepEqual(sixths, host === 'informed' ? [1, 1, 2, 2] : [1, 1, 1, 1, 1, 1], `${step.name}: ${host} widths`);
            cells += sixths.length;
          }
          if (step.name === 'odds') {
            // Independent small-world results: an informed host preserves all
            // initial wrong choices; random-host goat reveals leave equal odds.
            const expected = scenario.values.host === 'random' ? ['50.0%', '50.0%'] : ['33.3%', '66.7%'];
            assert.deepEqual(words('monty-stay'), ['Stay', expected[0]]);
            assert.deepEqual(words('monty-switch'), ['Switch', expected[1]]);
            readouts += 2;
            comparisons++;
          } else if (step.name === 'rounds') {
            // Every round before the reader rules any out: no odds are drawn yet.
            for (const key of ['monty-stay', 'monty-switch', 'monty-readout-informed', 'monty-readout-random'])
              assert.equal(members(key).length, 0, `rounds: ${key} must wait for the next step`);
          } else {
            // The old summary table's switch-wins column, now beside each host's strip; counting only the rounds that
            // show a goat behind the opened door gives the same odds (the old rules step's comparison).
            assert.deepEqual(words('monty-readout-informed'), ['switch wins 66.7%']);
            assert.deepEqual(words('monty-readout-random'), ['switch wins 50.0%']);
            readouts += 2;
          }
          // Each strip picture carries the key to its cells.
          assert.deepEqual(words('monty-key'), ['Each cell: opens · shows · wins']);
          pictures++;
          visited.push(step.name);
        },
      },
      { skipUntil: Infinity },
    ).run();
    assert.deepEqual(visited, ['rounds', 'odds', 'worlds']);
  }
  assert.equal(pictures, 6);
  assert.equal(readouts, 8);
  assert.equal(comparisons, 2);
  // Per scenario: one strip in rounds and one in odds (4 or 6 cells each), two in worlds (10).
  assert.equal(cells, 2 * (4 + 6) + 2 * 10);
});

test("the Bloom filter's tables key each row by its name or row length, and each keyed cell shows the model's answer", async () => {
  const { bloomStory } = await import('../scenes/explainers/lib/bloom-filter.ts');
  const project = await collectProject('scenes/explainers/bloom-filter', { write: false });
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
