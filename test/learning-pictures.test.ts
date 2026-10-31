import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectProject } from '../tools/lib/explain-project.ts';
import { Text, Rectangle } from '../src/index.ts';

test('both piano rolls put every played pitch, onset and duration at its stated score coordinates', async () => {
  const p = await collectProject('scenes/explainers/melody-rhythm', { write: false });
  assert.equal(p.variants.length, 4);
  let pictures = 0,
    notes = 0;
  for (const variant of p.variants)
    await new variant.Scene(
      {
        async frame() {},
        async stepEnd(scene, step) {
          const flat = step.name === 'rhythm';
          for (const [lane, id] of ['a', 'b'].entries()) {
            const shifted = id === 'b' && variant.values.timing === 'syncopated';
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
              assert.ok(Math.abs(y - ((lane === 0 ? 0.25 : -2.75) + heights[i]!)) < 1e-5);
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
  assert.equal(pictures, 32);
  assert.equal(notes, 512);
});

test('Monty Hall paints the host-conditioned percentages beside the correct strategies in every case', async () => {
  const project = await collectProject('scenes/explainers/monty-hall', { write: false });
  assert.equal(project.variants.length, 12);
  let pictures = 0,
    readouts = 0,
    comparisons = 0;
  for (const variant of project.variants) {
    const visited: string[] = [];
    await new variant.Scene(
      {
        async frame() {},
        async stepEnd(scene, step) {
          if (!['odds', 'many', 'rules'].includes(step.name)) return;
          const words = (key: string) => {
            const groups = scene.familyMembers().filter((m) => m.key === key);
            assert.equal(groups.length, 1, `${step.name}: exactly one ${key} must be drawn`);
            return groups[0]!
              .family()
              .filter((m): m is Text => m instanceof Text)
              .map((m) => m.text);
          };
          if (step.name === 'many') {
            const removed = scene.familyMembers().find((m) => m.key === 'monty-removed');
            assert.ok(removed);
            assert.equal(removed.children.length, 98, 'show each door opened by the 100-door host');
            for (const door of removed.children) {
              assert.ok(door instanceof Rectangle);
              assert.equal(door.style.fill, 'none');
              assert.ok((door.style.strokeWidth ?? 0) >= 0.03);
            }
          }
          if (step.name === 'rules') {
            assert.deepEqual(words('monty-rules'), [
              'Host',
              'Goat reveal',
              'Switch wins',
              'informed',
              'always',
              '66.7%',
              'random',
              '66.7%',
              '50.0%',
            ]);
            comparisons++;
          } else {
            // Independent small-world results: an informed host preserves all
            // initial wrong choices; random-host goat reveals leave equal odds.
            const expected =
              variant.values.host === 'random'
                ? ['50.0%', '50.0%']
                : step.name === 'many'
                  ? ['1.0%', '99.0%']
                  : ['33.3%', '66.7%'];
            assert.deepEqual(words('monty-stay'), ['Stay', expected[0]]);
            assert.deepEqual(words('monty-switch'), ['Switch', expected[1]]);
            readouts += 2;
          }
          pictures++;
          visited.push(step.name);
        },
      },
      { skipUntil: Infinity },
    ).run();
    assert.deepEqual(visited, ['odds', 'many', 'rules']);
  }
  assert.equal(pictures, 36);
  assert.equal(readouts, 48);
  assert.equal(comparisons, 12);
});
