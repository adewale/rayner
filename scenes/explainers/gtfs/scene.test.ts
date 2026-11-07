import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFonts } from '../../../explain/testing.ts';
import { fc, params } from '../../../test/lib/pbt.ts';
import { Scene } from '../../../src/index.ts';
import { NullSink } from '../../../src/output.ts';
import { Diagram } from '../../../explain/diagrams.ts';
import { readSnapshots } from '../../../tools/lib/explain-project.ts';
import { replayMorph } from '../../../integrations/agentic-mermaid/build/index.ts';
import { SAMPLE_FEED } from './feed.ts';
import { readFeed, tripsOn, addDays, dayChart, ganttSource, ganttEdits } from './model.ts';

// ------------------------------------------------------------------ ER words, on the pinned snapshot
await loadFonts();

const FEED = readFeed(SAMPLE_FEED);

// A service as calendar.txt and calendar_dates.txt can state it, for properties over any date.
const ymd = fc.date({ min: new Date(Date.UTC(2005, 0, 1)), max: new Date(Date.UTC(2012, 11, 31)), noInvalidDate: true }).map((d) => d.toISOString().slice(0, 10).replace(/-/g, ''));

const store = await readSnapshots('scenes/explainers/gtfs/scene');

const er = Object.values(store).find((s) => s.family === 'er');

async function shown() {
  assert.ok(er, 'the gtfs explainer pins an ER snapshot');
  const d = new Diagram(new Scene(new NullSink(), { skipUntil: Infinity }), er.spec, er, {});
  await d.build();
  return d;
}

/** Mermaid's crow's-foot markers, as the source writes them: the left one at the first entity. */
const MARKERS: Record<string, string> = { '||': 'exactly one', '|o': 'zero or one', 'o|': 'zero or one', '}o': 'zero or more', 'o{': 'zero or more', '}|': 'one or more', '|{': 'one or more' };

test('the day chart’s edits, replayed by Agentic Mermaid, turn any day’s chart into any other’s', () => {
  // The scene's three scenarios, then a sample of other pairs of dates.
  for (const date of ['20070604', '20070605', '20070609'])
    replayMorph({ source: ganttSource(FEED, addDays(date, -1)) }, { source: ganttSource(FEED, date) }, ganttEdits(FEED, addDays(date, -1), date));
  fc.assert(
    fc.property(ymd, ymd, (a, b) => {
      replayMorph({ source: ganttSource(FEED, a) }, { source: ganttSource(FEED, b) }, ganttEdits(FEED, a, b));
      // Two edits per trip whose running changes, none for the others.
      const changed = FEED.trips.filter((t) => tripsOn(FEED, a).includes(t) !== tripsOn(FEED, b).includes(t)).length;
      assert.equal(ganttEdits(FEED, a, b).length, 2 * changed);
      assert.equal(dayChart(FEED, b).flatMap((s) => s.trips).filter((t) => t.runs).length, tripsOn(FEED, b).length);
    }),
    params(40),
  );
});

test('an ER relationship is described by its label and what each crow’s-foot marker says, read from the source', async () => {
  const d = await shown();
  const seen = d.describe();
  assert.equal(seen.what, 'ER diagram: 7 entities, 6 relationships');
  assert.equal(seen.blank, undefined, 'every drawn part has words');
  const rels = [...er!.spec.source.matchAll(/^\s*(\w+) ([|}][|o]|[|o][|o])--([|o][|o{]|[|o]\{|o\{|\|\{) (\w+) : "([^"]*)"/gm)];
  assert.equal(rels.length, 6);
  for (const [, a, left, right, b, label] of rels) {
    const name = `${a} → ${b}: ${label} (each ${a} has ${MARKERS[right!]} ${b}, each ${b} has ${MARKERS[left!]} ${a})`;
    assert.ok(seen.parts.some((p) => p.name === name), `${name}\nnot in ${seen.parts.map((p) => p.name).join('\n')}`);
  }
  // The brief's example, verbatim.
  assert.ok(seen.parts.some((p) => p.name.includes('each TRIP has one or more STOP_TIME')));
  // An entity is named with its attributes as declared.
  assert.ok(seen.parts.some((p) => p.name === 'ROUTE: route_id (id), route_short_name (text)'));
  // A bare entity name finds the entity, as a participant's or a class's does.
  assert.equal(d.get('TRIP'), d.get('entity:TRIP'));
});

test('an ER relationship’s markers and label background belong to it: the label paints above its background', async () => {
  const d = await shown();
  for (const p of er!.parts.filter((p) => p.id.startsWith('rel:'))) {
    const rel = d.get(p.id);
    const family = rel.family();
    const bg = d.get(`rel-label:${p.id.slice(4)}:bg`),
      label = d.get(`rel-label:${p.id.slice(4)}`);
    // Inside the relationship's group; later in the family is painted later, so on top.
    assert.ok(family.includes(bg) && family.includes(label), p.id);
    assert.ok(family.indexOf(bg) < family.indexOf(label), `${p.id}: the background paints over its label`);
    for (const end of [1, 2]) assert.ok(family.includes(d.get(`card:${p.id.slice(4)}:${end}`)), `${p.id}: marker ${end}`);
  }
  // No marker or background is a part of its own: the description and dimming see the relationship.
  const top = [...d.parts.values()].filter((p) => !p.info.owner).map((p) => p.info.id);
  assert.deepEqual(top.filter((id) => /^(card|rel-label):/.test(id)), []);
  // A picture of the diagram copies it member for member: a part's drawing is at the part's index.
  const live = d.root.family();
  const drawn = (picture: { family(): ReturnType<typeof d.root.family> }, x: string) =>
    d.get(x).family().filter((m) => !m.children.length).map((m) => picture.family()[live.indexOf(m)]!);
  // Marking a relationship colours its markers too; its label keeps its ink.
  const id = 'rel:TRIP-STOP_TIME#0';
  const marked = d.picture({ [id]: '#ff0000' });
  assert.ok(drawn(marked, 'card:TRIP-STOP_TIME#0:2').every((m) => m.style.stroke === '#ff0000'));
  const ink = (picture: Parameters<typeof drawn>[0]) => drawn(picture, 'rel-label:TRIP-STOP_TIME#0').map((m) => m.style.fill);
  assert.deepEqual(ink(marked), ink(d.picture({})));
  // Dimming every part but two entities keeps the relationship between them, markers included.
  const opacity = (picture: Parameters<typeof drawn>[0], x: string) => drawn(picture, x).map((m) => m.style.opacity ?? 1);
  const plain = d.picture({}), dimmed = d.picture({}, { dim: ['entity:TRIP', 'entity:STOP_TIME'] });
  assert.deepEqual(opacity(dimmed, id), opacity(plain, id));
  const faded = opacity(plain, 'rel:ROUTE-TRIP#0');
  // (A link's invisible route path stays at opacity 0.)
  assert.ok(opacity(dimmed, 'rel:ROUTE-TRIP#0').every((o, i) => (faded[i] ? o < faded[i]! : o === 0)));
});
