import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Text, Rectangle } from '../src/index.ts';
import { NullSink } from '../src/output.ts';
import { loadFonts } from '../explain/testing.ts';
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

test('token introductions and the ring’s fill and result steps draw the independently expected balances, responses and slot values in every scenario', async () => {
  const token = await collectProject('scenes/explainers/token-bucket', { write: false }),
    ring = await collectProject('scenes/explainers/ring-buffer', { write: false });
  assert.equal(token.scenarios.length, 3);
  assert.equal(ring.scenarios.length, 2);
  let frames = 0;
  for (const v of token.scenarios)
    await new v.Scene(
      {
        async frame() {},
        async stepEnd(scene, step) {
          // The introduction's two pictures are gone; the native steps that show the
          // same burst, starting bucket and R7 refill carry these checks.
          if (!['balance', 'burst', 'refill'].includes(step.name)) return;
          if (step.name === 'balance') {
            // The bucket starts full: its level fills the shell, and the readout says five.
            const shell = scene.familyMembers().find((m) => m.key === 'bucket:shell'),
              level = scene.familyMembers().find((m) => m.key === 'bucket:level');
            assert.ok(shell instanceof Rectangle && level instanceof Rectangle);
            assert.ok(Math.abs(level.height() - (shell.height() - 0.16)) < 1e-5, 'the five starting tokens must be filled');
            assert.equal((scene.state as Record<string, unknown>).tokens, 5);
          } else if (step.name === 'burst') {
            for (let i = 0; i < 6; i++) {
              const request = scene.familyMembers().find((m) => m.key === `request:R${i + 1}`);
              assert.ok(request, `request ${i + 1} has its own response group`);
              assert.deepEqual(
                request
                  .family()
                  .filter((m): m is Text => m instanceof Text)
                  .map((m) => m.text),
                [i < 5 ? '200' : '429'],
              );
              // The box holds the answer alone; the request's name is written under it.
              const name = scene.familyMembers().find((m) => m.key === `name:R${i + 1}`);
              assert.ok(name instanceof Text && name.text === `R${i + 1}`, `request ${i + 1} is named`);
              assert.ok(Math.abs(name.center()[0] - request.center()[0]) < 1e-6 && name.box()![3] < request.box()![1], `R${i + 1} is written under its box`);
            }
            const level = scene.familyMembers().find((m) => m.key === 'bucket:level');
            assert.ok(level instanceof Rectangle && level.height() < 0.01, 'the burst empties the bucket');
          } else {
            const [found, after] = ({ 1: [0.5, 0.5], 2: [1, 0], 4: [2, 1] } as const)[
              Number(v.values.rate) as 1 | 2 | 4
            ];
            assert.equal((scene.state.balances as number[])[6], after);
            assert.equal((scene.state.responses as number[])[6], found >= 1 ? 200 : 429);
            const m = scene.familyMembers().find((m) => m.key === 'balance:found:R7:value');
            assert.ok(m instanceof Text);
            assert.equal(
              m.text,
              `R7: ${found.toFixed(1)}`,
              'the drawn number must match the balance, not just the internal state',
            );
          }
          frames++;
        },
      },
      { skipUntil: Infinity },
    ).run();
  for (const v of ring.scenarios)
    await new v.Scene(
      {
        async frame() {},
        async stepEnd(scene, step) {
          if (step.name !== 'fill' && step.name !== 'result') return;
          const expected =
            step.name === 'fill' || v.values.operations === 'full' ? [1, 2, 3, 4, 5] : [6, 7, 3, 4, 5];
          for (const [i, n] of expected.entries()) {
            const slot = scene.familyMembers().find((m) => m.key === `ring:value:${i}`);
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
  // Three token steps in each of three scenarios, two ring introductions in each of two.
  assert.equal(frames, 13);
});

test('GTFS departures preserve fixed departures and frequency patterns across all six source-feed scenarios', async () => {
  const p = await collectProject('scenes/explainers/gtfs', { write: false });
  assert.equal(p.scenarios.length, 6);
  let checked = 0;
  for (const v of p.scenarios)
    await new v.Scene(
      {
        async frame() {},
        async stepEnd(scene, step) {
          if (step.name !== 'departures') return;
          const [fixed, frequency] =
            v.values.date === '2007-06-04'
              ? [0, 0]
              : v.values.stop === 'airport'
                ? [v.values.date === '2007-06-09' ? 3 : 1, 0]
                : [0, 2];
          const day = scene.state.departures as { departures: unknown[]; headways: unknown[] };
          assert.equal(day.departures.length, fixed);
          assert.equal(day.headways.length, frequency);
          const words = scene
            .familyMembers()
            .filter((m): m is Text => m instanceof Text)
            .map((m) => m.text);
          // The card draws one row per fixed departure ("8:00  AB1, route 10") and, for a trip on
          // headways, one row per period ("STBA  6:00 to 22:00"); a removed day draws calendar.txt's.
          if (fixed + frequency) {
            assert.equal(words.filter((w) => /^\d+:\d\d {2}\w+, route /.test(w)).length, fixed);
            assert.equal(new Set(words.filter((w) => / to \d+:\d\d$/.test(w)).map((w) => w.split(' ')[0])).size, frequency);
          } else assert.ok(words.some((w) => /^(What calendar\.txt alone would send|Nothing leaves)/.test(w)) || words.includes('no departures'));
          checked++;
        },
      },
      { skipUntil: Infinity },
    ).run();
  assert.equal(checked, 6);
});

test('the occupied-date picture contains 365 days and the independently expected excluded set in every scenario', async () => {
  const p = await collectProject('scenes/explainers/birthday-paradox', { write: false });
  assert.equal(p.scenarios.length, 3);
  let checked = 0;
  for (const v of p.scenarios)
    await new v.Scene(
      {
        async frame() {},
        async stepEnd(scene, step) {
          if (step.name !== 'exact') return;
          const grid = scene.familyMembers().find((m) => m.key === 'birthday-days');
          assert.ok(grid);
          const cells = grid.children.filter((m): m is Rectangle => m instanceof Rectangle);
          assert.equal(cells.length, 365);
          // The last person must avoid the dates the people before them took.
          const expected = Number(v.values.people) - 1;
          assert.equal(cells.filter((m) => (m.style.fillOpacity ?? 1) > 0.9).length, expected);
          assert.equal(cells.filter((m) => (m.style.fillOpacity ?? 1) < 0.4).length, 365 - expected);
          checked++;
        },
      },
      { skipUntil: Infinity },
    ).run();
  assert.equal(checked, 3);
});

test('the complete annual daylight picture labels its fixed zero, twelve and twenty-four-hour scale at every latitude', async () => {
  const p = await collectProject('scenes/explainers/seasons', { write: false });
  assert.equal(p.scenarios.length, 4);
  let checked = 0;
  for (const v of p.scenarios)
    await new v.Scene(
      {
        async frame() {},
        async stepEnd(scene, step) {
          if (step.name !== 'year') return;
          const root = scene.familyMembers().find((m) => m.key === 'daylight-axes');
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

test('the ext4 reserve comparison actually changes reserve and preserves the metadata allocation', async () => {
  const { space, SIZES } = await import('../scenes/explainers/lib/ext4-space.ts');
  const p = await collectProject('scenes/explainers/ext4-space', { write: false });
  // The 1 TiB disk formatted with -m 1, against the default -m 5 the story walks first.
  const v = p.scenarios.find((x) => x.values.size === '1t' && x.values.reserve === '1');
  assert.ok(v);
  const fiveUsers = space(SIZES['1t'].bytes, 5).users;
  let checked = 0;
  await new v.Scene(
    {
      async frame() {},
      async stepEnd(scene, step) {
        if (step.name !== 'chosen') return;
        const chosen = scene.state.chosen as { users: number; pie: { label: string; value: number }[] };
        assert.ok(chosen.users > fiveUsers, 'lower reserve must increase writable space');
        assert.equal(chosen.pie.find((x) => x.label === 'Metadata')!.value, 4495258, 'metadata matches the existing 1 TiB mkfs reference vector');
        assert.ok(chosen.pie.find((x) => x.label === 'Users can write')!.value > fiveUsers);
        const words = scene
          .familyMembers()
          .filter((m): m is Text => m instanceof Text)
          .map((m) => m.text);
        assert.ok(words.includes('Root, 1%'));
        assert.ok(words.some((w) => w.includes('Users can write (97.3%)')) || words.includes('97.3%'), words.join(' | '));
        checked++;
      },
    },
    { skipUntil: Infinity },
  ).run();
  assert.equal(checked, 1);
});

test('traffic comparisons draw each source pod share without attributing the ingress source IP to its destination', async () => {
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
  const p = await collectProject('scenes/explainers/traffic-policy', { write: false });
  assert.equal(p.scenarios.length, 6);
  let checked = 0;
  for (const v of p.scenarios)
    await new v.Scene(
      {
        async frame() {},
        async stepEnd(scene, step) {
          const placement = v.values.pods as keyof typeof expected;
          if (step.name === 'shares') {
            // The step that answers "which pod gets the most?" compares per-pod traffic, not a
            // packet's ingress/SNAT path: those remain in the second-hop, snat and local-path steps.
            assert.doesNotMatch(String(step.meta.caption), /\b(?:source|hop)\b|\b\d{1,3}(?:\.\d{1,3}){3}\b/i);
            return;
          }
          if (step.name !== 'compare') return;
          // Each policy's card draws, for every pod, its share: one row per group of pods with the same share.
          for (const [column, policy] of [[1, 'cluster'], [2, 'local']] as const) {
            const rows = scene
              .familyMembers()
              .filter((m) => m.key?.startsWith(`traffic-compare:${policy}:share:`))
              .map((m) => [m.key!.slice(`traffic-compare:${policy}:share:`.length), (m as Text).text] as const);
            assert.ok(rows.length > 0, `${policy}: share rows drawn`);
            for (const row of expected[placement]) {
              const pod = row[0].split(' / ')[0]!;
              const drawn = rows.find(([label]) => new RegExp(`^Pods? (?:.*\\b)?${pod}\\b`).test(label));
              assert.ok(drawn, `${placement}/${policy}: a row names pod ${pod}`);
              assert.ok(drawn[1].includes(`(${row[column]})`), `${placement}/${policy}: pod ${pod} draws ${row[column]}, not ${drawn[1]}`);
            }
          }
          checked++;
        },
      },
      { skipUntil: Infinity },
    ).run();
  assert.equal(checked, 6);
});

test('GNOME sample labels explain every participant outcome and retain the report categories in every scenario', async () => {
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
    assert.equal(sample.state.task, tasks[selected]);
    const picture = sample.draw(sample.state, stage(new Scene(new NullSink())));
    assert.equal(picture.children.length, 6);
    const outcomes = sample.state.outcomes as { participant: string; colour: string; meaning: string }[];
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
