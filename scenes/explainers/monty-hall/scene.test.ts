import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadProject } from '../../../explain/testing.ts';
import MontyHall from './scene.ts';
import { Text, Rectangle } from '../../../src/index.ts';

test('Monty Hall paints every round at its chance and the host-conditioned percentages beside the correct strategies in every scenario', async () => {
  const project = await loadProject(MontyHall, 'scenes/explainers/monty-hall');
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
        skipUntil: Infinity,
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
    ).run();
    assert.deepEqual(visited, ['rounds', 'odds', 'worlds']);
  }
  assert.equal(pictures, 6);
  assert.equal(readouts, 8);
  assert.equal(comparisons, 2);
  // Per scenario: one strip in rounds and one in odds (4 or 6 cells each), two in worlds (10).
  assert.equal(cells, 2 * (4 + 6) + 2 * 10);
});
