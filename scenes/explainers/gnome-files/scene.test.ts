import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diagramOf, loadFonts, loadProject, loadSnapshots } from '../../../explain/testing.ts';
import type { DiagramSnapshot } from '../../../explain/index.ts';
import { COLOURS, GROUPS, MEANING, PARTICIPANTS, SCORE, gaveUp, journey, source } from './model.ts';
import type { Participant } from './model.ts';
import { Text } from '../../../src/index.ts';
import GnomeFiles from './scene.ts';

// ---------------------------------------------------------------- journey words (explain/diagrams.ts)
await loadFonts();

test('the report colour key and attribution read whole on a phone for every participant', async () => {
  const project = await loadProject(GnomeFiles, import.meta.dirname), checked: string[] = [];
  const words = [
    ...COLOURS.map(c => `${c}: ${MEANING[c]}`),
    ...COLOURS.map(c => SCORE[c] == null ? '–' : String(SCORE[c])),
    'Colours and meanings: the report, page 7.',
    'Scores: this page’s, for its charts.',
  ];
  for (const scenario of project.scenarios) {
    await new scenario.Scene({
      skipUntil: Infinity,
      async frame() {},
      async stepEnd(scene, step) {
        if (step.name !== 'test') return;
        const key = scene.find('colour-key');
        assert.ok(key);
        const labels = [
          ...key.family(),
          ...scene.familyMembers().filter(m => m instanceof Text &&
            (m.text.startsWith('Colours and meanings:') || m.text.startsWith('Scores:'))),
        ].filter((m): m is Text => m instanceof Text);
        assert.equal(labels.length, 14, 'six meanings, six scores and two attribution lines');
        for (const text of words) assert.ok(labels.some(m => m.text === text), text);
        for (const m of labels) {
          assert.ok(m.textSize() * 358 / 16 >= 12, m.text);
          const b = m.box()!;
          assert.ok(b[0] >= -8 && b[1] >= -4.5 && b[2] <= 8 && b[3] <= 4.5, m.text);
        }
        checked.push(scenario.values.participant!);
      },
    }).run();
  }
  assert.deepEqual(checked, [...PARTICIPANTS]);
});

const NB = '\u202f';

const store = await loadSnapshots('scenes/explainers/gnome-files');

/** The group the scene's one journey shows: the one holding the participant's first give-up. */
const shownGroup = (p: Participant) => GROUPS.findIndex((g) => g.includes(gaveUp(p)[0]!));

const pinned = (p: Participant, g: number): DiagramSnapshot => {
  const s = Object.values(store).find((x) => x.family === 'journey' && x.spec.source === source(journey(p, g)));
  assert.ok(s, `no pinned journey for ${p}, group ${g}`);
  return s;
};

// No participant's first four tasks score the same throughout, so a fixture pins P3's middle four, all 5.
const flatStore = await loadSnapshots('test/fixtures/journey-flat');

/** How P1's first four tasks, the journey the scene shows by default, are described part by part. */
const PARTS_P1 = [
  'Menu structure',
  'Experience curve: lowest 1 (4 Undo the move), highest 5 (2 Folder size in Properties, 3 Select All)',
  '1 Change the icon size: score 3 of 5',
  '2 Folder size in Properties: score 5 of 5',
  '3 Select All: score 5 of 5',
  '4 Undo the move: score 1 of 5',
];

test('a journey says each task with its score, its curve by its extremes, its scale and actor, and leaves nothing blank', async () => {
  const seen = (await diagramOf(pinned('P1', 0))).describe();
  assert.equal(seen.what, 'User journey: 4 tasks, scored from 1 to 5, actor P1');
  assert.equal(seen.blank, undefined);
  assert.deepEqual(seen.parts.map((p) => p.name), PARTS_P1);
});

test('every pinned journey names each task’s score as the model gives it', async () => {
  for (const p of PARTICIPANTS) {
    const g = shownGroup(p);
    const seen = (await diagramOf(pinned(p, g))).describe();
    assert.equal(seen.blank, undefined);
    const tasks = journey(p, g).sections.flatMap((s) => s.tasks);
    const named = seen.parts.map((x) => x.name).filter((n) => /: score \d of 5$/.test(n));
    assert.deepEqual(named, tasks.map((t) => `${t.text}: score ${t.score} of 5`), `${p} ${g}`);
  }
});

test('a journey with one score throughout says its curve is flat; a French scene says it all in French', async () => {
  const flatSnapshot = Object.values(flatStore).find((x) => x.family === 'journey' && x.spec.source === source(journey('P3', 1)));
  assert.ok(flatSnapshot, 'no pinned flat journey');
  const flat = (await diagramOf(flatSnapshot)).describe();
  assert.ok(flat.parts.some((x) => x.name === 'Experience curve: 5 throughout'), JSON.stringify(flat.parts));
  // A journey with several sections names them first, in their order.
  assert.deepEqual(flat.parts.slice(0, 3).map((x) => x.name), ['Menu structure', 'List view layout', 'Search']);
  const fr = (await diagramOf(pinned('P1', 0), { lang: 'fr' })).describe();
  assert.equal(fr.what, `Parcours utilisateur${NB}: 4 tâches, notées de 1 à 5, acteur P1`);
  assert.ok(fr.parts.some((x) => x.name === `4 Undo the move${NB}: note 1 sur 5`), JSON.stringify(fr.parts));
  assert.ok(fr.parts.some((x) => x.name.startsWith(`Courbe d’expérience${NB}: minimum 1 (4 Undo the move), maximum 5`)), JSON.stringify(fr.parts));
});
