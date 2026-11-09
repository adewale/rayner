import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPageId, selectExport, selectedIds } from '../tools/repo/lib/explain-export-selection.ts';

const catalog: import('../tools/lib/explain-artifacts.ts').Catalog = {
  version: 2,
  product: { entry: { id: 'cache' } },
  totals: { explainers: 3, scenarios: 7, diagrams: 5, styles: 2, families: 2 },
  scenes: [
    { id: 'old', group: 'topic', scenarios: 2 },
    { id: 'cache', group: 'topic', scenarios: 3 },
    { id: 'small', group: 'toolchain', scenarios: 2, title: 'A small lesson', entry: { step: 'question', settings: { mode: 'one' } } },
  ],
};
const evidence: import('../tools/lib/explain-artifacts.ts').CatalogEvidence = {
  version: 2, checked: true, totals: catalog.totals,
  scenes: [
    { id: 'old', scenarios: [{}, {}], diagrams: 2, styles: ['a'], families: ['flowchart'] },
    { id: 'cache', scenarios: [{}, {}, {}], diagrams: 2, styles: ['a', 'b'], families: ['flowchart'] },
    { id: 'small', scenarios: [{}, {}], diagrams: 1, styles: ['b'], families: ['pie'] },
  ],
};

test('selection keeps catalog order, derives honest totals and removes unselected evidence', () => {
  const selected = selectExport('small,cache', catalog, evidence);
  assert.deepEqual(selected.ids, ['cache', 'small']);
  assert.deepEqual(selected.catalog.scenes.map(s => s.id), ['cache', 'small']);
  assert.deepEqual(selected.evidence.scenes.map(s => s.id), ['cache', 'small']);
  assert.deepEqual(selected.catalog.totals, { explainers: 2, scenarios: 5, diagrams: 3, styles: 2, families: 2 });
  assert.deepEqual(selected.evidence.totals, selected.catalog.totals);
  assert.deepEqual(catalog.scenes.map(s => s.id), ['old', 'cache', 'small']);
});

test('selection rejects unknown, duplicate and empty inputs before exporting', () => {
  for (const [ids, message] of [
    ['cache,ghost', /unknown explainer.*ghost/],
    ['cache,cache', /duplicate.*cache/],
    ['', /empty/],
  ] as const) assert.throws(() => selectExport(ids, catalog, evidence), message);
  assert.throws(() => selectExport('cache', catalog, { ...evidence, scenes: evidence.scenes.slice(0, 2) }), /mismatch/);
});

test('a subset can omit the catalog introduction and choose its own entry', () => {
  const selected = selectExport('small,old', catalog, evidence);
  assert.deepEqual(selected.ids, ['old', 'small']);
  assert.deepEqual(selected.catalog.product.entry, { id: 'small', step: 'question', settings: { mode: 'one' }, label: 'A small lesson' });
  assert.equal(selectExport('old,small', catalog, evidence, 'old').catalog.product.entry.id, 'old');
  assert.throws(() => selectExport('old', catalog, evidence, 'cache'), /entry.*selected.*cache/);
  assert.equal(catalog.product.entry.id, 'cache');
});

test('page ids are unique in one site, ignoring case, and a scene\'s meta.id is its catalog id', () => {
  // A build of the catalog and an export of a built one both select through selectedIds.
  assert.throws(() => selectedIds(undefined, ['fork', 'cache', 'fork']), /^Error: site: the page id "fork" is listed twice/);
  assert.throws(() => selectedIds('cache', ['fork', 'cache', 'Fork']), /^Error: site: the page ids "fork" and "Fork" differ only in case/);
  const cased = structuredClone(catalog), casedEvidence = structuredClone(evidence);
  cased.scenes[2]!.id = casedEvidence.scenes[2]!.id = 'Cache';
  assert.throws(() => selectExport(undefined, cased, casedEvidence), /"cache" and "Cache" differ only in case/);
  assert.deepEqual(selectedIds(undefined, ['fork', 'cache']), ['fork', 'cache']);
  checkPageId('fork', 'fork');
  assert.throws(() => checkPageId('fork', 'spoon'), /^Error: site: scenes\/explainers\/fork has the meta\.id "spoon"/);
});
