import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectExport } from '../tools/lib/explain-export-selection.ts';

const catalog: import('../tools/lib/explain-artifacts.ts').Catalog = {
  version: 1,
  product: { entry: { id: 'cache' } },
  totals: { explainers: 3, cases: 7, diagrams: 5, styles: 2, families: 2 },
  scenes: [
    { id: 'old', group: 'topic', cases: 2 },
    { id: 'cache', group: 'topic', cases: 3 },
    { id: 'small', group: 'toolchain', cases: 2, title: 'A small lesson', entry: { step: 'question', settings: { mode: 'one' } } },
  ],
};
const evidence: import('../tools/lib/explain-artifacts.ts').CatalogEvidence = {
  version: 2, checked: true, totals: catalog.totals,
  scenes: [
    { id: 'old', cases: [{}, {}], diagrams: 2, styles: ['a'], families: ['flowchart'] },
    { id: 'cache', cases: [{}, {}, {}], diagrams: 2, styles: ['a', 'b'], families: ['flowchart'] },
    { id: 'small', cases: [{}, {}], diagrams: 1, styles: ['b'], families: ['pie'] },
  ],
};

test('selection keeps catalog order, derives honest totals and removes unselected evidence', () => {
  const selected = selectExport('small,cache', catalog, evidence);
  assert.deepEqual(selected.ids, ['cache', 'small']);
  assert.deepEqual(selected.catalog.scenes.map(s => s.id), ['cache', 'small']);
  assert.deepEqual(selected.evidence.scenes.map(s => s.id), ['cache', 'small']);
  assert.deepEqual(selected.catalog.totals, { explainers: 2, cases: 5, diagrams: 3, styles: 2, families: 2 });
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
