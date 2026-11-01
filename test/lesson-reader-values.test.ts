import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Text, Rectangle, Circle, loadFonts, NullSink } from '../src/index.ts';
import { stage } from '../explain/index.ts';
import { collectProject } from '../tools/lib/explain-project.ts';
import { fc, params } from './lib/pbt.ts';
import { bars } from '../scenes/explainers/lib/reader-drawing.ts';
await loadFonts();

test('comparison bars preserve a common scale, exact ends and an empty zero', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 1000000 }),
      fc.array(fc.integer({ min: 0, max: 1000000 }), { minLength: 1, maxLength: 3 }),
      (scale, raw) => {
        const values = raw.map((n) => n % (scale + 1)),
          s = stage(new Scene(new NullSink())),
          g = bars(
            s,
            values.map((v, i) => ({ label: `row ${i}`, value: v, display: String(v) })),
            scale,
          );
        const fills = g.children.filter((m): m is Rectangle => m instanceof Rectangle && m.style.stroke === 'none');
        assert.equal(fills.length, values.filter((v) => v > 0).length, 'zero must not acquire a decorative stub');
        // Rectangle paths use Float32 coordinates; allow less than 0.001 CSS px at 1280.
        for (const [i, v] of values.filter((v) => v > 0).entries()) {
          assert.ok(Math.abs(fills[i]!.width() - (8.5 * v) / scale) < 1e-5);
          assert.ok(Math.abs(fills[i]!.box()![0] + 4) < 1e-5, 'all bars start at the same zero');
          assert.ok(Math.abs(fills[i]!.box()![2] - (-4 + (8.5 * v) / scale)) < 1e-5);
        }
      },
    ),
    params(),
  );
});

test('token and ring introductions draw the independently expected balances, responses and slot values in every case', async () => {
  const token = await collectProject('scenes/explainers/token-bucket', { write: false }),
    ring = await collectProject('scenes/explainers/ring-buffer', { write: false });
  assert.equal(token.variants.length, 3);
  assert.equal(ring.variants.length, 2);
  let frames = 0;
  for (const v of token.variants)
    await new v.Scene(
      {
        async frame() {},
        async stepEnd(scene, step) {
          if (!step.name.startsWith('reader-')) return;
          if (step.name === 'reader-burst') {
            for (let i = 0; i < 6; i++) {
              const request = scene.familyMembers().find((m) => m.key === `burst:${i}:${i < 5 ? 200 : 429}`);
              assert.ok(request, `request ${i + 1} has its own response group`);
              assert.deepEqual(
                request
                  .family()
                  .filter((m): m is Text => m instanceof Text)
                  .map((m) => m.text),
                [`R${i + 1}`, i < 5 ? '200' : '429'],
              );
            }
            const root = scene.familyMembers().find((m) => m.key === 'reader-picture');
            assert.ok(root);
            const tokens = root.family().filter((m) => m instanceof Circle);
            assert.equal(tokens.length, 5);
            for (const token of tokens)
              assert.ok((token.style.fillOpacity ?? 1) > 0.9, 'the five starting tokens must be filled');
          } else {
            const [found, after] = ({ 1: [0.5, 0.5], 2: [1, 0], 4: [2, 1] } as const)[
              Number(v.values.rate) as 1 | 2 | 4
            ];
            assert.equal((scene.state.reader as Record<string, unknown>).found, found);
            assert.equal((scene.state.reader as Record<string, unknown>).after, after);
            for (const [i, value] of [0, found, after].entries()) {
              const m = scene.familyMembers().find((m) => m.key === `reader-bars:${i}:value`);
              assert.ok(m instanceof Text);
              assert.equal(
                m.text,
                String(value),
                'the drawn number must match the balance, not just the internal state',
              );
            }
          }
          frames++;
        },
      },
      { skipUntil: Infinity },
    ).run();
  for (const v of ring.variants)
    await new v.Scene(
      {
        async frame() {},
        async stepEnd(scene, step) {
          if (!step.name.startsWith('reader-')) return;
          const expected =
            step.name === 'reader-capacity' || v.values.operations === 'full' ? [1, 2, 3, 4, 5] : [6, 7, 3, 4, 5];
          for (const [i, n] of expected.entries()) {
            const slot = scene.familyMembers().find((m) => m.key === `slot:${i}`);
            assert.ok(slot);
            assert.deepEqual(
              slot
                .family()
                .filter((m): m is Text => m instanceof Text)
                .map((m) => m.text),
              [String(n)],
            );
          }
          frames++;
        },
      },
      { skipUntil: Infinity },
    ).run();
  assert.equal(frames, 10);
});

