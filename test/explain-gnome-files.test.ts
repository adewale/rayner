// The gnome-files explainer's heat map, held to the report's own sentences about each task, and its
// journey edits held to Agentic Mermaid's mutate and serializer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRegisteredMermaid } from 'agentic-mermaid';
import { mutate, serializeMermaid } from 'agentic-mermaid/agent';
import type { AnyMutationOp } from 'agentic-mermaid/agent';
import { fc, params } from './lib/pbt.ts';
import { Scene, NullSink, loadFonts } from '../src/index.ts';
import { Diagram } from '../explain/diagrams.ts';
import type { DiagramSnapshot } from '../explain/index.ts';
import { readSnapshots } from '../tools/lib/explain-project.ts';
import {
  COLOURS,
  GROUPS,
  PARTICIPANTS,
  SCORE,
  SESSION,
  TASKS,
  colourOf,
  edits,
  gaveUp,
  giveUps,
  journey,
  quitters,
  scoreOf,
  source,
  struggled,
} from '../scenes/explainers/lib/gnome-files.ts';
import type { Colour, Journey, Participant } from '../scenes/explainers/lib/gnome-files.ts';

const NB = '\u202f';
const row = (n: number) => PARTICIPANTS.map((p) => colourOf(n, p));
const count = (n: number, c: Colour) => row(n).filter((x) => x === c).length;

test('the heat map agrees with what the report says about each task', () => {
  // Task 1, page 9: "Four out of the six participants struggled with this task. Only one participant was
  // able to complete it without any difficulty"; page 10: "one participant, who gave up on the task".
  assert.equal(row(1).filter((c) => c !== 'green' && c !== 'yellow').length, 4);
  assert.equal(count(1, 'green'), 1);
  assert.ok(count(1, 'black') >= 1);
  // Page 12: the editors were easier to find "for the testing sessions with P3 and P4".
  assert.deepEqual([colourOf(1, 'P3'), colourOf(1, 'P4')], ['green', 'yellow']);
  // Task 2, page 15: "Overall, no one struggled to complete this task."
  assert.ok(row(2).every((c) => c === 'green' || c === 'yellow'));
  // Task 3, page 20: "two of the six participants found “Select All” without any difficulty on their
  // first attempt, whereas three participants gave up".
  assert.equal(count(3, 'green'), 2);
  assert.equal(count(3, 'black'), 3);
  // Task 4, page 25: "One half of the sample was able to find the “Undo” button, and easily completed
  // the task… The other half of the sample was unable to find it, and abandoned the task".
  assert.equal(count(4, 'black'), 3);
  assert.ok(row(4).filter((c) => c !== 'black').every((c) => c === 'green' || c === 'yellow'));
  // Task 5, page 30: "Every participant completed this task on their first attempt without any difficulty."
  assert.equal(count(5, 'green'), 6);
  // Task 6, page 32: "almost everyone did it on their first attempt. Only one participant clicked on
  // “View Options”".
  assert.equal(count(6, 'green'), 5);
  // Task 7, pages 33–34: half used the context menu at once; of the other three, one completed after a
  // prompt, "while the other two made a few more unsuccessful attempts and eventually gave up on it."
  assert.equal(count(7, 'black'), 2);
  // Task 8, page 36: "Almost everyone completed this task without any difficulty."
  assert.equal(count(8, 'green'), 5);
  // Task 9, page 40: "Only one participant was able to find the button without any difficulty", and
  // "the participant who gave up on the task".
  assert.equal(count(9, 'green'), 1);
  assert.equal(count(9, 'black'), 1);
  // Task 10, page 45: "Two out of the six participants completed this task with moderate difficulty, but
  // half of the sample completed it without any difficulty."
  assert.equal(count(10, 'orange'), 2);
  assert.equal(count(10, 'green'), 3);
  // Task 11, page 51: "only two out of the six were eventually able to open the folder context menu in
  // this way" (between the files); everyone completed the task.
  assert.equal(count(11, 'black'), 0);
});

