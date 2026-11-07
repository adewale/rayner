import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFonts, loadSnapshots } from '../../../explain/testing.ts';
import { Scene } from '../../../src/index.ts';
import { NullSink } from '../../../src/output.ts';
import { Diagram } from '../../../explain/index.ts';
import type { DiagramSnapshot } from '../../../explain/index.ts';
import { GROUPS, PARTICIPANTS, gaveUp, journey, source } from './model.ts';
import type { Participant } from './model.ts';

// ---------------------------------------------------------------- journey words (explain/diagrams.ts)
await loadFonts();

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

async function shown(s: DiagramSnapshot, lang?: string) {
  class Scened extends Scene {
    static meta = { id: 'words', title: 'Words', ...(lang ? { lang } : {}) };
  }
  const d = new Diagram(new Scened(new NullSink(), { skipUntil: Infinity }), s.spec, s, {});
  await d.build();
  return d;
}

test('a journey says each task with its score, its curve by its extremes, its scale and actor, and leaves nothing blank', async () => {
  const seen = (await shown(pinned('P1', 0))).describe();
  assert.equal(seen.what, 'User journey: 4 tasks, scored from 1 to 5, actor P1');
  assert.equal(seen.blank, undefined);
  assert.deepEqual(seen.parts.map((p) => p.name), PARTS_P1);
});

test('every pinned journey names each task’s score as the model gives it', async () => {
  for (const p of PARTICIPANTS) {
    const g = shownGroup(p);
    const seen = (await shown(pinned(p, g))).describe();
    assert.equal(seen.blank, undefined);
    const tasks = journey(p, g).sections.flatMap((s) => s.tasks);
    const named = seen.parts.map((x) => x.name).filter((n) => /: score \d of 5$/.test(n));
    assert.deepEqual(named, tasks.map((t) => `${t.text}: score ${t.score} of 5`), `${p} ${g}`);
  }
});

test('a journey with one score throughout says its curve is flat; a French scene says it all in French', async () => {
  const flatSnapshot = Object.values(flatStore).find((x) => x.family === 'journey' && x.spec.source === source(journey('P3', 1)));
  assert.ok(flatSnapshot, 'no pinned flat journey');
  const flat = (await shown(flatSnapshot)).describe();
  assert.ok(flat.parts.some((x) => x.name === 'Experience curve: 5 throughout'), JSON.stringify(flat.parts));
  // A journey with several sections names them first, in their order.
  assert.deepEqual(flat.parts.slice(0, 3).map((x) => x.name), ['Menu structure', 'List view layout', 'Search']);
  const fr = (await shown(pinned('P1', 0), 'fr')).describe();
  assert.equal(fr.what, `Parcours utilisateur${NB}: 4 tâches, notées de 1 à 5, acteur P1`);
  assert.ok(fr.parts.some((x) => x.name === `4 Undo the move${NB}: note 1 sur 5`), JSON.stringify(fr.parts));
  assert.ok(fr.parts.some((x) => x.name.startsWith(`Courbe d’expérience${NB}: minimum 1 (4 Undo the move), maximum 5`)), JSON.stringify(fr.parts));
});