test('GTFS stop introductions preserve fixed departures and frequency patterns across all six source-feed cases', async () => {
  const p = await collectProject('scenes/explainers/gtfs', { write: false });
  assert.equal(p.variants.length, 6);
  let checked = 0;
  for (const v of p.variants)
    await new v.Scene(
      {
        async frame() {},
        async stepEnd(scene, step) {
          if (step.name !== 'reader-stop') return;
          const [fixed, frequency] =
            v.values.date === '2007-06-04'
              ? [0, 0]
              : v.values.stop === 'airport'
                ? [v.values.date === '2007-06-09' ? 3 : 1, 0]
                : [0, 2];
          assert.equal((scene.state.reader as Record<string, unknown>).fixed, fixed);
          assert.equal((scene.state.reader as Record<string, unknown>).frequency, frequency);
          const words = scene
            .familyMembers()
            .filter((m): m is Text => m instanceof Text)
            .map((m) => m.text);
          const at = words.indexOf('Fixed times');
          assert.ok(at >= 0);
          assert.equal(words[at + 1], String(fixed));
          const bands = words.indexOf('Headway patterns');
          assert.ok(bands >= 0);
          assert.equal(words[bands + 1], String(frequency));
          checked++;
        },
      },
      { skipUntil: Infinity },
    ).run();
  assert.equal(checked, 6);
});

test('the occupied-date picture contains 365 days and the independently expected excluded set in every case', async () => {
  const p = await collectProject('scenes/explainers/birthday-paradox', { write: false });
  assert.equal(p.variants.length, 6);
  let checked = 0;
  for (const v of p.variants)
    await new v.Scene(
      {
        async frame() {},
        async stepEnd(scene, step) {
          if (step.name !== 'occupied') return;
          const grid = scene.familyMembers().find((m) => m.key === 'birthday-days');
          assert.ok(grid);
          const cells = grid.children.filter((m): m is Rectangle => m instanceof Rectangle);
          assert.equal(cells.length, 365);
          const expected = v.values.question === 'any' ? 4 : 1;
          assert.equal(cells.filter((m) => (m.style.fillOpacity ?? 1) > 0.9).length, expected);
          assert.equal(cells.filter((m) => (m.style.fillOpacity ?? 1) < 0.4).length, 365 - expected);
          checked++;
        },
      },
      { skipUntil: Infinity },
    ).run();
  assert.equal(checked, 6);
});

test('the complete annual daylight picture labels its fixed zero, twelve and twenty-four-hour scale at every latitude', async () => {
  const p = await collectProject('scenes/explainers/seasons', { write: false });
  assert.equal(p.variants.length, 4);
  let checked = 0;
  for (const v of p.variants)
    await new v.Scene(
      {
        async frame() {},
        async stepEnd(scene, step) {
          if (step.name !== 'reader-year') return;
          const root = scene.familyMembers().find((m) => m.key === 'reader-picture');
          assert.ok(root);
          const words = root
            .family()
            .filter((m): m is Text => m instanceof Text)
            .map((m) => m.text);
          for (const tick of ['0', '12', '24'])
            assert.ok(words.includes(tick), `${v.values.place}: ${tick} hours must be labelled`);
          checked++;
        },
      },
      { skipUntil: Infinity },
    ).run();
  assert.equal(checked, 4);
});

test('the default ext4 reserve comparison actually changes reserve and preserves the metadata allocation', async () => {
  const { frames } = await import('../scenes/explainers/lib/readers/ext4-space.ts');
  const [allocation, comparison] = frames('1t', 5);
  assert.ok(allocation && comparison);
  const s = stage(new Scene(new NullSink()));
  const picture = comparison.draw(s);
  const words = picture
    .family()
    .filter((m): m is Text => m instanceof Text)
    .map((m) => m.text);
  assert.ok(words.includes('Users at 5% reserve'));
  assert.ok(words.includes('Users at 1% reserve'));
  const fills = picture.family().filter((m): m is Rectangle => m instanceof Rectangle && m.style.stroke === 'none');
  assert.equal(fills.length, 2);
  assert.ok(fills[1]!.width() > fills[0]!.width(), 'lower reserve must visibly increase writable space');
  assert.equal(comparison.values.metadata, 4495258, 'metadata matches the existing 1 TiB mkfs reference vector');
});