test('the title’s claim: every participant gave up at least once, and only on tasks 1 to 9, the menu tasks', () => {
  for (const p of PARTICIPANTS) assert.ok(gaveUp(p).length >= 1, p);
  assert.deepEqual(
    Object.fromEntries(PARTICIPANTS.map((p) => [p, gaveUp(p)])),
    { P1: [4, 7], P2: [1, 7], P3: [3, 4, 9], P4: [3], P5: [3], P6: [1, 4] },
  );
  assert.equal(giveUps().length, 11);
  for (const [n] of giveUps()) assert.equal(TASKS.find((t) => t.n === n)!.section, 'Menu structure');
  assert.deepEqual(TASKS.filter((t) => t.section === 'Menu structure').map((t) => t.n), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  // Ranked by give-ups, Select All and Undo lose three people each.
  assert.deepEqual(quitters(3), ['P3', 'P4', 'P5']);
  assert.deepEqual(quitters(4), ['P1', 'P3', 'P6']);
  // One cell is gray: P6's approach to Select All was outside the study's scope.
  assert.deepEqual(
    SESSION.flatMap((n) => PARTICIPANTS.filter((p) => colourOf(n, p) === 'gray').map((p) => `${n} ${p}`)),
    ['3 P6'],
  );
});

test('counting moderate difficulty or worse puts icon size and Bookmarks first, as the article ranks them', () => {
  // ARTICLE §6.1 names changing the icon size and Add To Bookmarks the hardest tasks; the heat-map step says
  // that counting orange, red and black cells agrees, while counting give-ups alone puts Select All and Undo first.
  const ranked = [...SESSION].sort((a, b) => struggled(b).length - struggled(a).length || a - b);
  assert.deepEqual(ranked.slice(0, 2).sort((a, b) => a - b), [1, 9]);
  assert.ok(struggled(ranked[2]!).length < Math.min(struggled(1).length, struggled(9).length));
  assert.deepEqual([struggled(1).length, struggled(9).length], [4, 5]);
  const byGiveUps = Math.max(...SESSION.map((n) => quitters(n).length));
  assert.deepEqual(SESSION.filter((n) => quitters(n).length === byGiveUps), [3, 4]);
});

test('the session order covers every task once, and its groups are journeys of at most four', () => {
  assert.deepEqual([...SESSION].sort((a, b) => a - b), TASKS.map((t) => t.n));
  assert.deepEqual(GROUPS.flat(), SESSION);
  for (const g of GROUPS) assert.ok(g.length <= 4);
  // Order constraints the report states: 4 follows 3; 6 comes just before the list-view task 11;
  // the search task 10 comes before 7, which starts from search results.
  const at = (n: number) => SESSION.indexOf(n);
  assert.equal(at(4), at(3) + 1);
  assert.equal(at(11), at(6) + 1);
  assert.ok(at(10) < at(7));
});

test('scores follow the key from green 5 to black 1; gray has none and is left out of the journey', () => {
  assert.deepEqual(COLOURS.map((c) => SCORE[c]), [5, 4, 3, 2, 1, null]);
  for (const p of PARTICIPANTS)
    for (const n of SESSION) {
      const s = scoreOf(n, p);
      assert.ok(s === null || (Number.isInteger(s) && s >= 1 && s <= 5));
    }
  const p6 = journey('P6', 0).sections.flatMap((s) => s.tasks.map((t) => t.n));
  assert.deepEqual(p6, [1, 2, 4]);
});

test('every journey source parses as Mermaid, with no title and no task line over 40 characters or with a colon', () => {
  for (const p of PARTICIPANTS)
    GROUPS.forEach((_, g) => {
      const text = source(journey(p, g));
      assert.ok(parseRegisteredMermaid(text).ok, text);
      assert.doesNotMatch(text, /title/);
      for (const t of journey(p, g).sections.flatMap((s) => s.tasks)) {
        assert.ok(t.text.length <= 40, t.text);
        assert.doesNotMatch(t.text, /:/);
      }
    });
});

/** Apply edits with Agentic Mermaid's own mutate; true when the result serializes as `b` does. */
function replays(a: Journey, b: Journey): boolean {
  const parsed = parseRegisteredMermaid(source(a)),
    target = parseRegisteredMermaid(source(b));
  assert.ok(parsed.ok && target.ok);
  let model = parsed.value;
  for (const op of edits(a, b)) {
    const r = mutate(model, op as unknown as AnyMutationOp);
    assert.ok(r.ok, JSON.stringify(op));
    model = r.value;
  }
  return serializeMermaid(model) === serializeMermaid(target.value);
}

test('the edits from one group of tasks to the next replay through Agentic Mermaid to the next journey', () => {
  for (const p of PARTICIPANTS)
    for (let g = 0; g + 1 < GROUPS.length; g++) assert.ok(replays(journey(p, g), journey(p, g + 1)), `${p} ${g}`);
});

test('edits replay between any two journeys of the same actor', () => {
  const sections = ['Menu structure', 'Search', 'List view layout'] as const;
  const arb = fc.array(
    fc.record({
      label: fc.constantFrom(...sections),
      tasks: fc.array(fc.record({ n: fc.integer({ min: 1, max: 11 }), score: fc.integer({ min: 1, max: 5 }) }), { minLength: 1, maxLength: 4 }),
    }),
    { minLength: 1, maxLength: 3 },
  );
  const of = (raw: { label: (typeof sections)[number]; tasks: { n: number; score: number }[] }[], actor: Participant): Journey => ({
    actor,
    sections: raw.map((s) => ({ label: s.label, tasks: s.tasks.map((t) => ({ n: t.n, text: `${t.n} Task ${t.n}`, score: t.score })) })),
  });
  fc.assert(
    fc.property(arb, arb, fc.constantFrom(...PARTICIPANTS), (a, b, p) => replays(of(a, p), of(b, p))),
    params(200),
  );
});

// ---------------------------------------------------------------- journey words (explain/diagrams.ts)
await loadFonts();
const store = await readSnapshots('scenes/explainers/gnome-files/scene');
/** The group the scene's one journey shows: the one holding the participant's first give-up. */
const shownGroup = (p: Participant) => GROUPS.findIndex((g) => g.includes(gaveUp(p)[0]!));
const pinned = (p: Participant, g: number): DiagramSnapshot => {
  const s = Object.values(store).find((x) => x.family === 'journey' && x.spec.source === source(journey(p, g)));
  assert.ok(s, `no pinned journey for ${p}, group ${g}`);
  return s;
};
// No participant's first four tasks score the same throughout, so a fixture pins P3's middle four, all 5.
const flatStore = await readSnapshots('test/fixtures/journey-flat/scene');
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