test('traffic comparisons draw each source pod share without attributing the ingress source IP to its destination', async () => {
  const { frames } = await import('../scenes/explainers/lib/readers/traffic-policy.ts');
  const expected = {
    '3-1-0': [
      ['a / N1', '25%', '16.7%'],
      ['b / N1', '25%', '16.7%'],
      ['c / N1', '25%', '16.7%'],
      ['d / N2', '25%', '50%'],
    ],
    '2-2-0': [
      ['a / N1', '25%', '25%'],
      ['b / N1', '25%', '25%'],
      ['c / N2', '25%', '25%'],
      ['d / N2', '25%', '25%'],
    ],
    '1-1-1': [
      ['a / N1', '33.3%', '33.3%'],
      ['b / N2', '33.3%', '33.3%'],
      ['c / N3', '33.3%', '33.3%'],
    ],
  } as const;
  let checked = 0;
  for (const placement of ['3-1-0', '2-2-0', '1-1-1'] as const)
    for (const policy of ['cluster', 'local'] as const) {
      const [nodes, comparison] = frames(placement, policy);
      assert.ok(nodes && comparison);
      assert.equal(nodes.values.key, placement);
      assert.equal(nodes.values.policy, policy);
      const words = comparison
        .draw(stage(new Scene(new NullSink())))
        .family()
        .filter((m): m is Text => m instanceof Text)
        .map((m) => m.text);
      assert.deepEqual(words, ['Pod', 'Cluster', 'Local', ...expected[placement].flat()]);
      // The picture compares per-pod traffic, not a packet's ingress/SNAT path. Those paths
      // remain in the independently checked second-hop and source-IP source walkthroughs.
      assert.doesNotMatch(comparison.caption, /\b(?:source|hop)\b|\b\d{1,3}(?:\.\d{1,3}){3}\b/i);
      checked++;
    }
  assert.equal(checked, 6);
});

test('GNOME sample labels explain every participant outcome and retain the report categories in every case', async () => {
  const { frames } = await import('../scenes/explainers/lib/readers/gnome-files.ts');
  // Report page 7, in participant order P1..P6; the selected participant's first
  // abandoned task is fixed by the session ordering, not the report's chapter order.
  const tasks = { P1: 4, P2: 1, P3: 3, P4: 3, P5: 3, P6: 1 } as const;
  const categories = { 1: 'OBGYOB', 3: 'GGBBBX', 4: 'BYBYGB' } as const;
  const key = {
    G: { colour: 'green', meaning: 'completed without any difficulty', lines: ['No', 'difficulty'], rgb: '#72f072' },
    Y: {
      colour: 'yellow',
      meaning: 'completed with very little difficulty',
      lines: ['Very little', 'difficulty'],
      rgb: '#f2f369',
    },
    O: {
      colour: 'orange',
      meaning: 'completed with moderate difficulty',
      lines: ['Moderate', 'difficulty'],
      rgb: '#f7b34e',
    },
    B: { colour: 'black', meaning: 'unable to complete the task', lines: ['Could not', 'complete'], rgb: '#2b2b2b' },
    X: {
      colour: 'gray',
      meaning: 'approach outside the scope of the study',
      lines: ['Outside', 'study scope'],
      rgb: '#b7b7b7',
    },
  } as const;
  let participants = 0;
  for (const selected of ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'] as const) {
    const sample = frames(selected)[1]!;
    assert.equal(sample.values.task, tasks[selected]);
    const picture = sample.draw(stage(new Scene(new NullSink())));
    assert.equal(picture.children.length, 6);
    const outcomes = sample.values.outcomes as { participant: string; colour: string; meaning: string }[];
    assert.equal(outcomes.length, 6);
    for (let i = 0; i < 6; i++) {
      const participant = `P${i + 1}`;
      const expected = key[categories[tasks[selected]][i] as keyof typeof key];
      const result = picture.children.find((m) => m.key === `outcome:${participant}`);
      assert.ok(result, `${selected}: ${participant} has a result`);
      const texts = result.children.filter((m): m is Text => m instanceof Text);
      assert.deepEqual(
        texts.map((t) => t.text),
        [participant, ...expected.lines],
      );
      assert.deepEqual(outcomes[i], { participant, colour: expected.colour, meaning: expected.meaning });
      const swatches = result.children.filter((m): m is Rectangle => m instanceof Rectangle);
      assert.equal(swatches.length, 1);
      assert.equal(swatches[0]!.style.fill, expected.rgb);
      // Labels describe the category rather than requiring a colour-name lookup.
      assert.ok(texts.slice(1).every((t) => t.text !== expected.colour));
      participants++;
    }
  }
  assert.equal(participants, 36);
});
